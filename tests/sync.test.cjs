'use strict';
// Sync engine and local-store adapter (TEST_PLAN §4 rules at unit level).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLegacy, memoryStorage } = require('./harness/legacy.cjs');
const syn = require('./fixtures/synthetic.cjs');
const plain = v => JSON.parse(JSON.stringify(v));

function load() {
  const ctx = vm.createContext({ Intl, Date });
  for (const f of ['src/sync/engine.js', 'src/data/local-store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8'), ctx);
  return { E: ctx.FFSync.engine, Data: ctx.FFData };
}
const { E, Data } = load();

test('transaction mapping and merge are identical to the legacy implementation', () => {
  const L = loadLegacy();
  const rnd = syn.prng(5);
  for (let round = 0; round < 40; round++) {
    const remote = syn.transactions({ seed: round + 1, monthCount: 2, perMonth: 5 }).map(t => ({ ...t, synced: true }));
    const local = remote.filter(() => rnd() < 0.5).map(t => ({ ...t, synced: rnd() < 0.5, amount: rnd() < 0.3 ? t.amount + 1 : t.amount, pendingUpdate: rnd() < 0.3 }));
    local.push({ id: 'local-' + round, date: '2026-11-01', type: 'Expense', amount: 5, category: 'food', synced: false });
    assert.deepEqual(plain(E.mergeSheetTransactions(remote, structuredClone(local))), plain(L.mergeSheetTransactions(remote, structuredClone(local))));
  }
  for (const v of ['2026-11-03T16:00:00.000Z', '2026-11-03', '2026-11-03T15:59:00.000Z', 'garbage', '', null])
    assert.equal(E.sheetDate(v), L.sheetDate(v));
  for (const row of [{ ID: 5, Amount: '7', Date: '2026-01-02' }, { id: 'x', amount: 0 }, {}])
    assert.deepEqual(plain(E.sheetRecord(row)), plain(L.sheetRecord(row)));
});

test('budget decision: adopt / conflict / push', () => {
  const remote = { values: { food: 1 }, revision: 'r2' };
  assert.equal(E.budgetDecision({ pending: null }, remote), 'adopt');
  assert.equal(E.budgetDecision({ pending: { values: { food: 1 }, baseRevision: 'r1' } }, remote), 'adopt', 'same values are not a conflict');
  assert.equal(E.budgetDecision({ pending: { values: { food: 2 }, baseRevision: 'r1' } }, remote), 'conflict');
  assert.equal(E.budgetDecision({ pending: { values: { food: 2 }, baseRevision: 'r2' } }, remote), 'push');
});

test('collections: edit keeps the original base revision; decisions; first-sync rebase only onto empty server', () => {
  let c = { ...E.emptyCollection(), values: [{ id: 'a' }], revision: 'r1' };
  c = E.editCollection(c, [{ id: 'a' }, { id: 'b' }]);
  c = E.editCollection(c, [{ id: 'b' }]);
  assert.equal(c.pending.baseRevision, 'r1', 'repeated offline edits keep the first base');
  assert.equal(E.collectionDecision(c, { available: true, values: [{ id: 'b' }], revision: 'r9' }), 'adopt');
  assert.equal(E.collectionDecision(c, { available: true, values: [], revision: 'r9' }), 'conflict');
  assert.equal(E.collectionDecision(c, { available: true, values: [], revision: 'r1' }), 'push');
  assert.equal(E.collectionDecision(c, { available: false }), 'unavailable');
  assert.equal(E.canonical([{ b: 1, a: 2, id: 'z' }, { id: 'y' }]), E.canonical([{ id: 'y' }, { id: 'z', a: 2, b: 1 }]), 'canonical ignores order');
  const fresh = E.editCollection(E.emptyCollection(), [{ id: 'n' }]);
  assert.equal(E.rebaseInitial(fresh, { available: true, values: [], revision: 'empty' }).pending.baseRevision, 'empty');
  assert.equal(E.rebaseInitial(fresh, { available: true, values: [{ id: 'other' }], revision: 'x' }).pending.baseRevision, null, 'never overwrite unseen server data');
});

test('operation view and status model', () => {
  const ops = E.pendingOperations({ transactions: [{ id: 'a', synced: false }, { id: 'b', synced: false, pendingUpdate: true, conflict: { remote: null } }, { id: 'c', synced: true }], pendingDeletes: ['d'], budgetState: { pending: { values: {}, baseRevision: 'r' }, remote: null }, ext: { collections: { assets: { pending: { values: [], baseRevision: null } }, recurring: { pending: { values: [] }, available: false } } } });
  assert.deepEqual(plain(ops.map(o => o.operationId)), ['delete:d', 'create:a', 'update:b', 'budgets:r', 'assets:new']);
  const st = o => E.syncStatus({ configured: true, operations: [], ...o }).state;
  assert.equal(E.syncStatus({ configured: false, operations: ops }).label, 'Chưa kết nối');
  assert.equal(st({ syncing: true }), 'syncing');
  assert.equal(st({ operations: ops }), 'conflict');
  assert.equal(st({ lastError: 'x', operations: [{}] }), 'failed');
  assert.equal(st({ operations: [{}] }), 'pending');
  assert.equal(st({ lastSyncOk: true }), 'synced');
  assert.equal(E.syncStatus({ configured: true, operations: [], lastSyncOk: true }).label, 'Đã đồng bộ');
  assert.equal(E.syncStatus({ configured: true, operations: [{}, {}] }).label, '2 thay đổi chờ gửi · Thử lại');
});

test('backup excludes credentials; CSV export is range-bound and formula-safe', () => {
  const b = E.localBackup({ transactions: [{ id: 'a', synced: false }], createdAt: '2026-11-24T00:00:00Z' });
  assert.equal(b.pendingOperations.length, 1);
  assert.ok(!JSON.stringify(b).match(/token|endpoint|script\.google/i));
  const csv = E.transactionsCsv([{ id: '1', date: '2026-10-31', type: 'Expense', amount: 5, note: 'old' }, { id: '2', date: '2026-11-02', type: 'Expense', amount: 7, category: 'food', person: 'Vợ', note: '=HYPERLINK("x"),"q"', synced: true }, { id: '3', date: '2026-11-03', note: '@sum', type: 'Income', amount: 1 }], '2026-11-01', '2026-11-30');
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3, 'header + rows in range only');
  assert.ok(lines[1].includes('"\'=HYPERLINK(""x""),""q"""'));
  assert.ok(lines[2].includes("'@sum"));
});

test('local store: legacy keys read in place, schema marker additive, inventory lists only app keys', () => {
  const storage = memoryStorage({ 'ffpages:family_finance_transactions_v1': '[{"id":"x"}]', 'ffpages:family_deleted_v2': '["y"]', 'other-app': '1' });
  const store = Data.createStore(storage);
  assert.deepEqual(plain(store.read(Data.KEYS.transactions, [])), [{ id: 'x' }]);
  assert.deepEqual(plain(store.migrate()), { from: null, to: 3 });
  assert.deepEqual(plain(store.migrate()), { from: 3, to: 3 }, 'idempotent');
  assert.deepEqual(plain(store.inventory()), ['family_deleted_v2', 'family_finance_transactions_v1', 'schema_version']);
  assert.equal(storage.getItem('ffpages:family_finance_transactions_v1'), '[{"id":"x"}]', 'legacy value untouched');
  storage.setItem('ffpages:broken', '{');
  assert.equal(store.read('broken', 'fallback'), 'fallback');
});
