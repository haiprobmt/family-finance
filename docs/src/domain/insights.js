// Domain: deterministic "tools" used by the assistant and by in-app reminders.
// Every result carries period, data coverage and provenance so explanations can be
// grounded. Outputs are minimal: no notes, person names or transaction IDs.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const TOOLS = ['summary', 'expense_analysis', 'budget_status', 'loan_position', 'repayment_simulation', 'forecast'];

  function validateTransaction(t) {
    const e = [];
    if (!t.id || String(t.id).length > 150) e.push('id');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date || ''))) e.push('date');
    if (!['Income', 'Expense'].includes(t.type)) e.push('type');
    if (!D.money.isValidAmount(Number(t.amount))) e.push('amount');
    return e;
  }
  const labelOf = id => D.budget.LABELS[id] || 'Khác';
  const coverageOf = (rows, months) => ({ transactions: rows.filter(r => months.includes(String(r.date).slice(0, 7))).length, monthsWithData: months.filter(m => rows.some(r => String(r.date).slice(0, 7) === m)).map(D.money.monthLabel), monthsRequested: months.map(D.money.monthLabel) });

  function summary(rows, month) {
    const prev = D.money.shiftMonth(month, -1), now = D.cashflow.monthTotals(rows, month), before = D.cashflow.monthTotals(rows, prev);
    const cats = D.cashflow.categoryTotals(rows, month);
    return { tool: 'summary', period: { from: month, to: month }, kind: 'actual', coverage: coverageOf(rows, [prev, month]), provenance: 'Google Sheets · Transactions (giao dịch đã ghi)',
      data: { month: D.money.monthLabel(month), income: now.income, expense: now.expense, net: now.net, savingsRatePct: now.savingsRate === null ? null : Math.round(now.savingsRate * 1000) / 10, previous: { month: D.money.monthLabel(prev), income: before.income, expense: before.expense, net: before.net }, topCategories: Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ category: labelOf(id), amount: v })) } };
  }
  function expenseAnalysis(rows, month) {
    const months = [D.money.shiftMonth(month, -3), D.money.shiftMonth(month, -2), D.money.shiftMonth(month, -1)];
    const now = D.cashflow.categoryTotals(rows, month), prev = D.cashflow.categoryTotals(rows, months[2]);
    const avg = {};
    months.forEach(m => Object.entries(D.cashflow.categoryTotals(rows, m)).forEach(([k, v]) => { avg[k] = (avg[k] || 0) + v / 3; }));
    const largest = rows.filter(r => r.type === 'Expense' && String(r.date).slice(0, 7) === month).sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5).map(r => ({ date: D.money.dateLabel(r.date), category: labelOf(r.category), amount: Number(r.amount) }));
    return { tool: 'expense_analysis', period: { from: months[0], to: month }, kind: 'actual', coverage: coverageOf(rows, [...months, month]), provenance: 'Google Sheets · Transactions',
      data: { byCategory: D.budget.compare(now, prev).map(c => ({ category: labelOf(c.id), current: c.current, previousMonth: c.previous, change: c.change, threeMonthAverage: Math.round(avg[c.id] || 0) })), largest } };
  }
  function budgetStatus(rows, budgets, month, autoLoanTotal, loanIncomplete) {
    const limits = D.budget.effectiveBudgets(budgets, month, autoLoanTotal);
    const u = D.budget.utilization(D.cashflow.categoryTotals(rows, month), limits);
    return { tool: 'budget_status', period: { from: month, to: month }, kind: 'actual-vs-budget', coverage: { ...coverageOf(rows, [month]), loanBudgetIncomplete: !!loanIncomplete }, provenance: 'Google Sheets · Transactions + Budgets' + (loanIncomplete ? ' (ngân sách trả nợ tạm tính do thiếu lịch vay)' : ''),
      data: { totalLimit: u.totalLimit, totalSpent: u.totalSpent, usedPct: u.ratio === null ? null : Math.round(u.ratio * 1000) / 10, categories: u.rows.map(r => ({ category: labelOf(r.id), spent: r.spent, limit: r.limit, usedPct: r.ratio === null ? null : Math.round(r.ratio * 1000) / 10, alert: r.alert })) } };
  }
  function loanPosition(schedule, month, rates) {
    const s = D.loan.loanSummary(schedule, month, rates), l = D.loan.liabilityAt(schedule, month);
    return { tool: 'loan_position', period: { from: month, to: month }, kind: 'scheduled', coverage: { scheduleComplete: !s.missing, missingNote: s.missingNote || null }, provenance: 'Google Sheets · Loans + FinanceSettings (lịch vay dự kiến, không phải giao dịch thực tế)',
      data: { month: D.money.monthLabel(month), scheduledTotal: s.total, incomplete: s.missing, extraMonthly: schedule.extraDebt || 0, banks: s.rows.map(D.loan.paymentBreakdown), outstandingPrincipal: l.total, outstandingKnown: l.knownTotal } };
  }
  function repaymentSimulation(params) {
    const base = D.loan.simulateRepayment({ ...params, extraMonthly: 0, lumpSums: [] }), alt = D.loan.simulateRepayment(params);
    if (!base.ok || !alt.ok) return { tool: 'repayment_simulation', kind: 'simulation', error: 'invalid-input', errors: (alt.errors || base.errors) };
    return { tool: 'repayment_simulation', period: { from: params.startMonth, to: alt.payoffMonth }, kind: 'simulation', coverage: { assumptionsOnly: true }, provenance: 'Mô phỏng theo giả định người dùng nhập; không thay thế hợp đồng vay',
      data: { assumptions: alt.assumptions, baseline: { months: base.months, interest: base.totals.interest, payoffMonth: base.payoffMonth }, withExtra: { months: alt.months, interest: alt.totals.interest, fees: alt.totals.fees, payoffMonth: alt.payoffMonth }, comparison: D.loan.compareRepayment(base, alt) } };
  }
  function forecast(input) {
    const f = D.forecast.forecastCashFlow(input);
    return { tool: 'forecast', period: { from: f.fromMonth, to: D.money.shiftMonth(f.fromMonth, f.months - 1) }, kind: 'forecast', coverage: { historyMonths: f.historyMonths.map(D.money.monthLabel), incompleteMonths: f.rows.filter(r => r.incomplete).map(r => D.money.monthLabel(r.month)) }, provenance: 'Ước tính từ lịch sử Transactions, quy tắc định kỳ và lịch vay; là dự báo, không phải số thực tế',
      data: { assumptions: f.assumptions, months: f.rows.map(r => ({ month: D.money.monthLabel(r.month), plannedIncome: r.planned.income, plannedExpense: r.planned.expense, scheduledLoan: r.scheduledLoan.total, loanIncomplete: r.scheduledLoan.incomplete, estimatedIncome: r.estimated.income, estimatedExpense: r.estimated.expense, projectedNet: r.projectedNet })) } };
  }

  // In-app reminders: due/overdue planned items, budget thresholds, sync problems.
  function reminders({ planned = [], budget = null, sync = null }) {
    const out = [];
    for (const o of planned) if (o.status === 'overdue' || o.status === 'due-soon') out.push({ kind: o.status === 'overdue' ? 'overdue' : 'due', ref: o.id, date: o.dueDate, category: o.category, type: o.type, amount: o.amount });
    if (budget) for (const r of budget.rows) if (r.alert) out.push({ kind: 'budget-' + r.alert, ref: r.id, category: r.id, ratio: r.ratio, spent: r.spent, limit: r.limit });
    if (sync && (sync.state === 'failed' || sync.state === 'conflict')) out.push({ kind: 'sync-' + sync.state, pending: sync.pending || 0 });
    return out;
  }

  D.insights = { TOOLS, validateTransaction, summary, expenseAnalysis, budgetStatus, loanPosition, repaymentSimulation, forecast, reminders };
})(typeof globalThis !== 'undefined' ? globalThis : this);
