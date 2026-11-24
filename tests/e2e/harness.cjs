'use strict';
// Browser end-to-end harness: serves docs/ on localhost and routes the Apps Script
// endpoint to the REAL apps-script/*.gs code running on the in-memory Sheets emulation.
// Two browser contexts = two household devices sharing one spreadsheet.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { FakeSpreadsheet, loadBackend, backendFiles, ROOT } = require('../harness/apps-script-runtime.cjs');
const syn = require('../fixtures/synthetic.cjs');

const DOCS = path.join(ROOT, 'docs');
const ENDPOINT = 'https://script.google.com/macros/s/TEST_ONLY/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.normalize(path.join(DOCS, decodeURIComponent(url.pathname)));
      if (!file.startsWith(DOCS)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function createWorld({ seed = true, now = null } = {}) {
  const ss = new FakeSpreadsheet();
  if (seed) syn.seedSpreadsheet(ss, { txs: syn.transactions({ start: '2026-09', monthCount: 3, perMonth: 6 }) });
  const backend = loadBackend(backendFiles(), { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN }, fetchHandler: (url, opt) => world.aiHandler(url, opt) });
  const { server, base } = await serve();
  const browser = await chromium.launch();
  const world = {
    ss, backend, base, browser, devices: [], requests: [], offline: new Set(), dropResponse: new Set(),
    aiHandler: () => ({ status: 200, body: { choices: [{ message: { content: 'Trả lời mẫu từ trợ lý (giả lập).' } }] } }),
    async device(name, { serviceWorkers = 'block', viewport = { width: 412, height: 915 } } = {}) {
      const context = await browser.newContext({ serviceWorkers, viewport, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
      const errors = [];
      await context.route('https://script.google.com/**', async route => {
        const req = route.request();
        if (world.offline.has(name)) return route.abort('internetdisconnected');
        const params = Object.fromEntries(new URLSearchParams(req.postData() || ''));
        world.requests.push({ device: name, url: req.url(), method: req.method(), params });
        const result = backend.post(params);
        if (world.dropResponse.has(name)) { world.dropResponse.delete(name); return route.abort('connectionreset'); }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(result) });
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      page.on('dialog', d => (world.onDialog ? world.onDialog(d, name) : d.accept()));
      if (now) await page.clock.setFixedTime(new Date(now));
      const device = { name, context, page, errors };
      world.devices.push(device);
      return device;
    },
    async connect(device, { remember = false } = {}) {
      const { page } = device;
      await page.goto(base);
      await page.waitForSelector('#settingsOverlay.open');
      await page.fill('#endpointInput', ENDPOINT);
      await page.fill('#familyTokenInput', syn.TEST_TOKEN);
      if (remember) await page.check('#rememberConnection');
      await page.click('#saveEndpointBtn');
      await page.waitForFunction(() => document.querySelector('#syncPill b').textContent.includes('Đã đồng bộ'), null, { timeout: 15000 });
    },
    async close() { await browser.close(); server.close(); }
  };
  return world;
}

module.exports = { createWorld, ENDPOINT, serve };
