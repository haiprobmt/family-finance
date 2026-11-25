// Domain: loans. Legacy schedule rules are preserved exactly (characterized in tests):
//  - Techcombank is tracked only before 2026-11.
//  - Rows before Techcombank 2026-12 use the file's Interest column as the payment.
//  - Techcombank from 2026-12 uses principal * rate * days / 365 plus a fixed 909,400 principal.
//  - A missing bank/month is reported as missing, never as a confirmed zero.
//  - Any other bank (loans entered in the app) uses the file's Interest column as the payment and is
//    tracked from its first to its last scheduled month.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const TCB_PRINCIPAL_PAYMENT = 909400;
  const DAY_COUNT = 365;

  const LEGACY_BANKS = ['Shinhan', 'Techcombank'];
  // Loans entered in the app (any other bank name) are tracked from their first to their last
  // scheduled month; a gap inside that range is reported as missing.
  function addedLoanRanges(schedule) {
    const ranges = new Map();
    for (const r of (schedule && schedule.records) || []) {
      if (LEGACY_BANKS.includes(r.bank)) continue;
      const x = ranges.get(r.bank);
      if (!x) ranges.set(r.bank, { first: r.month, last: r.month });
      else { if (r.month < x.first) x.first = r.month; if (r.month > x.last) x.last = r.month; }
    }
    return [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
  }
  function trackedBanks(month, schedule) {
    const legacy = month < '2026-11' ? ['Shinhan', 'Techcombank'] : ['Shinhan'];
    return legacy.concat(addedLoanRanges(schedule).filter(([, x]) => month >= x.first && month <= x.last).map(([bank]) => bank));
  }
  function scheduleEnd(schedule) { return addedLoanRanges(schedule).reduce((end, [, x]) => (x.last > end ? x.last : end), schedule.end); }
  function loanScheduleRows(schedule) {
    const indexed = new Map(schedule.records.map(r => [r.bank + '|' + r.month, r]));
    const rows = [];
    for (const key of D.money.monthRange(schedule.start, scheduleEnd(schedule))) {
      for (const bank of trackedBanks(key, schedule)) rows.push(indexed.get(bank + '|' + key) || { bank, month: key, missing: true });
    }
    return rows;
  }
  function normalizeRates(saved) {
    saved = saved && typeof saved === 'object' ? saved : {};
    return { forecast: Number.isFinite(saved.forecast) && saved.forecast >= 0 && saved.forecast <= 100 ? saved.forecast : 12, actual: saved.actual && typeof saved.actual === 'object' ? saved.actual : {} };
  }
  function calculateLoanPayment(row, settings) {
    if (row.missing) return row;
    if (row.bank !== 'Techcombank' || row.month < '2026-12') return { ...row, payment: row.interest, rateType: 'Theo file' };
    const actual = settings.actual[row.month], hasActual = typeof actual === 'number' && Number.isFinite(actual) && actual >= 0 && actual <= 100;
    const rate = (hasActual ? actual : settings.forecast) / 100;
    const interest = row.principal * rate * row.days / DAY_COUNT;
    return { ...row, rate, interest, principalPayment: TCB_PRINCIPAL_PAYMENT, payment: interest + TCB_PRINCIPAL_PAYMENT, rateType: hasActual ? 'Thực tế' : 'Dự đoán' };
  }
  // Scheduled repayment for a month (legacy homeLoanSummary). `total` includes ExtraDebtMonthly and
  // only known rows; `missing` must be shown to the user whenever true.
  function loanSummary(schedule, month, rates) {
    const banks = trackedBanks(month, schedule);
    const rows = banks.map(bank => { const source = schedule.records.find(r => r.bank === bank && r.month === month); return source ? calculateLoanPayment(source, rates) : { bank, missing: true }; });
    const missing = rows.some(r => r.missing), label = month.split('-').reverse().join('/');
    const missingNote = !missing ? '' : month < schedule.start ? `${label}: chưa có lịch vay; dữ liệu bắt đầu từ 10/2026.` : `${label}: chưa có lịch ${rows.filter(r => r.missing).map(r => r.bank).join(', ')}.`;
    return { rows, missing, missingNote, total: (schedule.extraDebt || 0) + rows.reduce((sum, r) => sum + (r.missing ? 0 : Math.round(r.payment)), 0) };
  }
  // Principal/interest separation for accounting: principal reduces liability, interest is expense.
  function paymentBreakdown(row) {
    if (row.missing) return { bank: row.bank, missing: true };
    // Schedules from the file carry only the amount due (no principal split): principal is then unknown.
    const interest = Math.round(row.interest), principal = row.principalPayment === undefined ? null : Math.round(row.principalPayment);
    return { bank: row.bank, month: row.month, interest, principal, payment: Math.round(row.payment), expensePortion: interest, liabilityReduction: principal };
  }
  // Outstanding liability at a month cut-off from the schedule's interest-bearing principal.
  function liabilityAt(schedule, month) {
    const banks = trackedBanks(month, schedule), items = banks.map(bank => { const r = schedule.records.find(x => x.bank === bank && x.month === month); return r ? { bank, principal: Math.round(r.principal), month } : { bank, missing: true }; });
    const missing = items.filter(i => i.missing).map(i => i.bank);
    return { month, items, missing, complete: missing.length === 0, total: missing.length ? null : items.reduce((s, i) => s + i.principal, 0), knownTotal: items.reduce((s, i) => s + (i.principal || 0), 0) };
  }

  // Repayment simulation with explicit assumptions. Never authoritative; always labelled.
  // method: 'equal-principal' (fixed principal each month) or 'annuity' (fixed payment over termMonths).
  function simulateRepayment(input) {
    const p = { method: 'equal-principal', extraMonthly: 0, lumpSums: [], prepaymentFeeRate: 0, maxMonths: 600, ...input };
    const errors = [];
    if (!(p.principal > 0)) errors.push('principal');
    if (!(p.annualRate >= 0 && p.annualRate <= 1)) errors.push('annualRate');
    if (!D.money.isMonthKey(p.startMonth)) errors.push('startMonth');
    if (p.method === 'equal-principal' && !(p.monthlyPrincipal > 0)) errors.push('monthlyPrincipal');
    if (p.method === 'annuity' && !(Number.isInteger(p.termMonths) && p.termMonths > 0)) errors.push('termMonths');
    if (!(p.extraMonthly >= 0) || !(p.prepaymentFeeRate >= 0 && p.prepaymentFeeRate <= 1)) errors.push('extra');
    if (errors.length) return { ok: false, errors };
    const lump = new Map((p.lumpSums || []).map(l => [l.month, Math.round(l.amount)]));
    let balance = Math.round(p.principal), month = p.startMonth;
    const monthlyRate = p.annualRate / 12;
    const annuity = p.method === 'annuity' ? (monthlyRate === 0 ? p.principal / p.termMonths : p.principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -p.termMonths))) : 0;
    const rows = [];
    while (balance > 0 && rows.length < p.maxMonths) {
      const days = D.money.daysInMonth(month);
      const interest = Math.round(balance * p.annualRate * days / DAY_COUNT);
      let scheduled = p.method === 'annuity' ? Math.max(0, Math.round(annuity) - interest) : Math.round(p.monthlyPrincipal);
      scheduled = Math.min(scheduled, balance);
      const extra = Math.min(balance - scheduled, Math.round(p.extraMonthly) + (lump.get(month) || 0));
      const fee = Math.round(extra * p.prepaymentFeeRate);
      const opening = balance;
      balance -= scheduled + extra;
      rows.push({ month, opening, interest, scheduledPrincipal: scheduled, extraPrincipal: extra, fee, payment: interest + scheduled + extra + fee, closing: balance });
      month = D.money.shiftMonth(month, 1);
    }
    const total = k => rows.reduce((s, r) => s + r[k], 0);
    return {
      ok: true, kind: 'simulation', rows, months: rows.length, payoffMonth: balance > 0 ? null : rows[rows.length - 1].month, unpaidBalance: balance,
      totals: { interest: total('interest'), fees: total('fee'), principal: total('scheduledPrincipal') + total('extraPrincipal'), paid: total('payment') },
      assumptions: [
        `Dư nợ ban đầu ${Math.round(p.principal)} VND từ ${p.startMonth}`,
        `Lãi suất cố định ${(p.annualRate * 100).toFixed(3)}%/năm, ngày thực tế/${DAY_COUNT}, làm tròn lãi từng tháng`,
        p.method === 'annuity' ? `Trả góp đều ${p.termMonths} tháng` : `Gốc cố định ${Math.round(p.monthlyPrincipal)} VND/tháng`,
        `Trả thêm ${Math.round(p.extraMonthly)} VND/tháng` + (lump.size ? `, trả một lần ${[...lump].map(([m, a]) => a + ' VND (' + m + ')').join(', ')}` : ''),
        `Phí trả trước ${(p.prepaymentFeeRate * 100).toFixed(2)}% trên phần trả thêm`
      ]
    };
  }
  function compareRepayment(base, withExtra) {
    if (!base.ok || !withExtra.ok) return null;
    return { interestSaved: base.totals.interest - withExtra.totals.interest, feesPaid: withExtra.totals.fees, netSaving: base.totals.interest - withExtra.totals.interest - withExtra.totals.fees, monthsSaved: base.months - withExtra.months };
  }

  D.loan = { TCB_PRINCIPAL_PAYMENT, DAY_COUNT, LEGACY_BANKS, trackedBanks, scheduleEnd, loanScheduleRows, normalizeRates, calculateLoanPayment, loanSummary, paymentBreakdown, liabilityAt, simulateRepayment, compareRepayment };
})(typeof globalThis !== 'undefined' ? globalThis : this);
