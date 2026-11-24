'use strict';
// API compatibility gate (API_COMPATIBILITY.md §4): the refactored, multi-file backend must
// answer the full v3 request set exactly like the frozen pre-3.0 Code.gs, and leave the
// spreadsheet in exactly the same state. This is the APK 2.3.0 compatibility proxy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const scenario = require('./harness/contract-scenario.cjs');
const { backendFiles, loadBackend, FakeSpreadsheet, ROOT } = require('./harness/apps-script-runtime.cjs');
const syn = require('./fixtures/synthetic.cjs');

test('refactored backend reproduces every legacy v3 response and sheet mutation', () => {
  const legacy = scenario.run(['tests/legacy/Code.legacy.gs']);
  const current = scenario.run(backendFiles());
  assert.equal(current.transcript.length, legacy.transcript.length);
  for (let i = 0; i < legacy.transcript.length; i++) assert.deepEqual(current.transcript[i], legacy.transcript[i], legacy.transcript[i].label);
  for (const name of ['Transactions', 'Budgets', 'Loans', 'FinanceSettings']) assert.deepEqual(current.sheets[name], legacy.sheets[name], name);
  assert.deepEqual(Object.keys(current.sheets).sort(), Object.keys(legacy.sheets).sort(), 'no new sheets created by v3 traffic');
});

test('legacy sheet setup on an empty spreadsheet is unchanged', () => {
  const run = files => { const ss = new FakeSpreadsheet(); const rt = loadBackend(files, { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN } }); const res = rt.post(scenario.auth({ action: 'snapshot' })); return JSON.parse(JSON.stringify({ res, sheets: ss.getSheets().map(s => [s.getName(), s.dump().map(r => r.slice(0, 2))]) })); };
  assert.deepEqual(run(backendFiles()), run(['tests/legacy/Code.legacy.gs']));
});

test('unconfigured token and missing token property behave like legacy', () => {
  for (const props of [{}, { FAMILY_ACCESS_TOKEN: 'short' }]) {
    const a = loadBackend(backendFiles(), { properties: props }).post(scenario.auth({ action: 'snapshot' }));
    const b = loadBackend(['tests/legacy/Code.legacy.gs'], { properties: props }).post(scenario.auth({ action: 'snapshot' }));
    assert.deepEqual(a, b);
    assert.match(a.error, /FAMILY_ACCESS_TOKEN/);
  }
});

test('chat_scoped request/response contract and key boundary unchanged', () => {
  const handler = () => ({ status: 200, body: { choices: [{ message: { content: ' Câu trả lời ' } }], usage: { total_tokens: 5 } } });
  const run = files => {
    const ss = syn.seedSpreadsheet(new FakeSpreadsheet());
    const rt = loadBackend(files, { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN, DEEPSEEK_API_KEY: 'sk-synthetic-test-key' }, fetchHandler: handler, now: '2026-11-20T03:00:00Z' });
    const res = rt.post(scenario.auth({ action: 'chat_scoped', question: 'Tổng quan ngân sách tháng 10/2026 trả nợ', context: JSON.stringify({ viewMonth: '2026-10', loan: { month: '2026-10', total: 123, incomplete: true } }) }));
    return JSON.parse(JSON.stringify({ res, sent: rt.fetches.map(f => ({ url: f.url, headers: f.options.headers, payload: JSON.parse(f.options.payload) })), logs: rt.logs }));
  };
  const a = run(backendFiles()), b = run(['tests/legacy/Code.legacy.gs']);
  assert.deepEqual(a, b);
  assert.equal(a.res.answer, 'Câu trả lời');
  assert.ok(!JSON.stringify(a.res).includes('sk-synthetic'), 'key never returned');
  assert.ok(!a.logs.join('\n').includes('sk-synthetic') && !a.logs.join('\n').includes(syn.TEST_TOKEN), 'key/token never logged');
  for (const [status, files] of [[401, backendFiles()], [401, ['tests/legacy/Code.legacy.gs']]]) {
    const rt = loadBackend(files, { spreadsheet: syn.seedSpreadsheet(new FakeSpreadsheet()), properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN, DEEPSEEK_API_KEY: 'k' }, fetchHandler: () => ({ status, body: {} }) });
    assert.equal(rt.post(scenario.auth({ action: 'chat_scoped', question: 'x', context: '{}' })).error, 'DeepSeek HTTP 401: API key không hợp lệ.');
  }
});

test('apps-script/Domain.gs is generated from docs/src/domain (no drift)', () => {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-apps-script.cjs'), '--check'], { stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps-script', 'files.json'), 'utf8'));
  for (const f of manifest) assert.ok(fs.existsSync(path.join(ROOT, 'apps-script', f)), f);
  const onDisk = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.gs'));
  assert.deepEqual(onDisk.sort(), manifest.slice().sort(), 'every deployed .gs file is listed in files.json');
});

test('deployable single-file bundle (apps-script/dist/Code.gs) answers APK/v3 traffic exactly like legacy Code.gs', () => {
  const legacy = scenario.run(['tests/legacy/Code.legacy.gs']);
  const bundle = scenario.run(['apps-script/dist/Code.gs']);
  assert.equal(bundle.transcript.length, legacy.transcript.length);
  for (let i = 0; i < legacy.transcript.length; i++) assert.deepEqual(bundle.transcript[i], legacy.transcript[i], legacy.transcript[i].label);
  assert.deepEqual(bundle.sheets, legacy.sheets, 'identical sheet contents');
});

test('deployable bundle: 3.0 extras work (migrations, ext collections, assistant tool) and v3 stays intact afterwards', () => {
  const ss = syn.seedSpreadsheet(new FakeSpreadsheet());
  const rt = loadBackend(['apps-script/dist/Code.gs'], { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN, DEEPSEEK_API_KEY: 'k' }, fetchHandler: () => ({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }), now: '2026-11-24T03:00:00Z' });
  assert.equal(JSON.parse(rt.call('migrationsDryRun')).dryRun, true);
  assert.deepEqual(JSON.parse(rt.call('migrationsApply')).results.map(r => r.status), ['applied-now', 'applied-now', 'applied-now']);
  const snap = rt.post(scenario.auth({ action: 'ext_snapshot' }));
  assert.equal(snap.collections.assets.available, true);
  const saved = rt.post(scenario.auth({ action: 'ext_save', collection: 'recurring', values: JSON.stringify([{ id: 'r1', type: 'Expense', amount: 1000, category: 'home', person: 'Gia đình', note: '', cadence: 'monthly', interval: 1, startDate: '2026-12-01', endDate: '', status: 'active', skipped: [] }]), revision: snap.collections.recurring.revision }));
  assert.equal(saved.ok, true);
  assert.equal(rt.post(scenario.auth({ action: 'assistant_tool', tool: 'summary', month: '2026-10' })).answer, 'ok');
  const v3 = rt.post(scenario.auth({ action: 'snapshot' }));
  assert.deepEqual(Object.keys(v3).sort(), ['apiVersion', 'assistantKnowledgeVersion', 'budgets', 'loans', 'ok', 'transactions', 'webVersion'], 'APK snapshot shape unchanged after migration');
  assert.equal(rt.post(scenario.auth({ action: 'v3_create', ...scenario.tx('after-migration') })).ok, true);
});
