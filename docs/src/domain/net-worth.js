// Domain: assets, valuations and net worth. Missing valuation = unknown (never zero).
// Historical net worth uses only valuations dated on/before the cut-off (no backfill).
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const ASSET_TYPES = ['cash', 'bank', 'real-estate', 'vehicle', 'investment', 'other'];
  const ASSET_TYPE_LABELS = { cash: 'Tiền mặt', bank: 'Tài khoản ngân hàng', 'real-estate': 'Bất động sản', vehicle: 'Phương tiện', investment: 'Đầu tư', other: 'Khác' };
  const ASSET_STATUSES = ['active', 'sold', 'closed'];
  const SOURCE_TYPES = ['estimate', 'statement', 'appraisal', 'market'];
  const SOURCE_LABELS = { estimate: 'Ước tính', statement: 'Sao kê', appraisal: 'Thẩm định', market: 'Giá thị trường' };

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
  function assetPosition(assets, valuations, cutoff) {
    const items = assets.filter(a => heldAt(a, cutoff)).map(a => {
      const v = latestValuation(a, valuations, cutoff), share = a.ownershipShare;
      return { id: a.id, name: a.name, type: a.type, share, valuation: v, value: v ? Math.round(v.value * share) : null, unknown: !v };
    });
    const unknown = items.filter(i => i.unknown);
    // No registered assets is unknown (not a confirmed zero), like an unvalued asset.
    return { cutoff, items, total: unknown.length || !items.length ? null : items.reduce((s, i) => s + i.value, 0), knownTotal: items.reduce((s, i) => s + (i.value || 0), 0), unknownCount: unknown.length };
  }
  // Net worth = assets - liabilities at the same cut-off. Null unless both sides are complete.
  function netWorth({ assets = [], valuations = [], schedule, cutoff }) {
    const a = assetPosition(assets, valuations, cutoff);
    const l = schedule ? D.loan.liabilityAt(schedule, cutoff.slice(0, 7)) : { complete: false, total: null, knownTotal: 0, missing: ['schedule'], items: [] };
    const gaps = [];
    if (!a.items.length) gaps.push('Chưa có tài sản nào được ghi nhận.');
    if (a.unknownCount) gaps.push(a.unknownCount + ' tài sản chưa có định giá đến ngày ' + D.money.dateLabel(cutoff) + '.');
    if (!l.complete) gaps.push('Thiếu dư nợ ' + l.missing.join(', ') + ' tháng ' + D.money.monthLabel(cutoff.slice(0, 7)) + '.');
    const complete = !gaps.length;
    return { cutoff, assets: a, liabilities: l, complete, gaps, netWorth: complete ? a.total - l.total : null };
  }

  D.netWorth = { ASSET_TYPES, ASSET_TYPE_LABELS, ASSET_STATUSES, SOURCE_TYPES, SOURCE_LABELS, validateAsset, validateValuation, heldAt, latestValuation, assetPosition, netWorth };
})(typeof globalThis !== 'undefined' ? globalThis : this);
