// Domain: actual cash flow from posted transactions. Planned/forecast values never enter here.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const amount = r => Number(r.amount) || 0;
  const inMonth = (r, month) => String(r.date).slice(0, 7) === month;

  function monthTotals(rows, month) {
    const t = rows.filter(r => inMonth(r, month)).reduce((a, r) => { a[r.type === 'Income' ? 'income' : 'expense'] += amount(r); return a; }, { expense: 0, income: 0 });
    const net = t.income - t.expense;
    return { income: t.income, expense: t.expense, net, savingsRate: t.income ? net / t.income : null, kind: 'actual' };
  }
  function categoryTotals(rows, month, type = 'Expense') {
    const sums = {};
    rows.filter(r => r.type === type && inMonth(r, month)).forEach(r => { sums[r.category] = (sums[r.category] || 0) + Number(r.amount); });
    return sums;
  }
  function weeklySpending(rows, start, end, today) {
    const day = 86400000, first = Date.parse(start + '-01T00:00:00Z'), [y, m] = end.split('-').map(Number);
    const last = Math.min(Date.UTC(y, m, 0), Date.parse(today + 'T00:00:00Z')), iso = t => new Date(t).toISOString().slice(0, 10);
    const monday = t => t - ((new Date(t).getUTCDay() + 6) % 7) * day, buckets = new Map();
    if (last >= first) for (let t = monday(first); t <= last; t += 7 * day) buckets.set(t, { start: iso(Math.max(first, t)), end: iso(Math.min(last, t + 6 * day)), total: 0 });
    for (const r of rows) { if (r.type !== 'Expense') continue; const t = Date.parse(r.date + 'T00:00:00Z'); if (t >= first && t <= last) buckets.get(monday(t)).total += Number(r.amount) || 0; }
    return [...buckets.values()];
  }
  // Legacy rule: savings counted from 2026-08-26; income up to the latest income date, expenses up to today.
  function accumulatedSavings(rows, today) {
    const start = '2026-08-26';
    const valid = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && String(r.date) >= start);
    const incomeRows = valid.filter(r => r.type === 'Income');
    const incomeDates = incomeRows.map(r => String(r.date)).sort();
    const end = incomeDates.length ? incomeDates[incomeDates.length - 1] : null;
    const sum = list => list.reduce((total, r) => total + (Number(r.amount) || 0), 0);
    const income = sum(incomeRows);
    const expense = sum(valid.filter(r => r.type === 'Expense' && String(r.date) <= today));
    return { start, end, expenseEnd: today, income, expense, savings: end ? income - expense : null };
  }
  // Accumulated savings counting only transactions dated on/before the cut-off (null = no income yet).
  function savingsAt(rows, cutoff) { return accumulatedSavings(rows.filter(r => String(r.date) <= cutoff), cutoff).savings; }
  function dashboardData(rows, month, months = 6) {
    const count = Math.max(1, Math.min(12, Math.trunc(Number(months) || 1)));
    const [year, number] = month.split('-').map(Number);
    const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const start = key(new Date(year, number - count, 1));
    const selected = rows.filter(r => String(r.date).slice(0, 7) >= start && String(r.date).slice(0, 7) <= month);
    const expenses = selected.filter(r => r.type === 'Expense');
    const sum = list => list.reduce((s, r) => s + Number(r.amount || 0), 0);
    const categories = Object.entries(expenses.reduce((acc, r) => { acc[r.category || 'other'] = (acc[r.category || 'other'] || 0) + Number(r.amount || 0); return acc; }, {})).sort((a, b) => b[1] - a[1]);
    const trend = Array.from({ length: count }, (_, i) => {
      const m = key(new Date(year, number - count + i, 1)), rs = selected.filter(r => String(r.date).slice(0, 7) === m);
      return { month: m, expense: sum(rs.filter(r => r.type === 'Expense')), income: sum(rs.filter(r => r.type === 'Income')), count: rs.length };
    });
    return { start, end: month, months: count, averageExpense: sum(expenses) / count, expense: sum(expenses), categories, trend };
  }
  // Source records behind a KPI (drill-through). Returns the exact rows summed.
  function sourceRows(rows, { month, type, category } = {}) {
    return rows.filter(r => (!month || inMonth(r, month)) && (!type || r.type === type) && (!category || r.category === category));
  }

  D.cashflow = { monthTotals, categoryTotals, weeklySpending, accumulatedSavings, savingsAt, dashboardData, sourceRows };
})(typeof globalThis !== 'undefined' ? globalThis : this);
