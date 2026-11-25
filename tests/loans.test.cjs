'use strict';
// Loans entered in the app: domain tracking rules for added loans, and the loan_save action on both
// backends (Apps Script emulation and the VM server on the Sheets REST fake), which must agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeSpreadsheet, loadBackend, backendFiles } = require('./harness/apps-script-runtime.cjs');
const { FakeSheetsApi } = require('./harness/fake-sheets-api.cjs');
const scenario = require('./harness/contract-scenario.cjs');
const syn = require('./fixtures/synthetic.cjs');
const D = require('./harness/domain.cjs').loadDomain();
const { createBackend } = require('../server/gas-runtime');

const quiet = { log() {}, warn() {}, error() {} };
const plain = v => JSON.parse(JSON.stringify(v));

test('domain: an added loan is tracked from its first to its last month; legacy banks unchanged', () => {
  const schedule = { ...syn.loanSchedule(), records: syn.loanSchedule().records.concat([
    { bank: 'Vietcombank', month: '2027-01', principal: 100000000, rate: 0.08, interest: 1500000, days: 31 },
    { bank: 'Vietcombank', month: '2027-03', principal: 96000000, rate: 0.08, interest: 1450000, days: 31 }
  ]) };
  assert.deepEqual([...D.loan.trackedBanks('2026-12', schedule)], ['Shinhan']);
  assert.deepEqual([...D.loan.trackedBanks('2027-01', schedule)], ['Shinhan', 'Vietcombank']);
  assert.deepEqual([...D.loan.trackedBanks('2027-04', schedule)], ['Shinhan']);
  assert.deepEqual([...D.loan.trackedBanks('2026-10')], ['Shinhan', 'Techcombank'], 'no schedule → legacy list');
  const jan = D.loan.loanSummary(schedule, '2027-01', D.loan.normalizeRates(null));
  const legacyJan = D.loan.loanSummary(syn.loanSchedule(), '2027-01', D.loan.normalizeRates(null));
  assert.equal(jan.total, legacyJan.total + 1500000);
  const feb = D.loan.loanSummary(schedule, '2027-02', D.loan.normalizeRates(null));
  assert.equal(feb.missing, true, 'gap inside the added loan is missing, not zero');
  assert.match(feb.missingNote, /Vietcombank/);
  assert.equal(D.loan.liabilityAt(schedule, '2027-03').total, D.loan.liabilityAt(syn.loanSchedule(), '2027-03').total + 96000000);
  const rows = D.loan.loanScheduleRows(schedule);
  assert.deepEqual(plain(rows.filter(r => r.bank === 'Vietcombank').map(r => [r.month, !!r.missing])), [['2027-01', false], ['2027-02', true], ['2027-03', false]]);
  const long = { ...schedule, records: schedule.records.concat([{ bank: 'Vietcombank', month: '2031-06', principal: 1, rate: 0.08, interest: 1, days: 30 }]) };
  assert.equal(D.loan.scheduleEnd(long), '2031-06');
  assert.equal(D.loan.loanScheduleRows(long).at(-1).month, '2031-06', 'schedule extends past 2030 for added loans');
  assert.equal(D.loan.scheduleEnd(syn.loanSchedule()), '2030-12');
});

function worlds({ loans = true } = {}) {
  const ss = new FakeSpreadsheet(), api = new FakeSheetsApi(), txs = syn.transactions({ monthCount: 2, perMonth: 3 });
  syn.seedSpreadsheet(ss, { txs, loans });
  syn.seedSpreadsheet({ seed: (n, r) => api.seed(n, r) }, { txs, loans });
  const gas = loadBackend(backendFiles(), { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN } });
  const server = createBackend({ sheets: api, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN }, log: quiet });
  const both = async p => { const params = scenario.auth({ action: 'loan_save', changes: JSON.stringify(p) }); const a = gas.post(params), b = JSON.parse(await server.handle('POST', params)); assert.deepEqual(b, a); return a; };
  return { ss, api, gas, server, both };
}
const row = (bank, month, over = {}) => ({ bank, month, principal: 100000000, rate: 0.08, interest: 1500000, days: 31, ...over });

test('loan_save: add, batch, edit with base, replay, conflict, delete — identical on both backends', async () => {
  const w = worlds();
  // New loan, 3 months in one batch.
  let r = await w.both([0, 1, 2].map(i => ({ op: 'upsert', row: row('Vietcombank', ['2027-01', '2027-02', '2027-03'][i], { principal: 100000000 - i * 2000000 }), base: null })));
  assert.equal(r.ok, true);
  assert.equal(r.loans.records.filter(x => x.bank === 'Vietcombank').length, 3);
  // Replaying the same request is a no-op success.
  r = await w.both([{ op: 'upsert', row: row('Vietcombank', '2027-01'), base: null }]);
  assert.equal(r.ok, true);
  // Fill a missing legacy month (no base) and edit an existing one (with base).
  const shinhan = syn.loanSchedule().records.find(x => x.bank === 'Shinhan' && x.month === '2026-12');
  r = await w.both([{ op: 'upsert', row: { ...shinhan, interest: 5600000 }, base: shinhan }, { op: 'upsert', row: row('Shinhan', '2028-04', { principal: 810000000, rate: 0.075, interest: 5200000, days: 30 }), base: null }]);
  assert.equal(r.ok, true);
  assert.equal(r.loans.records.find(x => x.bank === 'Shinhan' && x.month === '2026-12').interest, 5600000);
  // Stale base → conflict, nothing written (all-or-nothing even with a valid second change).
  const before = w.api.dump('Loans');
  r = await w.both([{ op: 'upsert', row: row('Vietcombank', '2027-04'), base: null }, { op: 'upsert', row: { ...shinhan, interest: 1 }, base: shinhan }]);
  assert.equal(r.ok, false); assert.equal(r.code, 'LOAN_CONFLICT'); assert.ok(r.loans.records.length);
  assert.deepEqual(w.api.dump('Loans'), before, 'nothing written on conflict');
  // Someone else created the row meanwhile → conflict for a "new" row with different values.
  r = await w.both([{ op: 'upsert', row: row('Vietcombank', '2027-02', { interest: 9 }), base: null }]);
  assert.equal(r.code, 'LOAN_CONFLICT');
  // Delete with the right base.
  const feb = r.loans.records.find(x => x.bank === 'Vietcombank' && x.month === '2027-02');
  r = await w.both([{ op: 'delete', row: { bank: 'Vietcombank', month: '2027-02' }, base: feb }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.loans.records.filter(x => x.bank === 'Vietcombank').map(x => x.month), ['2027-01', '2027-03']);
  // Text cells stay text (month never becomes a date, bank never a number).
  const vcb = w.api.sheet('Loans').cells.find(c => c[0] && c[0].v.stringValue === 'Vietcombank');
  assert.deepEqual(vcb[1].v, { stringValue: '2027-01' });
  // Final sheets equal on both backends.
  assert.deepEqual(w.api.dump('Loans'), w.ss.getSheetByName('Loans').dump().map(r2 => { const a = r2.slice(); while (a.length && a[a.length - 1] === '') a.pop(); return a; }));
});

test('loan_save: validation and rules', async () => {
  const w = worlds();
  for (const [changes, re] of [
    ['not json', /không hợp lệ/],
    [[], /không hợp lệ/],
    [[{ op: 'upsert', row: row('', '2027-01'), base: null }], /1–40 ký tự/],
    [[{ op: 'upsert', row: row('A|B', '2027-01'), base: null }], /1–40 ký tự/],
    [[{ op: 'upsert', row: row('X', '2026-09'), base: null }], /10\/2026/],
    [[{ op: 'upsert', row: row('Techcombank', '2026-11'), base: null }], /Techcombank/],
    [[{ op: 'upsert', row: row('X', '2027-01', { rate: 1.5 }), base: null }], /Lãi suất/],
    [[{ op: 'upsert', row: row('X', '2027-01', { days: 0 }), base: null }], /Số ngày/],
    [[{ op: 'upsert', row: row('X', '2027-01', { principal: -1 }), base: null }], /Dư nợ/],
    [[{ op: 'upsert', row: row('X', '2027-01'), base: null }, { op: 'upsert', row: row('X', '2027-01'), base: null }], /Trùng/]
  ]) {
    const params = scenario.auth({ action: 'loan_save', changes: typeof changes === 'string' ? changes : JSON.stringify(changes) });
    const a = w.gas.post(params), b = JSON.parse(await w.server.handle('POST', params));
    assert.deepEqual(b, a); assert.equal(a.ok, false); assert.match(a.error, re);
  }
  assert.equal(w.api.calls.batchUpdate, 0, 'nothing written for invalid input');
});

test('loan_save creates the Loans sheet when missing, and keeps extra columns in place', async () => {
  const w = worlds({ loans: false });
  let r = await w.both([{ op: 'upsert', row: row('Vietcombank', '2027-01'), base: null }]);
  assert.equal(r.ok, true);
  assert.deepEqual(w.api.dump('Loans')[0], ['Bank', 'Month', 'Principal', 'Rate', 'Interest', 'Days']);
  const w2 = worlds();
  const rows = syn.loanRows().map((x, i) => x.concat([i ? 'ghi chú ' + i : 'Note']));
  w2.api.seed('Loans', rows); w2.ss.seed('Loans', rows);
  const first = syn.loanSchedule().records[0];
  r = await w2.both([{ op: 'upsert', row: { ...first, interest: 1234 }, base: first }]);
  assert.equal(r.ok, true);
  assert.deepEqual(w2.api.dump('Loans')[1], ['Shinhan', '2026-10', first.principal, first.rate, 1234, first.days, 'ghi chú 1']);
});

test('APK-era snapshot of loans is unchanged by the new rules (contract)', () => {
  const ss = syn.seedSpreadsheet(new FakeSpreadsheet());
  const a = loadBackend(backendFiles(), { spreadsheet: ss, properties: { FAMILY_ACCESS_TOKEN: syn.TEST_TOKEN } }).post(scenario.auth({ action: 'snapshot' }));
  assert.deepEqual(plain(a.loans), plain(syn.loanSchedule()));
});
