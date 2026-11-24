'use strict';
// Service-worker update path (regression for "UI shows as raw text" after the 3.0 UI release).
// Phones run release N with the deployed v4 service worker; release N+1 is published to a server
// that, like GitHub Pages, sends `Cache-Control: max-age=600`. The v4 worker cached a stale
// index.html from the HTTP cache and kept serving it, pointing at stylesheets that no longer exist.
// The fixed worker must bring the phone to the new release after the user reopens the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };

function makeRelease(dir, { swSource, extraStylesheet, marker }) {
  fs.cpSync(path.join(ROOT, 'docs'), dir, { recursive: true });
  if (swSource) fs.writeFileSync(path.join(dir, 'sw.js'), swSource);
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<head>', `<head>\n  <meta name="release" content="${marker}" />`);
  if (extraStylesheet) { fs.writeFileSync(path.join(dir, extraStylesheet), 'body{outline:0}'); html = html.replace('</head>', `  <link rel="stylesheet" href="${extraStylesheet}" />\n</head>`); }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

async function scenario(newSw) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-upgrade-'));
  const v4 = fs.readFileSync(path.join(ROOT, 'tests', 'legacy', 'sw.v4.js'), 'utf8');
  makeRelease(path.join(tmp, 'n'), { swSource: v4, extraStylesheet: 'release-n-only.css', marker: 'N' });
  makeRelease(path.join(tmp, 'n1'), { swSource: newSw, marker: 'N+1' });
  let root = path.join(tmp, 'n');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/family-finance/, '');
    let f = path.join(root, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404, { 'cache-control': 'max-age=600' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/family-finance/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const open = async () => { const p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); await p.goto(base); await p.waitForTimeout(1500); return p; };
  const state = p => p.evaluate(() => ({ release: document.querySelector('meta[name="release"]')?.content, broken: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => { try { return !l.sheet || !l.sheet.cssRules.length; } catch { return true; } }).map(l => l.getAttribute('href')), styled: getComputedStyle(document.body).backgroundColor === 'rgb(245, 246, 248)' }));
  try {
    let p = await open();
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForTimeout(500);
    assert.equal((await state(p)).release, 'N');
    root = path.join(tmp, 'n1'); // publish release N+1 (release-n-only.css is gone)
    const seen = [];
    for (let i = 0; i < 3; i++) { await p.close(); p = await open(); seen.push(await state(p)); } // user closes and reopens the app
    return seen;
  } finally { await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('control: the deployed v4 service worker keeps serving the previous release (the bug)', async () => {
  const seen = await scenario(fs.readFileSync(path.join(ROOT, 'tests', 'legacy', 'sw.v4.js'), 'utf8').replace("family-finance-pages-v4", "family-finance-pages-v4b"));
  assert.equal(seen.at(-1).release, 'N', 'stale index.html still served after 3 reopens');
});

test('fixed service worker: phones on v4 reach the new release, fully styled, after reopening', async () => {
  const seen = await scenario(fs.readFileSync(path.join(ROOT, 'docs', 'sw.js'), 'utf8'));
  const last = seen.at(-1);
  assert.equal(last.release, 'N+1', 'new release served: ' + JSON.stringify(seen));
  assert.deepEqual(last.broken, [], 'every stylesheet loaded');
  assert.equal(last.styled, true, 'design tokens applied (no raw text)');
  assert.ok(seen.findIndex(s => s.release === 'N+1') >= 0, 'recovers within three reopens: ' + JSON.stringify(seen.map(s => s.release)));
});
