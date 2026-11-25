// Domain: assets, valuations and net worth. Missing valuation = unknown (never zero).
// Historical net worth uses only valuations dated on/before the cut-off (no backfill).
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const ASSET_TYPES = ['cash', 'bank', 'real-estate', 'vehicle', 'investment', 'other'];
  const ASSET_TYPE_LABELS = { cash: 'Tiền mặt', bank: 'Tài khoản ngân hàng', 'real-estate': 'Bất động sản', vehicle: 'Phương tiện', investment: 'Đầu tư', other: 'Khác' };
  const ASSET_STATUSES = ['active', 'sold', 'closed'];
  const SOURCE_TYPES = ['estimate', 'statement', 'appraisal', 'market'];
  const SOURCE_LABELS = { estimate: 'Ước tính', statement: 'Sao kê', appraisal: 'Thẩm định', market: 'Giá thị trường', linked: 'Tiết kiệm tích lũy' };
  // Debts entered by hand (owed to relatives, credit cards, instalments…). Bank loans with a
  // schedule stay in the Loans sheet; these are added on top of them.
  const DEBT_TYPES = ['personal', 'credit-card', 'installment', 'other'];
  const DEBT_TYPE_LABELS = { personal: 'Vay người thân/bạn bè', 'credit-card': 'Thẻ tín dụng', installment: 'Trả góp', other: 'Khác' };
  const DEBT_STATUSES = ['active', 'paid'];

  const text = (v, max) => typeof v === 'string' && v.length <= max;
  const optDate = v => v === '' || v === undefined || v === null || D.money.isDateKey(v);
  const optAmount = v => v === '' || v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= D.money.MAX_AMOUNT);

  function validateAsset(a) {
    const e = [];
    if (!a || typeof a !== 'object') return ['asset'];
    if (!text(a.id, 100) || !a.id) e.push('id');
    if (!ASSET_TYPES.includes(a.type)) e.push('type');
    if (!text(a.name, 120) || !a.name.trim()) e.push('name');
    if ((a.currency || 'VND') !== 'VND') e.push('currency');
    if (!optDate(a.acquisitionDate)) e.push('acquisitionDate');
    if (!optAmount(a.acquisitionValue)) e.push('acquisitionValue');
    if (!optAmount(a.currentValue)) e.push('currentValue');
    if (!optDate(a.valuationDate)) e.push('valuationDate');
    if ((a.currentValue !== '' && a.currentValue !== undefined && a.currentValue !== null) && !a.valuationDate) e.push('valuationDate');
    if (!(typeof a.ownershipShare === 'number' && a.ownershipShare > 0 && a.ownershipShare <= 1)) e.push('ownershipShare');
    if (a.notes !== undefined && !text(a.notes, 500)) e.push('notes');
    if (!ASSET_STATUSES.includes(a.status || 'active')) e.push('status');
    if (!optDate(a.disposalDate)) e.push('disposalDate');
    return e;
  }
  function validateValuation(v) {
    const e = [];
    if (!v || typeof v !== 'object') return ['valuation'];
    if (!text(v.id, 120) || !v.id) e.push('id');
    if (!text(v.assetId, 100) || !v.assetId) e.push('assetId');
    if (!D.money.isDateKey(v.valuationDate)) e.push('valuationDate');
    if (!(typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0 && v.value <= D.money.MAX_AMOUNT)) e.push('value');
    if (!SOURCE_TYPES.includes(v.sourceType)) e.push('sourceType');
    if (v.note !== undefined && !text(v.note, 300)) e.push('note');
    return e;
  }

  function validateDebt(d) {
    const e = [];
    if (!d || typeof d !== 'object') return ['debt'];
    if (!text(d.id, 100) || !d.id) e.push('id');
    if (!DEBT_TYPES.includes(d.type)) e.push('type');
    if (!text(d.name, 120) || !d.name.trim()) e.push('name');
    if ((d.currency || 'VND') !== 'VND') e.push('currency');
    if (!(typeof d.balance === 'number' && Number.isFinite(d.balance) && d.balance >= 0 && d.balance <= D.money.MAX_AMOUNT)) e.push('balance');
    if (!D.money.isDateKey(d.balanceDate)) e.push('balanceDate');
    if (!optDate(d.startDate)) e.push('startDate');
    if (!DEBT_STATUSES.includes(d.status || 'active')) e.push('status');
    if (!optDate(d.paidDate)) e.push('paidDate');
    if ((d.status || 'active') === 'paid' && !d.paidDate) e.push('paidDate');
    if (d.notes !== undefined && !text(d.notes, 500)) e.push('notes');
    return e;
  }

  function heldAt(asset, cutoff) {
    if (asset.acquisitionDate && asset.acquisitionDate > cutoff) return false;
    const status = asset.status || 'active';
    if (status === 'active') return true;
    return !!asset.disposalDate && asset.disposalDate > cutoff;
  }
  // Latest valuation on/before cut-off; the asset's own currentValue counts as a valuation at valuationDate.
  function latestValuation(asset, valuations, cutoff) {
    const candidates = valuations.filter(v => v.assetId === asset.id && v.valuationDate <= cutoff).map(v => ({ value: v.value, date: v.valuationDate, source: v.sourceType, id: v.id }));
    if (typeof asset.currentValue === 'number' && asset.valuationDate && asset.valuationDate <= cutoff) candidates.push({ value: asset.currentValue, date: asset.valuationDate, source: 'estimate', id: asset.id + ':current' });
    candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return candidates[0] || null;
  }
  // "Tiền mặt" is linked to Tiết kiệm tích lũy (Báo cáo): the first cash asset (by id) is valued at the
  // accumulated income − expense of the transactions dated up to the cut-off, never by hand. Any other
  // cash asset keeps its own valuations (so the same money is never counted twice).
  function linkedCashId(assets) { const cash = assets.filter(a => a.type === 'cash').map(a => a.id).sort(); return cash.length ? cash[0] : null; }
  function assetPosition(assets, valuations, cutoff, transactions = null) {
    const linked = transactions ? linkedCashId(assets) : null;
    const items = assets.filter(a => heldAt(a, cutoff)).map(a => {
      const share = a.ownershipShare;
      if (a.id === linked) {
        const savings = D.cashflow.savingsAt(transactions, cutoff), v = savings === null ? null : { value: savings, date: cutoff, source: 'linked', id: a.id + ':linked' };
        return { id: a.id, name: a.name, type: a.type, share, valuation: v, value: v ? Math.round(savings * share) : null, unknown: !v, linked: true };
      }
      const v = latestValuation(a, valuations, cutoff);
      return { id: a.id, name: a.name, type: a.type, share, valuation: v, value: v ? Math.round(v.value * share) : null, unknown: !v };
    });
    const unknown = items.filter(i => i.unknown);
    // No registered assets is unknown (not a confirmed zero), like an unvalued asset.
    return { cutoff, items, total: unknown.length || !items.length ? null : items.reduce((s, i) => s + i.value, 0), knownTotal: items.reduce((s, i) => s + (i.value || 0), 0), unknownCount: unknown.length };
  }
  // A debt is owed at the cut-off from its start date until it is paid off. Its balance is known
  // only from balanceDate on: an earlier cut-off is unknown (never backfilled, never zero).
  function owedAt(debt, cutoff) {
    if (debt.startDate && debt.startDate > cutoff) return false;
    if ((debt.status || 'active') === 'paid') return !!debt.paidDate && debt.paidDate > cutoff;
    return true;
  }
  function debtPosition(debts, cutoff) {
    const items = debts.filter(d => owedAt(d, cutoff)).map(d => {
      const known = d.balanceDate <= cutoff;
      return { id: d.id, name: d.name, type: d.type, balanceDate: d.balanceDate, value: known ? d.balance : null, unknown: !known };
    });
    const unknown = items.filter(i => i.unknown);
    // No other debts is a confirmed zero (unlike assets): debts are optional extras on top of loans.
    return { cutoff, items, total: unknown.length ? null : items.reduce((s, i) => s + i.value, 0), knownTotal: items.reduce((s, i) => s + (i.value || 0), 0), unknownCount: unknown.length };
  }
  // Liabilities = scheduled bank loans (Loans sheet) + debts entered by hand, at the same cut-off.
  function liabilitiesAt({ schedule, debts = [], cutoff }) {
    const loans = schedule ? D.loan.liabilityAt(schedule, cutoff.slice(0, 7)) : { complete: false, total: null, knownTotal: 0, missing: ['schedule'], items: [] };
    const other = debtPosition(debts, cutoff);
    const complete = loans.complete && !other.unknownCount;
    return { items: loans.items, loans, debts: other, complete, missing: loans.missing.concat(other.items.filter(i => i.unknown).map(i => i.name)), knownTotal: loans.knownTotal + other.knownTotal, total: complete ? loans.total + other.total : null };
  }
  // Net worth = assets - liabilities at the same cut-off. Null unless both sides are complete.
  function netWorth({ assets = [], valuations = [], schedule, debts = [], cutoff, transactions = null }) {
    const a = assetPosition(assets, valuations, cutoff, transactions);
    const l = liabilitiesAt({ schedule, debts, cutoff });
    const gaps = [];
    if (!a.items.length) gaps.push('Chưa có tài sản nào được ghi nhận.');
    const linkedUnknown = a.items.filter(i => i.linked && i.unknown).length;
    if (linkedUnknown) gaps.push('Tiền mặt lấy từ Tiết kiệm tích lũy: chưa có khoản thu nhập nào từ 26/08/2026 đến ngày ' + D.money.dateLabel(cutoff) + '.');
    if (a.unknownCount - linkedUnknown) gaps.push((a.unknownCount - linkedUnknown) + ' tài sản chưa có định giá đến ngày ' + D.money.dateLabel(cutoff) + '.');
    if (!l.loans.complete) gaps.push('Thiếu dư nợ ' + l.loans.missing.join(', ') + ' tháng ' + D.money.monthLabel(cutoff.slice(0, 7)) + '.');
    if (l.debts.unknownCount) gaps.push(l.debts.unknownCount + ' khoản nợ chưa có số dư đến ngày ' + D.money.dateLabel(cutoff) + '.');
    const complete = !gaps.length;
    return { cutoff, assets: a, liabilities: l, complete, gaps, netWorth: complete ? a.total - l.total : null };
  }

  D.netWorth = { ASSET_TYPES, ASSET_TYPE_LABELS, ASSET_STATUSES, SOURCE_TYPES, SOURCE_LABELS, DEBT_TYPES, DEBT_TYPE_LABELS, DEBT_STATUSES, validateAsset, validateValuation, validateDebt, heldAt, latestValuation, linkedCashId, assetPosition, owedAt, debtPosition, liabilitiesAt, netWorth };
})(typeof globalThis !== 'undefined' ? globalThis : this);
