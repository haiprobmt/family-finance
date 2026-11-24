// Domain: recurring rules and planned occurrences.
// Occurrence IDs are deterministic (`rec-<ruleId>-<YYYY-MM-DD>`) and are reused as the
// transaction ID on confirmation, so generation and confirmation are idempotent: the
// backend's v3_create ignores a replayed ID. Planned items never count as actual spend.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const CADENCES = ['weekly', 'monthly', 'yearly'];
  const CADENCE_LABELS = { weekly: 'Hằng tuần', monthly: 'Hằng tháng', yearly: 'Hằng năm' };

  function validateRule(r) {
    const e = [], M = D.money;
    if (!r || typeof r !== 'object') return ['rule'];
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.id)) e.push('id');
    if (!['Income', 'Expense'].includes(r.type)) e.push('type');
    if (!M.isValidAmount(r.amount) || !Number.isInteger(r.amount)) e.push('amount');
    const cats = r.type === 'Income' ? D.budget.INCOME_CATEGORIES : D.budget.EXPENSE_CATEGORIES;
    if (!cats.includes(r.category)) e.push('category');
    if (typeof r.person !== 'string' || r.person.length > 60) e.push('person');
    if (typeof r.note !== 'string' || r.note.length > 200) e.push('note');
    if (!CADENCES.includes(r.cadence)) e.push('cadence');
    if (!(Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= 12)) e.push('interval');
    if (!M.isDateKey(r.startDate)) e.push('startDate');
    if (r.endDate && (!M.isDateKey(r.endDate) || r.endDate < r.startDate)) e.push('endDate');
    if (!['active', 'paused'].includes(r.status)) e.push('status');
    if (!Array.isArray(r.skipped) || r.skipped.some(d => !M.isDateKey(d)) || r.skipped.length > 500) e.push('skipped');
    return e;
  }

  function nthDate(rule, n) {
    const [y, m, d] = rule.startDate.split('-').map(Number);
    if (rule.cadence === 'weekly') return D.money.addDays(rule.startDate, 7 * rule.interval * n);
    const monthsAhead = rule.cadence === 'monthly' ? rule.interval * n : 12 * rule.interval * n;
    const first = new Date(Date.UTC(y, m - 1 + monthsAhead, 1)), month = first.toISOString().slice(0, 7);
    return month + '-' + String(Math.min(d, D.money.daysInMonth(month))).padStart(2, '0');
  }
  function occurrenceId(ruleId, date) { return 'rec-' + ruleId + '-' + date; }
  // All due dates in [from, to] (inclusive), regardless of status. Deterministic.
  function occurrences(rule, from, to) {
    const out = [];
    for (let n = 0; n < 5000; n++) {
      const date = nthDate(rule, n);
      if (date > to || (rule.endDate && date > rule.endDate)) break;
      if (date >= from) out.push({ id: occurrenceId(rule.id, date), ruleId: rule.id, dueDate: date, type: rule.type, amount: rule.amount, category: rule.category, person: rule.person, note: rule.note, kind: 'planned' });
    }
    return out;
  }
  function nextOccurrence(rule, today) { if (rule.status !== 'active') return null; const list = occurrences(rule, today, D.money.addDays(today, 3700)); const skip = new Set(rule.skipped); return list.find(o => !skip.has(o.dueDate)) || null; }

  // Planned occurrences with derived status. `transactions` are posted/local records;
  // an occurrence is confirmed once a transaction with its ID exists.
  function planned(rules, transactions, from, to, today) {
    const ids = new Set(transactions.map(t => t.id));
    const out = [];
    for (const rule of rules) {
      if (rule.status !== 'active') continue;
      const skipped = new Set(rule.skipped || []);
      for (const o of occurrences(rule, from, to)) {
        const status = ids.has(o.id) ? 'confirmed' : skipped.has(o.dueDate) ? 'skipped' : o.dueDate < today ? 'overdue' : o.dueDate <= D.money.addDays(today, 7) ? 'due-soon' : 'pending';
        out.push({ ...o, status });
      }
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  }
  function toTransaction(occ, timestamp) {
    return { id: occ.id, timestamp, date: occ.dueDate, type: occ.type, amount: occ.amount, category: occ.category, person: occ.person || 'Gia đình', note: occ.note || '' };
  }
  function skip(rule, date) { return { ...rule, skipped: [...new Set([...(rule.skipped || []), date])].sort() }; }

  D.recurring = { CADENCES, CADENCE_LABELS, validateRule, occurrences, occurrenceId, nextOccurrence, planned, toTransaction, skip };
})(typeof globalThis !== 'undefined' ? globalThis : this);
