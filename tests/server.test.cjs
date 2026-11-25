'use strict';
// The VM server (server/) runs the same backend on Node against the Google Sheets API.
// These tests replay request sequences through BOTH paths — the Apps Script emulation and the
// server with an in-memory Sheets REST API — and require identical responses and sheet contents.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const scenario = require('./harness/contract-scenario.cjs');
const { FakeSpreadsheet, loadBackend, backendFiles } = require('./harness/apps-script-runtime.cjs');
const { FakeSheetsApi } = require('./harness/fake-sheets-api.cjs');
const syn = require('./fixtures/synthetic.cjs');
const { createBackend } = require('../server/gas-runtime');
const { createApp, tokenMatches } = require('../server/index');
const W = require('../server/workbook');

const T = syn.TEST_TOKEN;
const quiet = { log() {}, warn() {}, error() {} };
const trim = rows => { const out = rows.map(r => { const a = r.slice(); while (a.length && (a[a.length - 1] === '' || a[a.length - 1] == null)) a.pop(); return a; }); while (out.length && !out[out.length - 1].length) out.pop(); return out; };

function worlds({ seed = true, properties = { FAMILY_ACCESS_TOKEN: T }, fetchHandler = null, now = null } = {}) {
  const ss = new FakeSpreadsheet(), api = new FakeSheetsApi();
  if (seed) {
    const txs = syn.transactions({ monthCount: 3, perMonth: 4 });
    syn.seedSpreadsheet(ss, { txs });
    syn.seedSpreadsheet({ seed: (name, rows) => api.seed(name, rows) }, { txs });
  }
  const gas = loadBackend(backendFiles(), { spreadsheet: ss, properties, fetchHandler, now });
  const fetchImpl = fetchHandler ? async (url, opt) => { const r = fetchHandler(url, { ...opt, payload: opt.body }); return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }; } : async () => { throw new Error('fetch disabled'); };
  const server = createBackend({ sheets: api, properties, fetchImpl, log: quiet, now });
  const post = async p => JSON.parse(await server.handle('POST', p));
  return { ss, api, gas, server, post };
}
function sameSheets(w, names) {
  for (const name of names || w.ss.getSheets().map(s => s.getName())) {
    const a = trim(w.ss.getSheetByName(name).dump()), b = trim(w.api.dump(name));
    const strip = rows => (name === 'Budgets' || /^(Assets|AssetValuations|RecurringRules|Debts|Migrations)$/.test(name) ? rows.map(r => r.slice(0, name === 'Budgets' ? 2 : name === 'Migrations' ? 1 : -1)) : rows);
    assert.deepEqual(strip(b), strip(a), name);
  }
  assert.deepEqual(w.api.titles().slice().sort(), w.ss.getSheets().map(s => s.getName()).sort(), 'same sheets');
}

test('server answers the full v3 contract scenario exactly like the Apps Script backend', async () => {
  const w = worlds();
  let revision = null;
  for (const step of scenario.steps()) {
    const a = step.params ? w.gas.post(step.params) : w.gas.get();
    const b = step.params ? await w.post(step.params) : JSON.parse(await w.server.handle('GET', {}));
    assert.deepEqual(b, a, step.label);
    if (a.budgets && a.budgets.revision) revision = a.budgets.revision;
  }
  const valid = { ...syn.budgets(), food: 4200000, '2026-12:loan-payment': -1 };
  for (const params of [{ action: 'save_budgets', values: JSON.stringify(valid), revision }, { action: 'save_budgets', values: JSON.stringify(valid), revision }, { action: 'save_budgets', values: JSON.stringify({ ...valid, food: 1 }), revision }]) {
    assert.deepEqual(await w.post(scenario.auth(params)), w.gas.post(scenario.auth(params)));
  }
  sameSheets(w, ['Transactions', 'Budgets', 'Loans', 'FinanceSettings']);
});

test('3.0 collections: auto-migration, saves, conflicts and validation match', async () => {
  const w = worlds();
  const steps = [];
  const add = p => steps.push(scenario.auth(p));
  add({ action: 'ext_snapshot' });
  add({ action: 'ext_snapshot' });
  const asset = { id: 'a1', type: 'bank', name: '=Tiết kiệm', currency: 'VND', acquisitionDate: '2025-01-02', acquisitionValue: 1000000, currentValue: 1500000, valuationDate: '2026-11-01', ownershipShare: 1, notes: '+note', status: 'active', disposalDate: '' };
  for (const s of steps) assert.deepEqual(await w.post(s), w.gas.post(s));
  const snap = w.gas.post(scenario.auth({ action: 'ext_snapshot' }));
  await w.post(scenario.auth({ action: 'ext_snapshot' }));
  const rev = snap.collections.assets.revision;
  const more = [
    { action: 'ext_save', collection: 'assets', values: JSON.stringify([asset]), revision: rev },
    { action: 'ext_save', collection: 'assets', values: JSON.stringify([asset]), revision: 'stale' },
    { action: 'ext_save', collection: 'assets', values: JSON.stringify([{ ...asset, currentValue: 9 }]), revision: 'stale' },
    { action: 'ext_save', collection: 'assets', values: JSON.stringify([{ ...asset, id: '' }]), revision: rev },
    { action: 'ext_save', collection: 'nope', values: '[]', revision: '' },
    { action: 'ext_save', collection: 'recurring', values: JSON.stringify([{ id: 'r1', type: 'Expense', amount: 3500000, category: 'kids', person: 'Gia đình', note: 'Học phí', cadence: 'monthly', interval: 1, startDate: '2026-11-26', endDate: '', status: 'active', skipped: ['2026-12-26'] }]), revision: snap.collections.recurring.revision },
    { action: 'ext_save', collection: 'debts', values: JSON.stringify([{ id: 'd1', type: 'family', name: 'Nợ mẫu', currency: 'VND', balance: 20000000, balanceDate: '2026-11-01', startDate: '', status: 'active', paidDate: '', notes: '' }]), revision: snap.collections.debts.revision },
    { action: 'ext_snapshot' }
  ];
  for (const p of more) {
    const a = w.gas.post(scenario.auth(p)), b = await w.post(scenario.auth(p));
    // UpdatedAt timestamps are written per request; compare everything else.
    assert.deepEqual(b, a, p.action + ' ' + p.collection);
  }
  // Shrinking a collection clears the old rows.
  const r2 = w.gas.post(scenario.auth({ action: 'ext_snapshot' })).collections.assets.revision;
  const p = scenario.auth({ action: 'ext_save', collection: 'assets', values: '[]', revision: r2 });
  assert.deepEqual(await w.post(p), w.gas.post(p));
  sameSheets(w);
});

test('assistant actions call the AI provider once per request and match the Apps Script answer', async () => {
  let calls = 0;
  const handler = (url, opt) => { calls++; assert.equal(url, 'https://api.deepseek.com/chat/completions'); assert.match(String(opt.headers.Authorization), /^Bearer sk-synthetic/); return { status: 200, body: { choices: [{ message: { content: ' Câu trả lời ' } }] } }; };
  const w = worlds({ properties: { FAMILY_ACCESS_TOKEN: T, DEEPSEEK_API_KEY: 'sk-synthetic-test-key' }, fetchHandler: handler, now: '2026-11-20T03:00:00Z' });
  for (const p of [
    { action: 'chat_scoped', question: 'Tổng quan tháng này', context: JSON.stringify({ viewMonth: '2026-07' }) },
    { action: 'assistant_tool', tool: 'summary', month: '2026-06', question: '' },
    { action: 'assistant_tool', tool: 'budget_status', month: '2026-06', question: 'Ngân sách?' },
    { action: 'assistant_tool', tool: 'forecast', month: '2026-07', context: JSON.stringify({ months: 3 }) },
    { action: 'assistant_tool', tool: 'unknown' }
  ]) {
    const before = calls;
    const a = w.gas.post(scenario.auth(p));
    const gasCalls = calls - before;
    const b = await w.post(scenario.auth(p));
    assert.deepEqual(b, a, p.action + ' ' + (p.tool || ''));
    assert.equal(calls - before - gasCalls, gasCalls, 'same number of provider calls');
  }
  assert.equal(w.api.calls.batchUpdate, 0, 'assistant never writes');
});

test('a provider failure is reported without hiding the tool result', async () => {
  const w = worlds({ properties: { FAMILY_ACCESS_TOKEN: T, DEEPSEEK_API_KEY: 'sk-synthetic-test-key' }, fetchHandler: () => ({ status: 402, body: {} }), now: '2026-11-20T03:00:00Z' });
  const p = scenario.auth({ action: 'assistant_tool', tool: 'summary', month: '2026-06' });
  const b = await w.post(p);
  assert.deepEqual(b, w.gas.post(p));
  assert.match(b.answerError, /402/);
});

test('empty spreadsheet: setup creates the legacy sheets like Apps Script', async () => {
  const w = worlds({ seed: false });
  const p = scenario.auth({ action: 'snapshot' });
  assert.deepEqual(await w.post(p), w.gas.post(p));
  assert.deepEqual(trim(w.api.dump('Transactions')), trim(w.ss.getSheetByName('Transactions').dump()));
  assert.deepEqual(trim(w.api.dump('Budgets')).map(r => r.slice(0, 2)), trim(w.ss.getSheetByName('Budgets').dump()).map(r => r.slice(0, 2)));
  assert.equal(w.api.sheet('Budgets').frozen, 1);
});

test('reads and writes per request stay small; wrong tokens never touch Sheets', async () => {
  const w = worlds();
  await w.post({ action: 'snapshot', token: 'x'.repeat(31), nativeVersion: '3' });
  assert.deepEqual(w.api.calls, { getMetadata: 0, getSheetData: 0, batchUpdate: 0 });
  await w.post(scenario.auth({ action: 'snapshot' }));
  assert.deepEqual(w.api.calls, { getMetadata: 1, getSheetData: 1, batchUpdate: 0 });
  await w.post(scenario.auth({ action: 'v3_create', ...scenario.tx('n-1') }));
  assert.deepEqual(w.api.calls, { getMetadata: 2, getSheetData: 2, batchUpdate: 1 });
  assert.equal(JSON.parse(await w.server.handle('GET', { build: '1' })).build, 'dev');
});

test('a failed Sheets write returns an error and changes nothing', async () => {
  const w = worlds();
  w.api.failNextBatch = new Error('Google Sheets 500: backend error');
  const before = w.api.dump('Transactions');
  await assert.rejects(w.server.handle('POST', scenario.auth({ action: 'v3_create', ...scenario.tx('f-1') })), /500/);
  assert.deepEqual(w.api.dump('Transactions'), before);
  // Retrying succeeds and is idempotent.
  assert.equal((await w.post(scenario.auth({ action: 'v3_create', ...scenario.tx('f-1') }))).ok, true);
  assert.equal((await w.post(scenario.auth({ action: 'v3_create', ...scenario.tx('f-1') }))).ok, true);
  assert.equal(w.api.dump('Transactions').filter(r => r[0] === 'f-1').length, 1);
});

test('dates: serial numbers and time zones round-trip', () => {
  const tz = 'Asia/Ho_Chi_Minh';
  const d = W.coerce('2026-11-24', tz, Date);
  assert.equal(W.formatDate(d, tz, 'yyyy-MM-dd'), '2026-11-24');
  assert.equal(d.toISOString(), '2026-11-23T17:00:00.000Z');
  assert.equal(W.msToSerial(d.getTime(), tz), 46350);
  assert.equal(W.serialToMs(46350, tz), d.getTime());
  assert.equal(W.formatDate(new Date(W.serialToMs(46350.5, tz)), tz, 'yyyy-MM-dd HH:mm:ss'), '2026-11-24 12:00:00');
  for (const zone of ['America/New_York', 'Europe/Berlin', 'UTC']) {
    const x = W.coerce('2026-03-29', zone, Date);
    assert.equal(W.formatDate(x, zone, 'yyyy-MM-dd HH:mm'), '2026-03-29 00:00', zone);
    assert.equal(W.serialToMs(W.msToSerial(x.getTime(), zone), zone), x.getTime(), zone);
  }
  assert.equal(W.coerce('2026-02-30', tz, Date), '2026-02-30');
  assert.equal(W.coerce("'2026-02-03", tz, Date), '2026-02-03');
  assert.equal(W.coerce('0123', tz, Date), 123);
  assert.equal(W.coerce('2026-11-24T03:00:00.000Z', tz, Date), '2026-11-24T03:00:00.000Z');
  assert.deepEqual(W.toCell('=1+1', tz), { userEnteredValue: { stringValue: '=1+1' } }, 'text is never a formula');
});

test('real date-formatted cells (e.g. a Loans month typed as a date) read as dates', async () => {
  const w = worlds();
  w.api.seed('Loans', [['Bank', 'Month', 'Principal', 'Rate', 'Interest', 'Days'], ['Shinhan', '2026-10-01', 900000000, 0.075, 5000000, 31]]);
  const res = await w.post(scenario.auth({ action: 'snapshot' }));
  assert.deepEqual(res.loans.records, [{ bank: 'Shinhan', month: '2026-10', principal: 900000000, rate: 0.075, interest: 5000000, days: 31 }]);
});

function listen(server) { return new Promise(r => server.listen(0, '127.0.0.1', () => r('http://127.0.0.1:' + server.address().port))); }

test('HTTP: one origin serves the web app and the API', async t => {
  const w = worlds();
  const app = createApp({ backend: w.server, properties: { FAMILY_ACCESS_TOKEN: T }, log: quiet });
  const base = await listen(app);
  t.after(() => app.close());
  let r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.match(await r.text(), /manifest\.webmanifest/);
  assert.equal((await fetch(base + '/sw.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  for (const bad of ['/../package.json', '/%2e%2e/package.json', '/..%2fserver/index.js', '/nope.js']) assert.equal((await fetch(base + bad)).status, 404, bad);
  r = await fetch(base + '/api?build=1');
  assert.deepEqual(await r.json(), { ok: true, apiVersion: 3, build: 'dev' });
  const body = new URLSearchParams({ action: 'snapshot', token: T, nativeVersion: '3', webVersion: '1' });
  r = await fetch(base + '/api', { method: 'POST', body });
  const snap = await r.json();
  assert.equal(snap.ok, true);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(snap.transactions.length, w.gas.post(scenario.auth({ action: 'snapshot' })).transactions.length);
  // Concurrent writes are serialised: no lost rows.
  await Promise.all(Array.from({ length: 6 }, (_, i) => fetch(base + '/api', { method: 'POST', body: new URLSearchParams(scenario.auth({ action: 'v3_create', ...scenario.tx('par-' + i) })) })));
  assert.equal(w.api.dump('Transactions').filter(row => String(row[0]).startsWith('par-')).length, 6);
});

test('HTTP: repeated wrong tokens are throttled', async t => {
  const w = worlds();
  const app = createApp({ backend: w.server, properties: { FAMILY_ACCESS_TOKEN: T }, log: quiet });
  const base = await listen(app);
  t.after(() => app.close());
  const bad = () => fetch(base + '/api', { method: 'POST', body: new URLSearchParams({ action: 'snapshot', token: 'y'.repeat(30), nativeVersion: '3' }) });
  for (let i = 0; i < 20; i++) assert.equal((await bad()).status, 200);
  assert.equal((await bad()).status, 429);
  assert.equal(tokenMatches(T, T), true);
  assert.equal(tokenMatches(T, T + 'x'), false);
  assert.equal(tokenMatches('short', 'short'), false);
});
