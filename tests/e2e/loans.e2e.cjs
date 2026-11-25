'use strict';
// Entering loans in the app (Khoản vay) and the budget gauge, through the real UI against the real
// backend on the emulated spreadsheet. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld } = require('./harness.cjs');
const NOW = '2026-11-24T03:00:00Z';
const go = (d, view) => d.page.evaluate(v => nav(v), view);
const loanRows = (w, bank) => w.sheetRows('Loans').filter(r => r[0] === bank);
const saved = (page, text) => page.waitForFunction(t => document.querySelector('#toast') && document.querySelector('#toast').textContent.includes(t), text, { timeout: 15000 });

test('Khoản vay: add a loan with a multi-month schedule, fill a missing month, edit and delete', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A', { viewport: { width: 1280, height: 900 } }); await w.connect(a);
    const p = a.page;
    await go(a, 'loans');

    // New loan: 3 months generated from principal, rate and monthly principal.
    await p.click('#addLoanBtn');
    await p.waitForSelector('#loanOverlay.open');
    await p.fill('#loanBank', 'Vietcombank');
    await p.fill('#loanMonth', '2027-01');
    await p.fill('#loanPrincipal', '100000000');
    await p.fill('#loanRate', '8');
    await p.check('#loanRepeat');
    await p.fill('#loanRepeatMonths', '3');
    await p.fill('#loanRepeatPrincipal', '2000000');
    assert.match(await p.textContent('#loanRepeatPreview'), /Sẽ tạo 3 tháng/);
    await p.click('#loanSave');
    await saved(p, 'Đã lưu 3 tháng');
    const vcb = loanRows(w, 'Vietcombank');
    assert.deepEqual(vcb.map(r => [r[1], r[2]]), [['2027-01', 100000000], ['2027-02', 98000000], ['2027-03', 96000000]]);
    assert.equal(vcb[0][4], Math.round(100000000 * 0.08 * 31 / 365) + 2000000, 'payment = interest + principal paid');
    assert.equal(await p.locator('#loanScheduleBody tr', { hasText: 'Vietcombank' }).count(), 3);

    // Fill a missing Shinhan month from its "Nhập" button; the interest helper computes the payment.
    await p.click('#loanScheduleBody [data-loan-edit="Shinhan"][data-loan-month="2028-04"]');
    await p.waitForSelector('#loanOverlay.open');
    assert.equal(await p.inputValue('#loanBank'), 'Shinhan');
    assert.equal(await p.getAttribute('#loanBank', 'readonly'), '');
    assert.equal(await p.inputValue('#loanPrincipal'), '815.000.000', 'prefilled from the previous month');
    await p.fill('#loanPrincipal', '810000000');
    await p.click('#loanCalc');
    assert.equal(await p.inputValue('#loanPayment'), new Intl.NumberFormat('vi-VN').format(Math.round(810000000 * 0.075 * 30 / 365)));
    await p.click('#loanSave');
    await saved(p, 'Đã lưu lịch vay Shinhan');
    assert.ok(w.sheetRows('Loans').some(r => r[0] === 'Shinhan' && r[1] === '2028-04' && r[2] === 810000000));
    assert.equal(await p.locator('#loanScheduleBody tr.row-missing', { hasText: '04/2028' }).count(), 0, 'no longer missing');

    // Edit, then delete.
    await p.click('#loanScheduleBody [data-loan-edit="Vietcombank"][data-loan-month="2027-01"]');
    await p.fill('#loanPayment', '2700000');
    await p.click('#loanSave');
    await saved(p, 'Đã lưu lịch vay Vietcombank');
    assert.equal(loanRows(w, 'Vietcombank')[0][4], 2700000);
    await p.click('#loanScheduleBody [data-loan-edit="Vietcombank"][data-loan-month="2027-03"]');
    await p.click('#loanDelete');
    await saved(p, 'Đã xóa lịch vay');
    assert.deepEqual(loanRows(w, 'Vietcombank').map(r => r[1]), ['2027-01', '2027-02']);
    assert.deepEqual(a.errors, []);
  } finally { await w.close(); }
});

test('Khoản vay: a stale edit from another phone is refused and the newer schedule is shown', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    for (const d of [a, b]) await go(d, 'loans');
    await a.page.click('#loanScheduleBody [data-loan-edit="Shinhan"][data-loan-month="2026-12"]');
    await a.page.fill('#loanPayment', '1111111');
    await a.page.click('#loanSave');
    await saved(a.page, 'Đã lưu lịch vay');
    await b.page.click('#loanScheduleBody [data-loan-edit="Shinhan"][data-loan-month="2026-12"]');
    await b.page.fill('#loanPayment', '2222222');
    await b.page.click('#loanSave');
    await saved(b.page, 'đã thay đổi trên Google Sheets');
    assert.ok(w.sheetRows('Loans').some(r => r[0] === 'Shinhan' && r[1] === '2026-12' && r[4] === 1111111), 'first save kept');
    assert.match(await b.page.textContent('#loanScheduleBody'), /1\.111\.111/, 'B now shows the newer value');
  } finally { await w.close(); }
});

test('Ngân sách: the four summary cards are one gauge chart with the same figures', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await go(a, 'budget');
    const p = a.page;
    assert.equal(await p.locator('#budgetSummary svg.gauge').count(), 1);
    assert.equal(await p.locator('#budgetView .metric-grid-4').count(), 0, 'old 4 cards removed');
    const text = (await p.textContent('#budgetSummary')).replace(/\s+/g, ' ');
    const expected = await p.evaluate(() => { const eff = effectiveBudgets(), total = Object.values(eff).reduce((s, v) => s + (Number(v) || 0), 0), used = Object.values(FFDomain.cashflow.categoryTotals(transactions, monthKey(activeMonth))).reduce((s, v) => s + v, 0); return { total, used, pct: Math.round(used / total * 100) + '%', total$: money(total), used$: money(used), left$: money(total - used) }; });
    assert.equal((await p.textContent('#budgetSummary .gauge-pct')).trim(), expected.pct);
    for (const v of [expected.total$, expected.used$, expected.left$]) assert.ok(text.includes(v.replace(/\s+/g, ' ')), v + ' in ' + text);
    assert.match(await p.getAttribute('#budgetSummary svg.gauge', 'aria-label'), new RegExp('Đã dùng ' + expected.pct));
    assert.deepEqual(a.errors, []);
  } finally { await w.close(); }
});
