'use strict';
// W0 characterization: pins the observable behaviour of the PRE-3.0 code (frozen
// in tests/legacy). These assertions document legacy rules; refactored code is
// compared against the same oracle in parity.test.cjs and contract.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLegacy } = require('./harness/legacy.cjs');
const scenario = require('./harness/contract-scenario.cjs');
const syn = require('./fixtures/synthetic.cjs');

const schedule = syn.loanSchedule();

test('budget: base limits, month-scoped overrides and -1 loan-payment sentinel', () => {
  const L = loadLegacy();
  const b = syn.budgets();
  const at = m => JSON.parse(JSON.stringify(L.limitsAt(b, m)));
  assert.equal(at('2026-07').food, 4000000);
  assert.equal(at('2026-08').food, 4500000, 'override applies from its month');
  assert.equal(at('2027-03').food, 4500000, 'override persists to later months');
  assert.equal(at('2026-09')['loan-payment'], 9000000);
  assert.equal(at('2026-10')['loan-payment'], 9000000);
  assert.equal('loan-payment' in at('2026-11'), false, '-1 sentinel removes the manual loan budget');
  assert.equal(at('2026-12').transport, 1500000);
  assert.equal(at('2026-07').home, 0, 'zero budget preserved as zero');
  assert.equal(L.budgetLevel(65, 100), 'green');
  assert.equal(L.budgetLevel(66, 100), 'yellow');
  assert.equal(L.budgetLevel(90, 100), 'red');
  assert.equal(L.budgetLevel(1, 0), 'unset');
});

test('loans: tracked banks, Techcombank exclusion from 2026-11, missing schedule is incomplete', () => {
  const L = loadLegacy({ loanSchedule: schedule });
  assert.deepEqual([...L.trackedBanks('2026-10')], ['Shinhan', 'Techcombank']);
  assert.deepEqual([...L.trackedBanks('2026-11')], ['Shinhan']);
  const oct = L.homeLoanSummary('2026-10');
  const shinhan = schedule.records.find(r => r.bank === 'Shinhan' && r.month === '2026-10');
  const tcb = schedule.records.find(r => r.bank === 'Techcombank' && r.month === '2026-10');
  assert.equal(oct.missing, false);
  assert.equal(oct.total, 2000000 + shinhan.interest + tcb.interest, 'file interest + extra debt');
  const nov = L.homeLoanSummary('2026-11');
  assert.equal(nov.rows.length, 1);
  const sep = L.homeLoanSummary('2026-09');
  assert.equal(sep.missing, true);
  assert.equal(sep.missingNote, '09/2026: chưa có lịch vay; dữ liệu bắt đầu từ 10/2026.');
  assert.equal(sep.total, 2000000, 'legacy total counts only extra debt when schedule missing (flagged missing)');
  const gap = L.homeLoanSummary('2027-02');
  assert.equal(gap.missing, false, 'Techcombank not tracked after 2026-11 so its gap is not missing');
  const empty = loadLegacy().homeLoanSummary('2026-12');
  assert.equal(empty.missing, true);
  assert.equal(empty.missingNote, '12/2026: chưa có lịch Shinhan.');
});

test('loans: Techcombank forecast path uses 365-day count and fixed 909,400 principal', () => {
  const L = loadLegacy();
  const row = { bank: 'Techcombank', month: '2026-12', principal: 100000000, rate: 0.09, interest: 1, days: 31 };
  const f = L.calculateLoanPayment(row, { forecast: 12, actual: {} });
  assert.equal(f.rateType, 'Dự đoán');
  assert.equal(f.rate, 0.12);
  assert.equal(f.interest, 100000000 * 0.12 * 31 / 365);
  assert.equal(f.principalPayment, 909400);
  assert.equal(f.payment, f.interest + 909400);
  const a = L.calculateLoanPayment(row, { forecast: 12, actual: { '2026-12': 10 } });
  assert.equal(a.rateType, 'Thực tế');
  assert.equal(a.rate, 0.1);
  const early = L.calculateLoanPayment({ ...row, month: '2026-11' }, { forecast: 12, actual: {} });
  assert.equal(early.payment, 1);
  assert.equal(early.rateType, 'Theo file');
  assert.equal(L.calculateLoanPayment({ bank: 'Shinhan', month: '2027-05', interest: 7 }, { forecast: 12, actual: {} }).payment, 7);
});

test('cash flow: monthly totals, dashboard trend, weekly buckets and accumulated savings', () => {
  const L = loadLegacy();
  const txs = syn.transactions();
  L.set('transactions', txs); L.set('activeMonth', new Date(2026, 6, 1));
  const t = L.totals();
  const july = txs.filter(x => x.date.startsWith('2026-07'));
  assert.equal(t.income, july.filter(x => x.type === 'Income').reduce((s, x) => s + x.amount, 0));
  assert.equal(t.expense, july.filter(x => x.type === 'Expense').reduce((s, x) => s + x.amount, 0));
  const d = L.dashboardData(txs, '2026-09', 3);
  assert.equal(d.start, '2026-07');
  assert.equal(d.trend.length, 3);
  assert.equal(d.averageExpense, d.expense / 3);
  const weeks = L.weeklySpending(txs, '2026-09', '2026-09', '2026-09-20');
  assert.equal(weeks[0].start, '2026-09-01');
  assert.equal(weeks.at(-1).end, '2026-09-20', 'stops at today');
  const s = L.accumulatedSavings(txs, '2026-12-31');
  assert.equal(s.start, '2026-08-26');
  assert.equal(s.savings, s.income - s.expense);
  assert.equal(L.accumulatedSavings([], '2026-12-31').savings, null, 'no income → unknown, not zero');
});

test('sync merge: remote wins when equal, conflict flagged for unsynced divergent create, pending update kept', () => {
  const L = loadLegacy();
  const remote = [{ id: 'a', date: '2026-11-01', type: 'Expense', amount: 1, category: 'food', person: 'Vợ', note: '', synced: true }, { id: 'b', date: '2026-11-01', type: 'Expense', amount: 2, category: 'food', person: 'Vợ', note: '', synced: true }, { id: 'c', date: '2026-11-01', type: 'Expense', amount: 3, category: 'food', person: 'Vợ', note: '', synced: true }];
  const local = [{ ...remote[0], synced: false }, { ...remote[1], amount: 20, synced: false }, { ...remote[2], amount: 30, synced: false, pendingUpdate: true }, { id: 'd', date: '2026-11-02', type: 'Income', amount: 4, category: 'salary', synced: false }];
  const merged = JSON.parse(JSON.stringify(L.mergeSheetTransactions(remote, local)));
  assert.equal(merged.find(t => t.id === 'a').synced, true);
  assert.equal(merged.find(t => t.id === 'b').conflict.remote.amount, 2);
  assert.equal(merged.find(t => t.id === 'c').amount, 30);
  assert.equal(merged.find(t => t.id === 'd').synced, false);
  assert.equal(L.sheetDate('2026-11-03T16:00:00.000Z'), '2026-11-04', 'UTC+8 midnight serialisation recovered');
  assert.equal(L.sheetDate('2026-11-03'), '2026-11-03');
  const rec = L.sheetRecord({ ID: 5, Amount: '7', Date: '2026-01-02' });
  assert.equal(rec.id, '5'); assert.equal(rec.amount, 7); assert.equal(rec.category, 'other'); assert.equal(rec.person, 'Gia đình');
});

test('history search: accent-insensitive, numeric exact, near-word typo tolerance', () => {
  const L = loadLegacy();
  const t = { note: 'Siêu thị A', category: 'grocery', type: 'Expense', person: 'Vợ', date: '2026-11-02', amount: 150000 };
  assert.equal(L.matchesHistory(t, L.searchTokens('sieu thi')), true);
  assert.equal(L.matchesHistory(t, L.searchTokens('150k')), true);
  assert.equal(L.matchesHistory(t, L.searchTokens('15000')), false);
  assert.equal(L.matchesHistory(t, L.searchTokens('sieuu')), true);
  assert.equal(L.swipeDestination('home', -60, 2, 300), 'history');
  assert.equal(L.swipeDestination('home', 60, 2, 300), null);
});

test('backend v3 contract (legacy Code.gs): auth, validation, idempotency, conflicts', () => {
  const { transcript, sheets } = scenario.run(['tests/legacy/Code.legacy.gs']);
  const r = Object.fromEntries(transcript.map(t => [t.label, t.res]));
  assert.equal(r.get.apiVersion, 3);
  for (const k of ['no token', 'wrong token']) assert.match(r[k].error, /Mã kết nối/);
  for (const k of ['old client', 'wrong nativeVersion']) assert.match(r[k].error, /APK 2\.3\.0/);
  assert.deepEqual(Object.keys(r['snapshot initial']).sort(), ['apiVersion', 'assistantKnowledgeVersion', 'budgets', 'loans', 'ok', 'transactions', 'webVersion']);
  assert.ok(r['snapshot initial'].loans.records.every(x => !(x.bank === 'Techcombank' && x.month >= '2026-11')));
  assert.equal(sheets.Transactions.filter(row => row[0] === 'c-1').length, 1, 'create replay does not duplicate');
  for (const k of Object.keys(r).filter(k => k.startsWith('validate ') && k !== 'validate amount at limit')) assert.equal(r[k].ok, false, k);
  assert.equal(r['update without base'].code, 'TX_CONFLICT');
  assert.equal(r['update stale base'].remote.Amount, 125000);
  assert.equal(r['update ok'].ok, true);
  assert.equal(r['update type change'].error, 'Không thể đổi loại giao dịch.');
  assert.equal(r['update missing row'].remote, null);
  assert.equal(sheets.Transactions.find(row => row[0] === 'c-3')[7], '=HYPERLINK("y")', 'formula text stored literally');
  assert.equal(sheets.Transactions.find(row => row[0] === 'c-4')[7].length, 2000, 'note truncated to 2000');
  assert.equal(r['delete replay'].deleted, true);
  assert.equal(r['budgets stale revision'].code, 'BUDGET_CONFLICT');
  assert.equal(r['budgets save ok'].ok, true);
  assert.equal(r['budgets save same values with stale revision'].ok, true, 'identical values are not a conflict');
  assert.equal(r['budgets other device stale'].code, 'BUDGET_CONFLICT');
});
