'use strict';
// Unit tests for 3.0 domain rules (TEST_PLAN §3). Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDomain, plain } = require('./harness/domain.cjs');
const syn = require('./fixtures/synthetic.cjs');
const D = loadDomain();

test('money/date primitives', () => {
  assert.equal(D.money.toVnd('12.6'), 13);
  assert.equal(D.money.toVnd('x'), null, 'non-finite is unknown, not zero');
  assert.equal(D.money.isValidAmount(0), false);
  assert.equal(D.money.isValidAmount(1e12), true);
  assert.equal(D.money.isValidAmount(1e12 + 1), false);
  assert.equal(D.money.isValidAmount(Infinity), false);
  assert.equal(D.money.isDateKey('2026-02-30'), false);
  assert.equal(D.money.isDateKey('2028-02-29'), true);
  assert.equal(D.money.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(D.money.shiftMonth('2026-01', -1), '2025-12');
  assert.deepEqual(plain(D.money.monthRange('2026-11', '2027-02')), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(D.money.parseDigits('1.234.567 ₫'), 1234567);
});

test('budget: validation mirrors backend, month edits, utilisation thresholds, empty and zero', () => {
  const B = D.budget;
  assert.equal(B.isValidLimit('food', 0), true);
  assert.equal(B.isValidLimit('loan-payment', -1), false);
  assert.equal(B.isValidLimit('2026-11:loan-payment', -1), true);
  assert.equal(B.isValidLimit('2026-11:food', -1), false);
  assert.equal(B.isValidLimit('2026-13:food', 1), false);
  const all = syn.budgets();
  const merged = B.applyMonthEdits(all, '2026-10', { ...B.limitsAt(all, '2026-10'), food: 5000000, 'loan-payment': undefined });
  assert.equal(merged['2026-10:food'], 5000000);
  assert.equal(merged['2026-10:loan-payment'], -1, 'cleared manual loan budget stores the sentinel');
  assert.equal(merged['2026-10:grocery'], undefined, 'unchanged categories get no scoped key');
  const u = B.utilization({ food: 900, grocery: 1200, kids: 5, health: 10 }, { food: 1000, grocery: 1000, kids: 1000, health: 0 });
  const by = Object.fromEntries(u.rows.map(r => [r.id, r]));
  assert.equal(by.food.alert, 'warn');
  assert.equal(by.grocery.alert, 'over'); assert.equal(by.grocery.overBy, 200);
  assert.equal(by.kids.alert, null);
  assert.equal(by.health.alert, 'over', 'spending against a zero budget is over');
  assert.equal(B.utilization({}, {}).ratio, null, 'empty budget → unknown ratio');
  const cmp = B.compare({ food: 300 }, { food: 100, kids: 50 });
  assert.equal(cmp[0].id, 'food'); assert.equal(cmp[0].changeRatio, 2);
});

test('loans: principal vs interest, liability snapshot, missing schedule is incomplete', () => {
  const schedule = syn.loanSchedule();
  const oct = D.loan.liabilityAt(schedule, '2026-10');
  assert.equal(oct.complete, true);
  assert.equal(oct.total, 900000000 + 300000000);
  const gap = D.loan.liabilityAt({ ...schedule, records: schedule.records.filter(r => r.month !== '2027-01') }, '2027-01');
  assert.equal(gap.complete, false); assert.equal(gap.total, null, 'missing is unknown, not zero');
  const tcb = D.loan.calculateLoanPayment({ bank: 'Techcombank', month: '2026-12', principal: 100000000, rate: 0.09, interest: 0, days: 31 }, D.loan.normalizeRates(null));
  const split = D.loan.paymentBreakdown(tcb);
  assert.equal(split.liabilityReduction, 909400, 'principal reduces liability');
  assert.equal(split.expensePortion, Math.round(100000000 * 0.12 * 31 / 365), 'interest is the expense portion');
  assert.equal(split.payment, split.expensePortion + split.liabilityReduction);
});

test('repayment simulator: explicit assumptions, extra payment saves interest, fees counted, invalid input rejected', () => {
  const base = { principal: 120000000, annualRate: 0.1, startMonth: '2027-01', monthlyPrincipal: 10000000 };
  const a = D.loan.simulateRepayment(base);
  assert.equal(a.ok, true); assert.equal(a.months, 12); assert.equal(a.payoffMonth, '2027-12');
  assert.equal(a.totals.principal, 120000000);
  assert.equal(a.rows[0].interest, Math.round(120000000 * 0.1 * 31 / 365), 'actual days / 365');
  const b = D.loan.simulateRepayment({ ...base, extraMonthly: 10000000, prepaymentFeeRate: 0.01 });
  assert.equal(b.months, 6);
  const c = D.loan.compareRepayment(a, b);
  assert.ok(c.interestSaved > 0); assert.equal(c.monthsSaved, 6); assert.equal(c.feesPaid, 600000);
  assert.ok(b.assumptions.some(s => s.includes('Phí trả trước 1.00%')));
  const ann = D.loan.simulateRepayment({ principal: 100000000, annualRate: 0.12, startMonth: '2027-01', method: 'annuity', termMonths: 24 });
  assert.equal(ann.ok, true); assert.ok(ann.months >= 23 && ann.months <= 25);
  const lump = D.loan.simulateRepayment({ ...base, lumpSums: [{ month: '2027-03', amount: 50000000 }] });
  assert.ok(lump.months < 12);
  assert.deepEqual(plain(D.loan.simulateRepayment({ principal: -1, annualRate: 2, startMonth: 'x' }).errors), ['principal', 'annualRate', 'startMonth', 'monthlyPrincipal']);
});

test('assets/net worth: latest valuation by cut-off, ownership share, unknown valuation, no backfill', () => {
  const schedule = syn.loanSchedule();
  const assets = [
    { id: 'home', type: 'real-estate', name: 'Căn hộ mẫu', currency: 'VND', acquisitionDate: '2020-01-01', acquisitionValue: 2e9, currentValue: 3e9, valuationDate: '2026-12-01', ownershipShare: 0.5, status: 'active' },
    { id: 'cash', type: 'cash', name: 'Tiền mặt', currency: 'VND', currentValue: 50000000, valuationDate: '2026-10-01', ownershipShare: 1, status: 'active' },
    { id: 'car', type: 'vehicle', name: 'Xe đã bán', currency: 'VND', currentValue: 4e8, valuationDate: '2026-01-01', ownershipShare: 1, status: 'sold', disposalDate: '2026-09-15' }
  ];
  const vals = [{ id: 'v1', assetId: 'home', valuationDate: '2026-06-01', value: 2.8e9, sourceType: 'appraisal' }];
  for (const a of assets) assert.deepEqual(plain(D.netWorth.validateAsset(a)), [], a.id);
  assert.deepEqual(plain(D.netWorth.validateValuation(vals[0])), []);
  assert.ok(D.netWorth.validateAsset({ ...assets[0], ownershipShare: 0 }).includes('ownershipShare'));
  assert.ok(D.netWorth.validateAsset({ ...assets[0], valuationDate: '' }).includes('valuationDate'));
  const oct = D.netWorth.netWorth({ assets, valuations: vals, schedule, cutoff: '2026-10-31' });
  assert.equal(oct.assets.items.find(i => i.id === 'home').value, 1.4e9, 'June appraisal × 50% share; December value not backfilled');
  assert.equal(oct.assets.items.some(i => i.id === 'car'), false, 'sold before cut-off');
  assert.equal(oct.complete, true);
  assert.equal(oct.netWorth, 1.4e9 + 5e7 - 1.2e9);
  const dec = D.netWorth.netWorth({ assets, valuations: vals, schedule, cutoff: '2026-12-31' });
  assert.equal(dec.assets.items.find(i => i.id === 'home').value, 1.5e9, 'latest valuation wins');
  const aug = D.netWorth.netWorth({ assets, valuations: vals, schedule, cutoff: '2026-08-31' });
  assert.equal(aug.assets.items.find(i => i.id === 'cash').unknown, true, 'no valuation yet → unknown');
  assert.equal(aug.netWorth, null);
  assert.ok(aug.gaps.length >= 2, 'unknown asset and missing liability both reported');
  const none = D.netWorth.netWorth({ assets: [], valuations: [], schedule, cutoff: '2026-10-31' });
  assert.equal(none.netWorth, null, 'no assets → unknown, not negative debt');
  assert.equal(none.assets.total, null, 'no assets → asset total unknown, not 0');
});

const rule = (over = {}) => ({ id: 'rent', type: 'Expense', amount: 5000000, category: 'home', person: 'Gia đình', note: 'Tiền nhà', cadence: 'monthly', interval: 1, startDate: '2027-01-31', endDate: '', status: 'active', skipped: [], ...over });

test('recurring: deterministic idempotent occurrences, month-end clamp, statuses, planned ≠ actual', () => {
  const R = D.recurring;
  assert.deepEqual(plain(R.validateRule(rule())), []);
  assert.ok(R.validateRule(rule({ id: 'bad id!' })).includes('id'));
  assert.ok(R.validateRule(rule({ amount: 0 })).includes('amount'));
  assert.ok(R.validateRule(rule({ category: 'salary' })).includes('category'));
  const occ = R.occurrences(rule(), '2027-01-01', '2027-04-30').map(o => o.dueDate);
  assert.deepEqual(plain(occ), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(plain(R.occurrences(rule(), '2027-01-01', '2027-04-30')), plain(R.occurrences(rule(), '2027-01-01', '2027-04-30')), 'generation is deterministic');
  assert.equal(R.occurrences(rule({ cadence: 'weekly', startDate: '2027-01-04' }), '2027-01-01', '2027-01-31').length, 4);
  assert.deepEqual(plain(R.occurrences(rule({ cadence: 'yearly', startDate: '2028-02-29' }), '2028-01-01', '2030-12-31').map(o => o.dueDate)), ['2028-02-29', '2029-02-28', '2030-02-28']);
  assert.equal(R.occurrences(rule({ endDate: '2027-02-28' }), '2027-01-01', '2027-12-31').length, 2);
  const r = rule({ skipped: ['2027-02-28'] });
  const tx = [R.toTransaction(R.occurrences(r, '2027-01-01', '2027-01-31')[0], 't')];
  const p = R.planned([r, rule({ id: 'paused', status: 'paused' })], tx, '2027-01-01', '2027-04-30', '2027-03-28');
  assert.deepEqual(plain(p.map(o => o.status)), ['confirmed', 'skipped', 'due-soon', 'pending']);
  assert.equal(tx[0].id, 'rec-rent-2027-01-31', 'confirmation reuses occurrence id → replay-safe');
  assert.equal(D.cashflow.monthTotals([], '2027-03').expense, 0, 'planned items never enter actual totals');
  assert.equal(R.nextOccurrence(r, '2027-02-01').dueDate, '2027-03-31', 'skipped dates are not next');
});

test('forecast: actual/planned/scheduled/estimated separated, no duplicate loan payment, missing inputs null', () => {
  const txs = syn.transactions({ start: '2026-08', monthCount: 4 });
  const schedule = syn.loanSchedule();
  const rules = [rule({ startDate: '2026-12-05' }), rule({ id: 'loanrule', category: 'loan-payment', amount: 9e6, startDate: '2026-12-10' }), { ...rule({ id: 'sal', type: 'Income', category: 'salary', amount: 30000000, startDate: '2026-12-01' }) }];
  const f = D.forecast.forecastCashFlow({ transactions: txs, rules, schedule, fromMonth: '2026-12', months: 3, today: '2026-11-24' });
  assert.equal(f.rows.length, 3);
  const dec = f.rows[0];
  assert.equal(dec.planned.expense, 5000000, 'loan-payment rule excluded when schedule exists');
  assert.equal(dec.planned.income, 30000000);
  assert.equal(dec.scheduledLoan.total, D.loan.loanSummary(schedule, '2026-12', D.loan.normalizeRates(null)).total);
  const history = txs.filter(t => ['2026-09', '2026-10', '2026-11'].includes(t.date.slice(0, 7)));
  const expectedExpense = Math.round(history.filter(t => t.type === 'Expense' && t.category !== 'home' && t.category !== 'loan-payment').reduce((s, t) => s + t.amount, 0) / 3);
  assert.equal(dec.estimated.expense, expectedExpense, 'planned categories excluded from the estimate');
  const expectedIncome = Math.round(history.filter(t => t.type === 'Income' && t.category !== 'salary').reduce((s, t) => s + t.amount, 0) / 3);
  assert.equal(dec.estimated.income, expectedIncome, 'salary covered by its rule, not double counted');
  assert.equal(dec.projectedNet, 30000000 + expectedIncome - 5000000 - expectedExpense - dec.scheduledLoan.total);
  assert.ok(f.assumptions.some(a => a.includes('tránh cộng trùng')));
  const none = D.forecast.forecastCashFlow({ transactions: [], rules: [], schedule: null, fromMonth: '2026-12', months: 2, today: '2026-11-24' });
  assert.equal(none.rows[0].projectedNet, null); assert.equal(none.rows[0].estimated.expense, null); assert.equal(none.rows[0].incomplete, true);
  const before = JSON.stringify(txs); D.forecast.forecastCashFlow({ transactions: txs, rules, schedule, fromMonth: '2026-12', months: 12, today: '2026-11-24' });
  assert.equal(JSON.stringify(txs), before, 'forecast never mutates transactions');
});

test('insights tools: grounded, minimal, with period/coverage/provenance', () => {
  const txs = syn.transactions({ start: '2026-08', monthCount: 4 });
  const s = D.insights.summary(txs, '2026-11');
  assert.equal(s.tool, 'summary'); assert.equal(s.kind, 'actual');
  assert.equal(s.data.expense, D.cashflow.monthTotals(txs, '2026-11').expense);
  assert.ok(s.provenance.includes('Transactions'));
  const e = D.insights.expenseAnalysis(txs, '2026-11');
  const json = JSON.stringify(e);
  assert.ok(!json.includes('Siêu thị') && !json.includes('syn-'), 'no notes or IDs leak to the model');
  const b = D.insights.budgetStatus(txs, syn.budgets(), '2026-11', 1000, true);
  assert.equal(b.coverage.loanBudgetIncomplete, true);
  const l = D.insights.loanPosition(syn.loanSchedule(), '2026-10', D.loan.normalizeRates(null));
  assert.equal(l.kind, 'scheduled'); assert.equal(l.data.outstandingPrincipal, 1.2e9);
  const sim = D.insights.repaymentSimulation({ principal: 1e8, annualRate: 0.1, startMonth: '2027-01', monthlyPrincipal: 1e7, extraMonthly: 5e6 });
  assert.ok(sim.data.comparison.interestSaved > 0);
  assert.equal(D.insights.repaymentSimulation({ principal: 0 }).error, 'invalid-input');
  const r = D.insights.reminders({ planned: [{ id: 'x', status: 'overdue', dueDate: '2026-11-01' }], budget: D.budget.utilization({ food: 95 }, { food: 100 }), sync: { state: 'failed', pending: 2 } });
  assert.deepEqual(plain(r.map(x => x.kind)), ['overdue', 'budget-warn', 'sync-failed']);
  assert.deepEqual(plain(D.insights.validateTransaction({ id: 'a', date: '2026-01-01', type: 'Expense', amount: 0 })), ['amount']);
});

test('loan breakdown: file-based schedule without principal split reports principal as unknown', () => {
  const row = D.loan.calculateLoanPayment({ bank: 'Shinhan', month: '2026-12', principal: 9e8, rate: 0.075, interest: 5500000, days: 31 }, D.loan.normalizeRates(null));
  const b = D.loan.paymentBreakdown(row);
  assert.equal(b.principal, null); assert.equal(b.liabilityReduction, null); assert.equal(b.payment, 5500000);
});
