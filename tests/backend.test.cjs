'use strict';
// Backend 3.0 additions: versioned migrations, ext_* collections, assistant_tool.
const test = require('node:test');
const assert = require('node:assert/strict');
const { backendFiles, loadBackend, FakeSpreadsheet } = require('./harness/apps-script-runtime.cjs');
const { auth } = require('./harness/contract-scenario.cjs');
const syn = require('./fixtures/synthetic.cjs');

function world(opts = {}) {
  const ss = syn.seedSpreadsheet(new FakeSpreadsheet(), { txs: syn.transactions({ start: '2026-08', monthCount: 4 }) });
  const rt = loadBackend(backendFiles(), { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN, DEEPSEEK_API_KEY: 'sk-synthetic-test-key', ...(opts.props || {}) }, fetchHandler: opts.fetchHandler, now: opts.now || '2026-11-24T03:00:00Z' });
  return { ss, rt };
}
const asset = (over = {}) => ({ id: 'a1', type: 'bank', name: 'Tài khoản tiết kiệm mẫu', currency: 'VND', acquisitionDate: '', acquisitionValue: '', currentValue: 150000000, valuationDate: '2026-11-01', ownershipShare: 1, notes: '=cmd', status: 'active', disposalDate: '', ...over });
const rule = (over = {}) => ({ id: 'rent', type: 'Expense', amount: 5000000, category: 'home', person: 'Gia đình', note: 'Tiền nhà', cadence: 'monthly', interval: 1, startDate: '2026-12-05', endDate: '', status: 'active', skipped: ['2027-01-05'], ...over });

test('migrations: dry-run writes nothing; apply is additive, logged, repeatable; header mismatch aborts before writes', () => {
  const { ss, rt } = world();
  const before = ss.getSheets().map(s => [s.getName(), s.dump()]);
  const dry = JSON.parse(rt.call('migrationsDryRun'));
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.results.map(r => r.status), ['pending', 'pending', 'pending']);
  assert.deepEqual(JSON.parse(JSON.stringify(ss.getSheets().map(s => [s.getName(), s.dump()]))), JSON.parse(JSON.stringify(before)), 'dry run changes nothing');
  const applied = JSON.parse(rt.call('migrationsApply'));
  assert.deepEqual(applied.results.map(r => r.status), ['applied-now', 'applied-now', 'applied-now']);
  for (const name of ['Assets', 'AssetValuations', 'RecurringRules', 'Debts', 'Migrations']) assert.ok(ss.getSheetByName(name), name);
  for (const [name, rows] of before) assert.deepEqual(ss.getSheetByName(name).dump(), JSON.parse(JSON.stringify(rows)), 'legacy sheet untouched: ' + name);
  const log = ss.getSheetByName('Migrations').dump();
  assert.equal(log.length, 4);
  assert.ok(!JSON.stringify(log).match(/syn-|Lương|\d{6,}/), 'log holds counts only, no amounts or records');
  const again = JSON.parse(rt.call('migrationsApply'));
  assert.deepEqual(again.results.map(r => r.status), ['applied', 'applied', 'applied'], 'rerun is a no-op');
  assert.equal(ss.getSheetByName('Migrations').dump().length, 4, 'no duplicate log rows');
  const { ss: ss2, rt: rt2 } = world();
  ss2.seed('Assets', [['id', 'something', 'else']]);
  assert.throws(() => rt2.call('migrationsApply'), /cấu trúc khác/);
  assert.equal(ss2.getSheetByName('RecurringRules'), null, 'aborted before any write');
  assert.equal(ss2.getSheetByName('Migrations'), null);
});

test('ext requests apply pending migrations by themselves (no manual step after a deploy); legacy actions never do', () => {
  const { ss, rt } = world();
  const legacyBefore = ['Transactions', 'Budgets', 'Loans', 'FinanceSettings'].map(n => ss.getSheetByName(n) && ss.getSheetByName(n).dump());
  assert.equal(rt.post(auth({ action: 'snapshot' })).ok, true);
  assert.equal(ss.getSheetByName('Debts'), null, 'core v3/APK traffic does not create sheets');
  const snap = rt.post(auth({ action: 'ext_snapshot' }));
  assert.equal(snap.ok, true); assert.equal(snap.migrationError, undefined);
  assert.deepEqual(snap.schema, ['2026-11-01-assets', '2026-11-02-recurring', '2026-11-25-debts']);
  for (const n of ['assets', 'valuations', 'recurring', 'debts']) assert.equal(snap.collections[n].available, true, n);
  assert.deepEqual(['Transactions', 'Budgets', 'Loans', 'FinanceSettings'].map(n => ss.getSheetByName(n) && ss.getSheetByName(n).dump()), legacyBefore, 'legacy sheets untouched');
  assert.equal(ss.getSheetByName('Migrations').dump().length, 4);
  rt.post(auth({ action: 'ext_snapshot' }));
  assert.equal(ss.getSheetByName('Migrations').dump().length, 4, 'later requests do nothing');
  // A sheet with the wrong structure: nothing is written, the app is told why, core sync still works.
  const { ss: ss2, rt: rt2 } = world();
  ss2.seed('Debts', [['something', 'else']]);
  const bad = rt2.post(auth({ action: 'ext_snapshot' }));
  assert.equal(bad.ok, false, 'Debts sheet with other headers is not read');
  assert.equal(ss2.getSheetByName('Assets'), null, 'aborted before any write');
  const bad2 = rt2.post(auth({ action: 'ext_save', collection: 'assets', values: '[]', revision: '' }));
  assert.equal(bad2.code, 'FEATURE_NOT_MIGRATED');
  assert.equal(rt2.post(auth({ action: 'snapshot' })).ok, true, 'core sync unaffected');
});

test('ext collections: round-trip, typed values, formula/date safety, revisions and COLLECTION_CONFLICT', () => {
  const { ss, rt } = world();
  rt.call('migrationsApply');
  const snap = rt.post(auth({ action: 'ext_snapshot' }));
  assert.equal(snap.ok, true); assert.equal(snap.extVersion, 1);
  assert.deepEqual(snap.schema, ['2026-11-01-assets', '2026-11-02-recurring', '2026-11-25-debts']);
  const rev0 = snap.collections.assets.revision;
  const tricky = asset({ id: 'a2', name: '2026-01-01', notes: '12345', currentValue: '', valuationDate: '', type: 'real-estate', ownershipShare: 0.5, acquisitionValue: 1e9, acquisitionDate: '2020-05-05' });
  const save = rt.post(auth({ action: 'ext_save', collection: 'assets', values: JSON.stringify([asset(), tricky]), revision: rev0 }));
  assert.equal(save.ok, true, JSON.stringify(save));
  const got = save.collection.values;
  assert.deepEqual(got, [asset(), tricky].map(a => ({ ...a })), 'values read back identically (date-like/numeric text stays text)');
  assert.equal(ss.getSheetByName('Assets').dump()[1][9], '=cmd', 'formula text stored literally, not evaluated');
  const replay = rt.post(auth({ action: 'ext_save', collection: 'assets', values: JSON.stringify([tricky, asset()]), revision: rev0 }));
  assert.equal(replay.ok, true, 'same content with stale revision is idempotent');
  const stale = rt.post(auth({ action: 'ext_save', collection: 'assets', values: JSON.stringify([asset({ currentValue: 1 })]), revision: rev0 }));
  assert.equal(stale.code, 'COLLECTION_CONFLICT');
  assert.equal(stale.collection.values.length, 2, 'conflict returns server copy');
  for (const [values, re] of [[[asset({ ownershipShare: 2 })], /ownershipShare/], [[asset(), asset()], /Trùng mã/], [[asset({ type: 'yacht' })], /type/]]) {
    const r = rt.post(auth({ action: 'ext_save', collection: 'assets', values: JSON.stringify(values), revision: save.collection.revision }));
    assert.equal(r.ok, false); assert.match(r.error, re);
  }
  assert.match(rt.post(auth({ action: 'ext_save', collection: 'Transactions', values: '[]' })).error, /không được hỗ trợ/);
  const recRev = rt.post(auth({ action: 'ext_snapshot' })).collections.recurring.revision;
  const r1 = rt.post(auth({ action: 'ext_save', collection: 'recurring', values: JSON.stringify([rule()]), revision: recRev }));
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(r1.collection.values[0], rule(), 'skipped list and integers round-trip');
  const vRev = rt.post(auth({ action: 'ext_snapshot' })).collections.valuations.revision;
  const v = rt.post(auth({ action: 'ext_save', collection: 'valuations', values: JSON.stringify([{ id: 'v1', assetId: 'a1', valuationDate: '2026-11-20', value: 151000000, sourceType: 'statement', note: '' }]), revision: vRev }));
  assert.equal(v.ok, true);
  const shrink = rt.post(auth({ action: 'ext_save', collection: 'assets', values: JSON.stringify([asset()]), revision: save.collection.revision }));
  assert.equal(shrink.collection.values.length, 1, 'removing an item clears its row');
  assert.equal(ss.getSheetByName('Assets').getLastRow(), 2);
  const dRev = rt.post(auth({ action: 'ext_snapshot' })).collections.debts.revision;
  const debt = { id: 'd1', type: 'personal', name: '=Vay anh Hai', currency: 'VND', balance: 50000000, balanceDate: '2026-11-20', startDate: '2026-01-15', status: 'active', paidDate: '', notes: '0123' };
  const d = rt.post(auth({ action: 'ext_save', collection: 'debts', values: JSON.stringify([debt]), revision: dRev }));
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.deepEqual(d.collection.values[0], debt, 'debt round-trips; formula-like name and numeric-looking notes stay text');
  for (const [bad, re] of [[{ balance: -1 }, /balance/], [{ status: 'paid' }, /paidDate/], [{ type: 'mortgage' }, /type/]]) {
    const r = rt.post(auth({ action: 'ext_save', collection: 'debts', values: JSON.stringify([{ ...debt, ...bad }]), revision: d.collection.revision }));
    assert.equal(r.ok, false); assert.match(r.error, re);
  }
});

test('migrations: a spreadsheet already on assets + recurring gains only the Debts sheet', () => {
  const { ss, rt } = world();
  rt.call('migrationsApply');
  // Roll the fake spreadsheet back to "assets + recurring applied, debts not yet".
  ss.sheets.delete('Debts');
  const log = ss.getSheetByName('Migrations'); log.rows = log.rows.filter(r => r[0] !== '2026-11-25-debts');
  const assetsBefore = ss.getSheetByName('Assets').dump();
  const dry = JSON.parse(rt.call('migrationsDryRun'));
  assert.deepEqual(dry.results.map(r => r.status), ['applied', 'applied', 'pending']);
  const applied = JSON.parse(rt.call('migrationsApply'));
  assert.deepEqual(applied.results.map(r => r.status), ['applied', 'applied', 'applied-now']);
  assert.deepEqual(ss.getSheetByName('Debts').dump(), [['id', 'type', 'name', 'currency', 'balance', 'balanceDate', 'startDate', 'status', 'paidDate', 'notes', 'UpdatedAt']]);
  assert.deepEqual(ss.getSheetByName('Assets').dump(), assetsBefore, 'existing 3.0 sheets untouched');
});

test('assistant_tool: allowlisted deterministic tools, grounded payload, provider failure keeps data', () => {
  let lastPayload = null;
  const { rt } = world({ fetchHandler: (url, opt) => { lastPayload = JSON.parse(opt.payload); return { status: 200, body: { choices: [{ message: { content: 'Giải thích.' } }] } }; } });
  for (const tool of ['summary', 'expense_analysis', 'budget_status', 'loan_position', 'forecast']) {
    const r = rt.post(auth({ action: 'assistant_tool', tool, month: '2026-10', question: 'Giải thích', context: '{}' }));
    assert.equal(r.ok, true, tool + ' ' + JSON.stringify(r).slice(0, 200));
    assert.equal(r.tool.tool, tool); assert.ok(r.tool.provenance); assert.ok(r.tool.coverage);
    assert.equal(r.answer, 'Giải thích.');
    const user = lastPayload.messages[1].content;
    assert.ok(user.startsWith('KẾT QUẢ CÔNG CỤ: '));
    assert.ok(!/syn-\d|Siêu thị|Chợ sáng/.test(user), 'no IDs or notes sent to the model');
    assert.match(lastPayload.messages[0].content, /không thể tạo, sửa hay xóa/);
  }
  const sim = rt.post(auth({ action: 'assistant_tool', tool: 'repayment_simulation', context: JSON.stringify({ simulation: { principal: 100000000, annualRate: 0.1, startMonth: '2027-01', monthlyPrincipal: 10000000, extraMonthly: 5000000 } }) }));
  assert.ok(sim.tool.data.comparison.interestSaved > 0);
  assert.match(rt.post(auth({ action: 'assistant_tool', tool: 'delete_all' })).error, /không được hỗ trợ/);
  assert.match(rt.post(auth({ action: 'assistant_tool', tool: 'summary', context: '{bad' })).error, /không hợp lệ/);
  const { rt: down } = world({ fetchHandler: () => ({ status: 503, body: {} }) });
  const r = down.post(auth({ action: 'assistant_tool', tool: 'summary', month: '2026-10' }));
  assert.equal(r.ok, true); assert.equal(r.answer, null);
  assert.equal(r.answerError, 'DeepSeek HTTP 503: DeepSeek đang quá tải.');
  assert.equal(typeof r.tool.data.expense, 'number', 'deterministic data still returned');
  const { rt: noProvider } = world({ props: { AI_PROVIDER: 'other' } });
  assert.match(noProvider.post(auth({ action: 'assistant_tool', tool: 'summary' })).answerError, /AI_PROVIDER/);
});

test('reconciliation report is metadata for private use and is not reachable over HTTP', () => {
  const { rt } = world();
  const report = JSON.parse(rt.call('reconciliationReport'));
  assert.equal(report.transactionRows, report.uniqueIds);
  assert.ok(report.byMonth['2026-09'].rows > 0);
  assert.equal(report.loanRowsByBank.Techcombank, 1, 'Techcombank rows from 2026-11 excluded');
  for (const action of ['reconciliationReport', 'migrationsApply', 'runMigrations', 'setup']) assert.match(rt.post(auth({ action })).error, /không được hỗ trợ/);
});
