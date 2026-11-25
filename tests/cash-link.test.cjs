'use strict';
// "Tiền mặt" asset linked to Tiết kiệm tích lũy (Báo cáo). Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./harness/domain.cjs').loadDomain();
const tx = (id, date, type, amount) => ({ id, date, type, amount, category: type === 'Income' ? 'salary' : 'food' });
const rows = [tx('i0', '2026-08-01', 'Income', 99e6), tx('i1', '2026-09-01', 'Income', 30e6), tx('e1', '2026-09-10', 'Expense', 4e6), tx('i2', '2026-10-01', 'Income', 30e6), tx('e2', '2026-10-15', 'Expense', 6e6)];
const asset = (id, type, over = {}) => ({ id, type, name: id, currency: 'VND', acquisitionDate: '', acquisitionValue: '', currentValue: '', valuationDate: '', ownershipShare: 1, notes: '', status: 'active', disposalDate: '', ...over });

test('savingsAt counts income and expenses from 26/08/2026 up to the cut-off; equals Báo cáo for today', () => {
  assert.equal(D.cashflow.savingsAt(rows, '2026-09-30'), 26e6);
  assert.equal(D.cashflow.savingsAt(rows, '2026-10-31'), 50e6);
  assert.equal(D.cashflow.savingsAt(rows, '2026-08-20'), null, 'no income yet → unknown, not 0');
  assert.equal(D.cashflow.savingsAt(rows, '2026-11-25'), D.cashflow.accumulatedSavings(rows, '2026-11-25').savings);
});

test('the first cash asset takes Tiết kiệm tích lũy at the cut-off; others are unchanged', () => {
  const assets = [asset('a-cash', 'cash', { currentValue: 1, valuationDate: '2026-01-01' }), asset('a-home', 'real-estate', { currentValue: 4e9, valuationDate: '2026-10-01' }), asset('b-cash2', 'cash', { currentValue: 5e6, valuationDate: '2026-10-01', ownershipShare: 0.5 })];
  const p = D.netWorth.assetPosition(assets, [], '2026-10-31', rows);
  const cash = p.items.find(i => i.id === 'a-cash');
  assert.equal(cash.linked, true); assert.equal(cash.value, 50e6, 'manual value ignored'); assert.equal(cash.valuation.source, 'linked');
  assert.equal(p.items.find(i => i.id === 'b-cash2').value, 2.5e6, 'second cash asset keeps its own valuation');
  assert.equal(p.total, 50e6 + 4e9 + 2.5e6);
  // Without transactions (old callers) nothing changes.
  assert.equal(D.netWorth.assetPosition(assets, [], '2026-10-31').items.find(i => i.id === 'a-cash').value, 1);
  // Ownership share applies; negative savings is reported as negative cash.
  const half = D.netWorth.assetPosition([asset('a-cash', 'cash', { ownershipShare: 0.5 })], [], '2026-10-31', rows);
  assert.equal(half.items[0].value, 25e6);
  const neg = D.netWorth.assetPosition([asset('a-cash', 'cash')], [], '2026-09-30', rows.concat(tx('e3', '2026-09-20', 'Expense', 40e6)));
  assert.equal(neg.items[0].value, -14e6);
});

test('net worth: linked cash with no income is a named gap, not a silent zero', () => {
  const nw = D.netWorth.netWorth({ assets: [asset('a-cash', 'cash')], valuations: [], schedule: { start: '2026-10', end: '2030-12', records: [], extraDebt: 0 }, debts: [], cutoff: '2026-08-20', transactions: rows });
  assert.equal(nw.netWorth, null);
  assert.ok(nw.gaps.some(g => /Tiết kiệm tích lũy/.test(g)), nw.gaps.join(' | '));
});
