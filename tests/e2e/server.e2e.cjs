'use strict';
// The VM deployment end to end: the real server (server/index.js) serves the PWA and the API from
// one origin, backed by the in-memory Sheets REST API. The user enters only the family token.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { FakeSheetsApi } = require('../harness/fake-sheets-api.cjs');
const syn = require('../fixtures/synthetic.cjs');
const { createBackend } = require('../../server/gas-runtime');
const { createApp } = require('../../server/index');

const quiet = { log() {}, warn() {}, error() {} };

test('served by the VM: connect with the token only, sync, create, edit and 3.0 sheets', async () => {
  const api = new FakeSheetsApi();
  syn.seedSpreadsheet({ seed: (n, r) => api.seed(n, r) }, { txs: syn.transactions({ start: '2026-09', monthCount: 3, perMonth: 6 }) });
  const backend = createBackend({ sheets: api, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN }, log: quiet });
  const server = createApp({ backend, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN }, log: quiet });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 412, height: 915 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(base);
    await page.waitForSelector('#settingsView.active');
    assert.equal(await page.inputValue('#endpointInput'), base + 'api', 'endpoint defaults to this server');
    await page.fill('#familyTokenInput', syn.TEST_TOKEN);
    await page.click('#saveEndpointBtn');
    await page.waitForFunction(() => document.querySelector('#syncPill b').textContent.includes('Đã đồng bộ'), null, { timeout: 15000 });
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1') || '[]'));
    assert.equal(local.length, api.dump('Transactions').length - 1, 'all sheet rows downloaded');

    await page.click('.nav-add');
    await page.waitForSelector('#entryOverlay.open');
    await page.fill('#amountInput', '98000');
    await page.fill('#noteInput', 'VM e2e');
    await page.click('#submitEntry');
    await page.waitForFunction(() => document.querySelector('#syncPill b').textContent === 'Đã đồng bộ', null, { timeout: 15000 });
    const row = api.dump('Transactions').find(r => r[7] === 'VM e2e');
    assert.ok(row, 'row written to Google Sheets');
    assert.equal(row[4], 98000);
    assert.match(row[2], /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(api.sheet('Transactions').cells.find(c => c[7] && c[7].v && c[7].v.stringValue === 'VM e2e')[2].fmt, 'DATE', 'date stored as a real date');

    // 3.0 collections: the first ext sync creates the new sheets.
    await page.evaluate(async () => { await retryUnsynced(); await syncWithSheet(true); });
    await page.waitForFunction(() => document.querySelector('#syncPill b').textContent === 'Đã đồng bộ');
    for (const name of ['Assets', 'AssetValuations', 'RecurringRules', 'Debts', 'Migrations']) assert.ok(api.sheet(name), name + ' created');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
