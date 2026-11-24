// Domain: 1–12 month cash-flow forecast. Output keeps planned (recurring rules),
// scheduled (loans) and estimated (history average) values in separate fields and never
// touches actual transactions. Missing inputs yield null, not zero.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};

  function forecastCashFlow({ transactions = [], rules = [], schedule = null, rates = { forecast: 12, actual: {} }, fromMonth, months = 6, lookbackMonths = 3, today }) {
    const M = D.money;
    months = Math.max(1, Math.min(12, Math.trunc(months) || 1));
    const active = rules.filter(r => r.status === 'active');
    const plannedCats = { Income: new Set(), Expense: new Set() };
    active.forEach(r => { if (r.category !== 'loan-payment') plannedCats[r.type].add(r.category); });
    const assumptions = [];
    const ignoredLoanRules = active.filter(r => r.category === 'loan-payment');
    if (ignoredLoanRules.length && schedule) assumptions.push('Bỏ qua ' + ignoredLoanRules.length + ' quy tắc định kỳ "Trả nợ" vì lịch vay đã tính khoản này (tránh cộng trùng).');

    // History window: the `lookbackMonths` full months before fromMonth that have any transaction.
    const historyMonths = [];
    for (let m = M.shiftMonth(fromMonth, -1), guard = 0; historyMonths.length < lookbackMonths && guard < 24; m = M.shiftMonth(m, -1), guard++) {
      if (transactions.some(t => String(t.date).slice(0, 7) === m)) historyMonths.push(m);
    }
    const baselineFor = type => {
      if (!historyMonths.length) return null;
      const rows = transactions.filter(t => t.type === type && historyMonths.includes(String(t.date).slice(0, 7)) && !String(t.id).startsWith('rec-') && !plannedCats[type].has(t.category) && t.category !== 'loan-payment');
      return Math.round(M.sum(rows, r => r.amount) / historyMonths.length);
    };
    const baseIncome = baselineFor('Income'), baseExpense = baselineFor('Expense');
    if (historyMonths.length) assumptions.push(`Ước tính thu/chi biến đổi = bình quân ${historyMonths.length} tháng có dữ liệu (${historyMonths.slice().reverse().map(M.monthLabel).join(', ')}), loại trừ danh mục đã có quy tắc định kỳ và khoản trả nợ.`);
    else assumptions.push('Chưa có lịch sử giao dịch để ước tính thu/chi biến đổi.');
    if (historyMonths.length < lookbackMonths) assumptions.push(`Chỉ có ${historyMonths.length}/${lookbackMonths} tháng lịch sử; độ tin cậy thấp.`);
    if (!schedule) assumptions.push('Chưa có lịch vay; chưa tính nghĩa vụ trả nợ.');

    const rows = [];
    for (let i = 0; i < months; i++) {
      const month = M.shiftMonth(fromMonth, i), first = month + '-01', last = month + '-' + String(M.daysInMonth(month)).padStart(2, '0');
      const occ = D.recurring.planned(active.filter(r => !(schedule && r.category === 'loan-payment')), transactions, first, last, today).filter(o => o.status !== 'skipped' && o.status !== 'confirmed');
      const plannedIncome = M.sum(occ.filter(o => o.type === 'Income'), o => o.amount), plannedExpense = M.sum(occ.filter(o => o.type === 'Expense'), o => o.amount);
      const loan = schedule ? D.loan.loanSummary(schedule, month, rates) : null;
      const loanTotal = loan ? loan.total : null;
      const incomplete = !loan || loan.missing || baseIncome === null || baseExpense === null;
      const projectedNet = baseIncome === null || baseExpense === null || loanTotal === null ? null : plannedIncome + baseIncome - plannedExpense - baseExpense - loanTotal;
      rows.push({ month, kind: 'forecast', planned: { income: plannedIncome, expense: plannedExpense, occurrences: occ.length }, scheduledLoan: { total: loanTotal, incomplete: loan ? loan.missing : true, note: loan ? loan.missingNote : 'Chưa có lịch vay' }, estimated: { income: baseIncome, expense: baseExpense }, projectedNet, incomplete });
    }
    return { kind: 'forecast', fromMonth, months, historyMonths, assumptions, rows };
  }

  D.forecast = { forecastCashFlow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
