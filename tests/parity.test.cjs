'use strict';
// W1 parity: extracted domain functions must reproduce the frozen legacy outputs exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLegacy } = require('./harness/legacy.cjs');
const { loadDomain, plain } = require('./harness/domain.cjs');
const syn = require('./fixtures/synthetic.cjs');

const D = loadDomain();
const seeds = [1, 2, 3, 7, 11, 42, 99, 123];
const monthsToCheck = syn.months('2026-04', 16);
const rateSets = [null, { forecast: 9.5, actual: { '2026-12': 8, '2027-01': 'x', '2027-02': 101 } }, { forecast: -3, actual: null }];

function scheduleVariant(seed) {
  const s = syn.loanSchedule(), rnd = syn.prng(seed);
  // Randomly drop rows to create gaps; add Techcombank rows past 2026-11 to exercise the 365/909,400 path.
  s.records = s.records.filter(() => rnd() > 0.15);
  for (const m of ['2026-12', '2027-01', '2027-02']) if (rnd() > 0.3) s.records.push({ bank: 'Techcombank', month: m, principal: 250000000 + Math.round(rnd() * 1e7), rate: 0.09, interest: 1234567, days: 30 + Math.round(rnd()) });
  s.extraDebt = Math.round(rnd() * 5) * 1000000;
  return s;
}

test('budget.limitsAt / budgetLevel parity', () => {
  const L = loadLegacy();
  for (const seed of seeds) {
    const rnd = syn.prng(seed), b = syn.budgets();
    for (let i = 0; i < 12; i++) { const m = monthsToCheck[Math.floor(rnd() * monthsToCheck.length)], c = syn.EXPENSE[Math.floor(rnd() * syn.EXPENSE.length)]; b[m + ':' + c] = rnd() < 0.2 && c === 'loan-payment' ? -1 : Math.round(rnd() * 9e6); }
    for (const m of monthsToCheck) assert.deepEqual(plain(D.budget.limitsAt(b, m)), plain(L.limitsAt(b, m)), seed + ' ' + m);
  }
  for (let s = 0; s <= 120; s += 5) assert.equal(D.budget.budgetLevel(s, 100), L.budgetLevel(s, 100));
});

test('loan schedule, payment and monthly summary parity (with gaps and rate settings)', () => {
  for (const seed of seeds) for (const rates of rateSets) {
    const schedule = scheduleVariant(seed);
    const L = loadLegacy({ loanSchedule: schedule, loanRates: rates });
    const legacyRates = plain(L.run('loanRates'));
    const norm = D.loan.normalizeRates(rates);
    assert.deepEqual(plain(norm), legacyRates, 'rate normalisation');
    assert.deepEqual(plain(D.loan.loanScheduleRows(schedule)), plain(L.loanScheduleRows(schedule)));
    for (const row of D.loan.loanScheduleRows(schedule)) assert.deepEqual(plain(D.loan.calculateLoanPayment(row, norm)), plain(L.calculateLoanPayment(row, legacyRates)));
    for (const m of monthsToCheck) assert.deepEqual(plain(D.loan.loanSummary(schedule, m, norm)), plain(L.homeLoanSummary(m)), seed + ' ' + m);
  }
});

test('cash-flow totals, dashboard, weekly and accumulated savings parity', () => {
  for (const seed of seeds) {
    const txs = syn.transactions({ seed, monthCount: 9 });
    txs.push({ id: 'bad', date: 'not-a-date', type: 'Expense', amount: 'abc', category: '' });
    const L = loadLegacy();
    L.set('transactions', txs);
    for (const m of monthsToCheck) {
      const [y, k] = m.split('-').map(Number); L.set('activeMonth', new Date(y, k - 1, 1));
      const t = D.cashflow.monthTotals(txs, m), legacy = plain(L.totals());
      assert.deepEqual({ expense: t.expense, income: t.income }, legacy);
      for (const n of [1, 3, 6, 12, 0, 99]) assert.deepEqual(plain(D.cashflow.dashboardData(txs, m, n)), plain(L.dashboardData(txs, m, n)));
      assert.deepEqual(plain(D.cashflow.weeklySpending(txs, D.money.shiftMonth(m, -2), m, m + '-15')), plain(L.weeklySpending(txs, D.money.shiftMonth(m, -2), m, m + '-15')));
    }
    for (const today of ['2026-08-01', '2026-10-10', '2027-06-30']) assert.deepEqual(plain(D.cashflow.accumulatedSavings(txs, today)), plain(L.accumulatedSavings(txs, today)));
  }
});

test('effectiveBudgets parity with legacy home view', () => {
  for (const seed of seeds.slice(0, 3)) {
    const schedule = scheduleVariant(seed), L = loadLegacy({ loanSchedule: schedule }), b = syn.budgets();
    L.set('budgets', b);
    for (const m of monthsToCheck) {
      const [y, k] = m.split('-').map(Number); L.set('activeMonth', new Date(y, k - 1, 1));
      // legacy effectiveBudgets reads the global `budgets` via limitsAt(budgets, ...)
      const legacy = plain(L.effectiveBudgets());
      assert.deepEqual(plain(D.budget.effectiveBudgets(b, m, D.loan.loanSummary(schedule, m, D.loan.normalizeRates(null)).total)), legacy);
    }
  }
});

test('calculateLoanPayment parity on the (schedule-unreachable) Techcombank 365-day path', () => {
  for (const rates of rateSets) {
    const L = loadLegacy({ loanRates: rates }), legacyRates = plain(L.run('loanRates')), norm = D.loan.normalizeRates(rates);
    for (const month of ['2026-11', '2026-12', '2027-01', '2027-02', '2030-12']) for (const days of [28, 30, 31]) {
      const row = { bank: 'Techcombank', month, principal: 123456789, rate: 0.09, interest: 777, days };
      assert.deepEqual(plain(D.loan.calculateLoanPayment(row, norm)), plain(L.calculateLoanPayment(row, legacyRates)), month + ' ' + days);
    }
  }
});
