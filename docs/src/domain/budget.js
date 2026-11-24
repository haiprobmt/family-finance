// Domain: budgets. Preserves month-scoped overrides and the -1 loan-payment sentinel.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const EXPENSE_CATEGORIES = ['food', 'grocery', 'kids', 'transport', 'home', 'bills', 'health', 'couple-allowance', 'other', 'loan-payment'];
  const INCOME_CATEGORIES = ['salary', 'bonus', 'business', 'other-income'];
  const LABELS = { food: 'Ăn uống', grocery: 'Đi chợ', kids: 'Con cái', transport: 'Xe cộ', home: 'Nhà cửa', bills: 'Điện nước', health: 'Sức khỏe', other: 'Khác', 'loan-payment': 'Trả nợ', 'couple-allowance': 'Tiêu Vặt Vợ Chồng', salary: 'Lương', bonus: 'Thưởng', business: 'Kinh doanh', 'other-income': 'Thu khác' };
  const REMOVED = -1;

  // Limits in force for `month`: base keys, then month-scoped keys (YYYY-MM:cat) up to month, in order.
  function limitsAt(all, month) {
    const out = Object.fromEntries(Object.entries(all).filter(([key]) => !key.includes(':')));
    for (const key of Object.keys(all).filter(k => k.includes(':') && k.slice(0, 7) <= month).sort()) { const cat = key.slice(8); if (all[key] === REMOVED) delete out[cat]; else out[cat] = all[key]; }
    return out;
  }
  // Manual loan-payment budget wins; otherwise the scheduled loan total (which may be incomplete).
  function effectiveBudgets(all, month, autoLoanTotal) { const b = limitsAt(all, month); return { ...b, 'loan-payment': b['loan-payment'] ?? autoLoanTotal }; }
  function budgetLevel(spend, budget) { return budget > 0 ? (spend / budget <= 0.65 ? 'green' : spend / budget < 0.9 ? 'yellow' : 'red') : 'unset'; }
  function isValidLimit(key, v) { const parts = key.split(':'), scoped = parts.length === 2 && /^\d{4}-(0[1-9]|1[012])$/.test(parts[0]), id = parts[parts.length - 1]; return (parts.length === 1 || scoped) && EXPENSE_CATEGORIES.includes(id) && Number.isFinite(v) && v <= 1e12 && (v >= 0 || (scoped && id === 'loan-payment' && v === REMOVED)); }

  // Apply edits made while viewing `month`: only changed categories get a month-scoped key.
  // A category absent from `values` (blank loan-payment) is stored as the -1 sentinel.
  function applyMonthEdits(all, month, values, categories = EXPENSE_CATEGORIES) {
    const scoped = limitsAt(all, month), merged = { ...all };
    for (const id of categories) if (values[id] !== scoped[id]) merged[month + ':' + id] = values[id] ?? REMOVED;
    return merged;
  }

  // Per-category utilisation from posted expense totals. Planned items never enter `spent`.
  function utilization(spentByCategory, limits, { warnAt = 0.8 } = {}) {
    const ids = [...new Set([...Object.keys(limits), ...Object.keys(spentByCategory)])];
    const rows = ids.map(id => {
      const spent = Number(spentByCategory[id]) || 0, limit = limits[id] === undefined || limits[id] === null ? null : Number(limits[id]);
      const ratio = limit > 0 ? spent / limit : null;
      return { id, spent, limit, ratio, level: budgetLevel(spent, limit || 0), overBy: limit !== null && spent > limit ? spent - limit : 0, alert: ratio === null ? (limit === 0 && spent > 0 ? 'over' : null) : ratio > 1 ? 'over' : ratio >= warnAt ? 'warn' : null };
    });
    const totalLimit = rows.reduce((s, r) => s + (r.limit || 0), 0), totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    return { rows, totalLimit, totalSpent, ratio: totalLimit > 0 ? totalSpent / totalLimit : null };
  }

  // Period comparison: same categories, current vs previous month spend.
  function compare(currentByCat, previousByCat) {
    const ids = [...new Set([...Object.keys(currentByCat), ...Object.keys(previousByCat)])];
    return ids.map(id => { const now = Number(currentByCat[id]) || 0, before = Number(previousByCat[id]) || 0; return { id, current: now, previous: before, change: now - before, changeRatio: before > 0 ? (now - before) / before : null }; }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }

  D.budget = { EXPENSE_CATEGORIES, INCOME_CATEGORIES, LABELS, REMOVED, limitsAt, effectiveBudgets, budgetLevel, isValidLimit, applyMonthEdits, utilization, compare };
})(typeof globalThis !== 'undefined' ? globalThis : this);
