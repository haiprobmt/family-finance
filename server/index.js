#!/usr/bin/env node
'use strict';
// Family Finance server: serves the web app (docs/) and the API (POST /api) from one origin.
// Storage stays in the family's Google Sheet, read and written through the Google Sheets API.
// No dependencies; Node.js 20+.
//
// Environment (see deploy/family-finance.env.example):
//   SPREADSHEET_ID                  the id in the spreadsheet URL (/d/<id>/edit)
//   GOOGLE_APPLICATION_CREDENTIALS  path to a service-account key JSON (spreadsheet shared with it)
//   FAMILY_ACCESS_TOKEN             the family connection code (≥ 24 characters)
//   DEEPSEEK_API_KEY, AI_PROVIDER   optional, for the assistant
//   HOST (127.0.0.1), PORT (8080), TRUST_PROXY (1 behind Caddy/nginx on the same machine)
//
// CLI: node server/index.js --check          verify Google Sheets access and exit
//      node server/index.js --run <function> run a backend function (e.g. migrationsDryRun)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createBackend } = require('./gas-runtime');
const { createSheetsClient } = require('./sheets-api');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const MAX_BODY = 8 * 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
// Read-only actions that may call the AI provider for a while; they do not take the write lock.
const UNLOCKED_ACTIONS = new Set(['chat_scoped', 'assistant_tool']);

function buildId() {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try { return fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8').trim() || 'dev'; } catch { return 'dev'; }
}

// One write at a time, like LockService in Apps Script.
function createMutex() {
  let tail = Promise.resolve();
  return fn => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };
}

// Failed-token throttle per client address.
function createThrottle({ limit = 20, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return {
    blocked(ip) { const h = hits.get(ip); return !!h && h.until > Date.now() && h.count >= limit; },
    fail(ip) { const now = Date.now(), h = hits.get(ip); if (!h || h.until < now) hits.set(ip, { count: 1, until: now + windowMs }); else h.count++; if (hits.size > 10000) hits.clear(); }
  };
}

function tokenMatches(expected, got) {
  const a = crypto.createHash('sha256').update(String(expected || '')).digest(), b = crypto.createHash('sha256').update(String(got || '')).digest();
  return String(expected || '').length >= 24 && crypto.timingSafeEqual(a, b);
}

function createApp({ backend, properties, trustProxy = false, log = console, docs = DOCS }) {
  const lock = createMutex(), throttle = createThrottle();
  const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin' };
  const send = (res, status, headers, body) => { res.writeHead(status, { ...security, ...headers }); res.end(body); };
  const sendJson = (res, text, status = 200) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, text);
  const clientIp = req => (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function api(req, res, url) {
    const parameter = Object.fromEntries(url.searchParams);
    if (req.method === 'GET') return sendJson(res, await backend.handle('GET', parameter));
    if (req.method !== 'POST') return send(res, 405, { Allow: 'GET, POST' }, '');
    const ip = clientIp(req);
    if (throttle.blocked(ip)) return sendJson(res, JSON.stringify({ ok: false, error: 'Nhập sai mã kết nối quá nhiều lần. Thử lại sau 10 phút.' }), 429);
    const type = String(req.headers['content-type'] || '');
    const body = await readBody(req);
    if (type.includes('application/json')) Object.assign(parameter, JSON.parse(body || '{}'));
    else for (const [k, v] of new URLSearchParams(body)) parameter[k] = v;
    if (!tokenMatches(properties.FAMILY_ACCESS_TOKEN, parameter.token)) throttle.fail(ip);
    const run = () => backend.handle('POST', parameter);
    const started = Date.now();
    const text = UNLOCKED_ACTIONS.has(parameter.action) ? await run() : await lock(run);
    log.log(new Date().toISOString(), 'POST', String(parameter.action || '-').slice(0, 30), JSON.parse(text).ok ? 'ok' : 'error', (Date.now() - started) + 'ms');
    return sendJson(res, text);
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, '');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, {}, 'bad request'); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(docs, rel));
    if (!file.startsWith(docs + path.sep) || path.basename(file).startsWith('.')) return send(res, 404, { 'Content-Type': 'text/plain' }, 'not found');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { 'Content-Type': 'text/plain' }, 'not found');
      const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
      // Always revalidate: the service worker and pages must never mix two releases.
      const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, 'Content-Length': st.size };
      if (req.headers['if-none-match'] === etag) return send(res, 304, { ETag: etag, 'Cache-Control': 'no-cache' }, '');
      res.writeHead(200, { ...security, ...headers });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://local'); } catch { return send(res, 400, {}, 'bad request'); }
    try {
      if (url.pathname === '/api' || url.pathname === '/exec') return await api(req, res, url);
      if (url.pathname === '/healthz') return sendJson(res, JSON.stringify({ ok: true }));
      return serveStatic(req, res, url);
    } catch (error) {
      if (error.status === 413) return sendJson(res, JSON.stringify({ ok: false, error: 'Dữ liệu gửi lên quá lớn.' }), 413);
      log.error(new Date().toISOString(), 'request failed:', error.message);
      // 200 + ok:false so the app shows the message and keeps local drafts for retry.
      return sendJson(res, JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 500) }));
    }
  });
}

function configFromEnv(env = process.env) {
  return {
    spreadsheetId: env.SPREADSHEET_ID,
    credentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS || '',
    properties: { FAMILY_ACCESS_TOKEN: env.FAMILY_ACCESS_TOKEN || '', DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || '', AI_PROVIDER: env.AI_PROVIDER || '' },
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 8080),
    trustProxy: env.TRUST_PROXY === '1'
  };
}

async function main(argv) {
  const cfg = configFromEnv();
  const sheets = createSheetsClient({ spreadsheetId: cfg.spreadsheetId, credentialsFile: cfg.credentialsFile });
  const backend = createBackend({ sheets, properties: cfg.properties, buildId: buildId() });
  if (argv[0] === '--check') {
    const meta = await sheets.getMetadata();
    console.log('Google Sheets OK via ' + sheets.describe() + ': "' + meta.title + '" (' + meta.timeZone + '), sheets: ' + meta.sheets.map(s => s.title).join(', '));
    if (String(cfg.properties.FAMILY_ACCESS_TOKEN).length < 24) console.log('WARNING: FAMILY_ACCESS_TOKEN is missing or shorter than 24 characters; the app cannot connect.');
    return;
  }
  if (argv[0] === '--run') { console.log(await backend.runFunction(argv[1])); return; }
  const server = createApp({ backend, properties: cfg.properties, trustProxy: cfg.trustProxy });
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port ' + cfg.port + ' on ' + cfg.host + ' is already used by another program. Set another PORT in /etc/family-finance/env.' : 'Server error: ' + e.message); process.exit(1); });
  server.listen(cfg.port, cfg.host, () => console.log('Family Finance (build ' + buildId() + ') on http://' + cfg.host + ':' + cfg.port + ' · Sheets via ' + sheets.describe()));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });

module.exports = { createApp, configFromEnv, tokenMatches };
