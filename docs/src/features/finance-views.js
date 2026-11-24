'use strict';
// Family Finance 3.0 feature views. Presentation only: every number comes from FFDomain
// (deterministic, tested); persistence goes through extStore / the existing transaction
// pipeline. Actual, planned, scheduled and forecast values are labelled and never summed together.
const FD = FFDomain;
const FV = { cutoff: null, forecastMonths: 6, editingAssetId: null, valuationAssetId: null, editingRuleId: null, simulationKey: '' };
const fvToday = () => dateISO();
const fvUid = prefix => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fvAssets = () => extStore.values('assets');
const fvValuations = () => extStore.values('valuations');
const fvRules = () => extStore.values('recurring');
const fvLabel = id => FD.budget.LABELS[id] || 'Khác';
const fvPct = r => (r === null || r === undefined ? '—' : Math.round(r * 100) + '%');
const fvMonthName = m => FD.money.monthLabel(m);
const fvAmountOrUnknown = (v, unknown = 'Chưa đủ dữ liệu') => (v === null || v === undefined ? `<span class="unknown">${unknown}</span>` : money(v));
function fvMonthEnd(month) { return month + '-' + String(FD.money.daysInMonth(month)).padStart(2, '0'); }
function fvPlanned(from, to) { return FD.recurring.planned(fvRules(), transactions, from, to, fvToday()); }
function fvBudgetUtil(month) {
  const util = FD.budget.utilization(FD.cashflow.categoryTotals(transactions, month), FD.budget.effectiveBudgets(budgets, month, homeLoanSummary(month).total));
  const loanIncomplete = homeLoanSummary(month).missing && !Object.prototype.hasOwnProperty.call(FD.budget.limitsAt(budgets, month), 'loan-payment');
  return { ...util, loanIncomplete };
}

const C = FFUI.c;
const fvSmallBtn = (label, attrs, variant = 'secondary') => C.button({ label, variant, size: 'sm', attrs });

// ---------- reminders ----------
function fvReminderItems() {
  const today = fvToday();
  const planned = fvPlanned(FD.money.addDays(today, -45), FD.money.addDays(today, 7));
  return FD.insights.reminders({ planned, budget: fvBudgetUtil(today.slice(0, 7)), sync: syncState() });
}
function fvReminderMarkup(r) {
  const actions = ref => `<span class="row-actions">${fvSmallBtn('Xác nhận', { 'data-action': 'confirm-occ', 'data-occ-id': ref })}${fvSmallBtn('Bỏ qua', { 'data-action': 'skip-occ', 'data-occ-id': ref }, 'ghost')}</span>`;
  if (r.kind === 'overdue' || r.kind === 'due') return `<li class="reminder ${r.kind}"><span>${C.badge(r.kind === 'overdue' ? 'Quá hạn' : 'Sắp đến hạn', r.kind === 'overdue' ? 'danger' : 'warning')} ${escapeHtml(fvLabel(r.category))} · ${C.money(r.amount, { semantic: r.type === 'Income' ? 'income' : 'expense' })} · ${escapeHtml(FD.money.dateLabel(r.date))}</span>${actions(r.ref)}</li>`;
  if (r.kind === 'budget-warn') return `<li class="reminder warn"><span>${C.badge('Ngân sách', 'warning')} <b>${escapeHtml(fvLabel(r.category))}</b> đã dùng ${fvPct(r.ratio)} ngân sách tháng</span></li>`;
  if (r.kind === 'budget-over') return `<li class="reminder over"><span>${C.badge('Vượt', 'danger')} <b>${escapeHtml(fvLabel(r.category))}</b> vượt ngân sách ${money(r.spent - (r.limit || 0))}</span></li>`;
  if (r.kind === 'sync-failed') return `<li class="reminder over"><span>${C.badge('Đồng bộ lỗi', 'danger')} ${r.pending} thay đổi vẫn an toàn trên máy, sẽ gửi lại</span></li>`;
  if (r.kind === 'sync-conflict') return `<li class="reminder over"><span>${C.badge('Xung đột', 'danger')} Mở Giao dịch, Ngân sách hoặc Tài sản để chọn bản dùng</span></li>`;
  return '';
}
function renderReminders() {
  const items = fvReminderItems(), none = '<li>' + C.emptyState({ title: 'Không có nhắc việc', text: 'Khoản đến hạn, cảnh báo ngân sách và lỗi đồng bộ sẽ hiện ở đây.', iconName: 'check' }) + '</li>';
  $('#homeReminderList').innerHTML = items.slice(0, 4).map(fvReminderMarkup).join('') || none;
  $('#planReminderList').innerHTML = items.map(fvReminderMarkup).join('') || none;
}

// ---------- dashboard ----------
function renderDashboardExtras() {
  const mk = monthKey(activeMonth);
  const cutoff = mk >= fvToday().slice(0, 7) ? fvToday() : fvMonthEnd(mk);
  const nw = FD.netWorth.netWorth({ assets: fvAssets(), valuations: fvValuations(), schedule: LOAN_SCHEDULE, cutoff });
  $('#netWorthScope').textContent = 'Chốt ' + FD.money.dateLabel(cutoff) + (nw.gaps.length ? ' · ' + nw.gaps[0] : '');
  $('#dashNetWorth').innerHTML =
    C.metricCard({ label: 'Giá trị ròng', emphasis: true, state: nw.netWorth === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.netWorth, { compact: true, semantic: nw.netWorth < 0 ? 'expense' : null }), helperHtml: 'Tài sản − nợ cùng ngày chốt' }) +
    C.metricCard({ label: 'Tổng tài sản', state: nw.assets.total === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.assets.total, { compact: true }), helperHtml: nw.assets.unknownCount ? `<span class="unknown">${nw.assets.unknownCount} tài sản chưa định giá</span>` : 'Theo tỷ lệ sở hữu' }) +
    C.metricCard({ label: 'Tổng nợ', state: nw.liabilities.total === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.liabilities.total, { compact: true }), helperHtml: nw.liabilities.complete ? 'Dư nợ gốc theo lịch vay' : `<span class="unknown">Thiếu dư nợ ${escapeHtml(nw.liabilities.missing.join(', '))}</span>` });
  const u = fvBudgetUtil(mk), alerts = u.rows.filter(r => r.alert);
  $('#dashBudgetAlerts').innerHTML = (alerts.length ? `<ul class="reminder-list">${alerts.map(r => `<li class="reminder ${r.alert === 'over' ? 'over' : 'warn'}"><span>${C.badge(r.alert === 'over' ? 'Vượt' : '≥80%', r.alert === 'over' ? 'danger' : 'warning')} <b>${escapeHtml(fvLabel(r.id))}</b> ${r.alert === 'over' ? 'vượt ' + money(r.overBy) : 'đã dùng ' + fvPct(r.ratio)}</span></li>`).join('')}</ul>` : '<p class="text-sm muted">Chưa danh mục nào chạm ngưỡng 80%.</p>') + (u.loanIncomplete ? '<p class="text-sm unknown">Ngân sách trả nợ đang tạm tính vì thiếu lịch vay.</p>' : '');
}
function fvForecastTable(f) {
  const cell = v => C.money(v, { unknown: 'thiếu dữ liệu' });
  const table = C.dataTable({ caption: 'Dự báo dòng tiền', columns: [
    { key: 'month', label: 'Tháng', render: r => fvMonthName(r.month) },
    { key: 'pi', label: 'Thu kế hoạch', num: true, render: r => C.money(r.planned.income) },
    { key: 'pe', label: 'Chi kế hoạch', num: true, render: r => C.money(r.planned.expense) },
    { key: 'loan', label: 'Trả nợ dự kiến', num: true, render: r => cell(r.scheduledLoan.total) + (r.scheduledLoan.incomplete ? '<small class="unknown">tạm tính</small>' : '') },
    { key: 'ei', label: 'Thu ước tính', num: true, render: r => cell(r.estimated.income) },
    { key: 'ee', label: 'Chi ước tính', num: true, render: r => cell(r.estimated.expense) },
    { key: 'net', label: 'Ròng ước tính', num: true, render: r => C.money(r.projectedNet, { unknown: 'thiếu dữ liệu', semantic: r.projectedNet < 0 ? 'expense' : null }) }
  ], rows: f.rows, cls: 'forecast' });
  return table + '<ul class="assumptions">' + f.assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('') + '</ul>';
}

// ---------- budget insights ----------
function renderBudgetInsights() {
  const mk = monthKey(activeMonth), u = fvBudgetUtil(mk);
  const cmp = FD.budget.compare(FD.cashflow.categoryTotals(transactions, mk), FD.cashflow.categoryTotals(transactions, FD.money.shiftMonth(mk, -1))).filter(c => c.previous || c.current).slice(0, 6);
  const plannedOpen = fvPlanned(mk + '-01', fvMonthEnd(mk)).filter(o => o.type === 'Expense' && !['confirmed', 'skipped'].includes(o.status));
  const alerts = u.rows.filter(r => r.alert).sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  const alertHtml = alerts.length ? `<ul class="reminder-list">${alerts.map(r => `<li class="reminder ${r.alert === 'over' ? 'over' : 'warn'}"><span><b>${escapeHtml(fvLabel(r.id))}</b> ${r.alert === 'over' ? 'vượt ' + money(r.overBy) : 'đã dùng ' + fvPct(r.ratio)}</span></li>`).join('')}</ul>` : '<p class="text-sm muted">Không có danh mục chạm ngưỡng.</p>';
  const cmpHtml = cmp.length ? `<h3>So với tháng trước</h3>` + C.dataTable({ caption: 'So sánh chi tiêu với tháng trước', columns: [
    { key: 'id', label: 'Danh mục', render: c => escapeHtml(fvLabel(c.id)) },
    { key: 'current', label: 'Tháng này', num: true, render: c => C.money(c.current) },
    { key: 'change', label: 'Thay đổi', num: true, render: c => C.money(c.change, { semantic: c.change > 0 ? 'expense' : c.change < 0 ? 'income' : null, sign: 'value' }) }
  ], rows: cmp }) : '';
  const plannedHtml = plannedOpen.length ? `<p class="text-sm">${C.badge('Kế hoạch', 'planned')} ${plannedOpen.length} khoản định kỳ chưa xác nhận, tổng ${money(FD.money.sum(plannedOpen, o => o.amount))} — <b>không</b> tính vào "đã chi".</p>` : '';
  $('#budgetInsights').innerHTML = alertHtml + cmpHtml + plannedHtml;
}

// ---------- assets & loans ----------
function fvExtBanner() {
  const st = extStore.state(), notes = [];
  if (!endpoint()) notes.push('Chưa kết nối Google Sheets: tài sản và khoản định kỳ đang lưu trên máy này.');
  else if (st.supported === false) notes.push('Apps Script đang chạy chưa có tính năng Tài sản/Định kỳ (cần triển khai Code.gs 3.0). Dữ liệu đang chỉ lưu trên máy này.');
  else if (FFExt.NAMES.some(n => extStore.collection(n).available === false)) notes.push('Google Sheets chưa được bật tính năng này (chủ sở hữu cần chạy migrationsApply). Dữ liệu đang chỉ lưu trên máy này.');
  if (st.lastError) notes.push('Lỗi đồng bộ gần nhất: ' + st.lastError);
  $('#extBanner').hidden = !notes.length;
  $('#extBanner').innerHTML = notes.length ? C.alert({ variant: st.lastError ? 'danger' : 'warning', title: 'Dữ liệu chưa đồng bộ đầy đủ', bodyHtml: notes.map(n => `<p>${escapeHtml(n)}</p>`).join('') }) : '';
}
function fvConflictBanner(selector, names, label) {
  const conflicted = names.filter(n => extStore.collection(n).remote);
  $(selector).hidden = !conflicted.length;
  $(selector).innerHTML = conflicted.length ? C.alert({ variant: 'danger', role: 'alert', title: label + ' đã được sửa ở thiết bị khác', bodyHtml: 'Chọn bản muốn giữ; không có thay đổi nào bị xóa cho đến khi bạn chọn.', actionsHtml: conflicted.map(n => fvSmallBtn('Dùng bản trên Sheets', { 'data-action': 'resolve', 'data-collection': n, 'data-choice': 'remote' }) + fvSmallBtn('Ghi bản trên máy', { 'data-action': 'resolve', 'data-collection': n, 'data-choice': 'local' }, 'danger')).join('') }) : '';
}
function renderAssets() {
  fvExtBanner();
  if (!FV.cutoff) FV.cutoff = fvToday();
  $('#netWorthCutoff').value = FV.cutoff;
  const nw = FD.netWorth.netWorth({ assets: fvAssets(), valuations: fvValuations(), schedule: LOAN_SCHEDULE, cutoff: FV.cutoff });
  $('#netWorthSummary').innerHTML = `<div class="metric-grid metric-grid-3">${C.metricCard({ label: 'Tài sản (theo tỷ lệ sở hữu)', state: nw.assets.total === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.assets.total), helperHtml: nw.assets.unknownCount ? 'Đã biết: ' + money(nw.assets.knownTotal) : 'Định giá gần nhất' })}${C.metricCard({ label: 'Dư nợ vay', state: nw.liabilities.total === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.liabilities.total), helperHtml: !nw.liabilities.complete && nw.liabilities.knownTotal ? 'Đã biết: ' + money(nw.liabilities.knownTotal) : 'Theo lịch vay tháng ' + fvMonthName(FV.cutoff.slice(0, 7)) })}${C.metricCard({ label: 'Giá trị ròng', emphasis: true, state: nw.netWorth === null ? 'unavailable' : 'ready', valueHtml: C.money(nw.netWorth, { semantic: nw.netWorth < 0 ? 'expense' : null }), helperHtml: 'Tài sản − nợ' })}</div>${nw.gaps.length ? '<ul class="gaps">' + nw.gaps.map(g => `<li>${escapeHtml(g)}</li>`).join('') + '</ul>' : ''}`;
  fvConflictBanner('#assetConflict', ['assets', 'valuations'], 'Tài sản hoặc định giá');
  const items = new Map(nw.assets.items.map(i => [i.id, i]));
  $('#assetList').innerHTML = C.dataTable({ caption: 'Danh sách tài sản', rows: fvAssets(), emptyHtml: C.emptyState({ title: 'Chưa có tài sản', text: 'Thêm tài khoản, tiền mặt, nhà, xe hoặc đầu tư để tính giá trị ròng.', iconName: 'assets', actionHtml: C.button({ label: 'Thêm tài sản', variant: 'primary', iconName: 'plus', attrs: { 'data-action': 'add-asset' } }) }), columns: [
    { key: 'name', label: 'Tài sản', render: a => `${escapeHtml(a.name)}<small>${escapeHtml(FD.netWorth.ASSET_TYPE_LABELS[a.type] || a.type)}${a.status !== 'active' ? ' · ' + (a.status === 'sold' ? 'đã bán' : 'đã đóng') : ''}</small>` },
    { key: 'share', label: 'Sở hữu', num: true, render: a => Math.round(a.ownershipShare * 1000) / 10 + '%' },
    { key: 'value', label: 'Giá trị', num: true, render: a => { const p = items.get(a.id); return p ? (p.unknown ? '<span class="unknown">Chưa có định giá</span>' : C.money(p.value)) : '<span class="muted">Không nắm giữ tại ngày chốt</span>'; } },
    { key: 'val', label: 'Định giá', render: a => { const v = items.get(a.id)?.valuation; return v ? `${escapeHtml(FD.money.dateLabel(v.date))}<small>${escapeHtml(FD.netWorth.SOURCE_LABELS[v.source] || v.source)}</small>` : '—'; } },
    { key: 'actions', label: 'Thao tác', render: a => `<span class="row-actions">${fvSmallBtn('Định giá', { 'data-action': 'value-asset', 'data-id': a.id })}${fvSmallBtn('Sửa', { 'data-action': 'edit-asset', 'data-id': a.id }, 'ghost')}${C.button({ label: 'Xóa', variant: 'ghost', size: 'sm', cls: 'danger-text', attrs: { 'data-action': 'delete-asset', 'data-id': a.id, 'aria-label': 'Xóa ' + a.name } })}</span>` }
  ] });
  const l = FD.loan.liabilityAt(LOAN_SCHEDULE, FV.cutoff.slice(0, 7));
  $('#liabilitySummary').innerHTML = C.kv(l.items.map(i => [i.bank, i.missing ? '<span class="unknown">Thiếu dữ liệu</span>' : C.money(i.principal)]).concat([['Tổng nợ', l.complete ? `<b>${C.money(l.total)}</b>` : '<span class="unknown">Chưa đủ dữ liệu</span>']]));
  renderLoanPosition();
  fvSimulatorOptions();
}
function renderLoanPosition() {
  const month = FV.cutoff.slice(0, 7), s = homeLoanSummary(month), l = FD.loan.liabilityAt(LOAN_SCHEDULE, month);
  const coverage = bank => { const months = LOAN_SCHEDULE.records.filter(r => r.bank === bank).map(r => r.month).sort(); return months.length ? fvMonthName(months[months.length - 1]) : 'Chưa có'; };
  const rate = v => new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 3 }).format(v);
  const items = s.rows.map(r => { const b = FD.loan.paymentBreakdown(r), liab = l.items.find(i => i.bank === r.bank); return { bank: r.bank, badgeHtml: r.missing ? C.badge('Thiếu dữ liệu', 'warning') : C.badge(r.rateType || 'Theo file', r.rateType === 'Dự đoán' ? 'forecast' : 'neutral'), outstanding: liab && !liab.missing ? liab.principal : null, rateText: r.missing ? '—' : rate(r.rate), interest: b.missing ? null : b.interest, principal: b.missing ? undefined : b.principal, payment: b.missing ? null : b.payment, coverage: coverage(r.bank) }; });
  $('#loanPosition').innerHTML = `<p class="text-sm muted">Tháng ${fvMonthName(month)} (theo ngày chốt ở Tài sản &amp; Nợ).</p>` + C.loanSummary(items) + C.kv([['Trả thêm hằng tháng (FinanceSettings)', C.money(LOAN_SCHEDULE.extraDebt || 0)], ['Tổng dự kiến tháng', `<b>${C.money(s.total)}</b>` + (s.missing ? ` <span class="unknown">(tạm tính — ${escapeHtml(s.missingNote)})</span>` : '')]]);
}
function fvLatestRecords() {
  const month = FV.cutoff.slice(0, 7), latest = {};
  for (const r of [...LOAN_SCHEDULE.records].sort((a, b) => a.month.localeCompare(b.month))) if (!latest[r.bank] || r.month <= month) latest[r.bank] = r;
  return latest;
}
function fvSimulatorOptions() {
  const latest = fvLatestRecords(), key = JSON.stringify(latest);
  if (key === FV.simulationKey) return;
  FV.simulationKey = key;
  $('#simLoan').innerHTML = Object.keys(latest).map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)} (${fvMonthName(latest[b].month)})</option>`).join('') + '<option value="">Nhập tay</option>';
  fvPrefillSimulator();
}
function fvPrefillSimulator() {
  const bank = $('#simLoan').value, r = fvLatestRecords()[bank];
  $('#simStart').value = FD.money.shiftMonth(fvToday().slice(0, 7), 1);
  if (!r) return;
  const next = LOAN_SCHEDULE.records.filter(x => x.bank === bank && x.month > r.month).sort((a, b) => a.month.localeCompare(b.month))[0];
  $('#simPrincipal').value = new Intl.NumberFormat('vi-VN').format(Math.round(r.principal));
  $('#simRate').value = Math.round(r.rate * 100000) / 1000;
  const step = next ? Math.round(r.principal - next.principal) : bank === 'Techcombank' ? FD.loan.TCB_PRINCIPAL_PAYMENT : 0;
  $('#simMonthlyPrincipal').value = step > 0 ? new Intl.NumberFormat('vi-VN').format(step) : '';
}
function fvRunSimulation() {
  const method = $('#simMethod').value;
  const input = { principal: parseDigits($('#simPrincipal').value), annualRate: Number($('#simRate').value) / 100, startMonth: $('#simStart').value, method, monthlyPrincipal: parseDigits($('#simMonthlyPrincipal').value), termMonths: Math.trunc(Number($('#simTerm').value)), extraMonthly: parseDigits($('#simExtra').value), prepaymentFeeRate: Number($('#simFee').value || 0) / 100 };
  const r = FD.insights.repaymentSimulation(input);
  if (r.error) { $('#simulatorResult').innerHTML = C.alert({ variant: 'warning', title: 'Thiếu hoặc sai thông tin', bodyHtml: escapeHtml(r.errors.join(', ')) }); return; }
  const d = r.data, c = d.comparison;
  $('#simulatorResult').innerHTML = `<div class="metric-grid metric-grid-3">${C.metricCard({ label: 'Không trả thêm', valueHtml: d.baseline.months + ' tháng', helperHtml: 'Lãi ' + money(d.baseline.interest) + ' · xong ' + (d.baseline.payoffMonth ? fvMonthName(d.baseline.payoffMonth) : '—') })}${C.metricCard({ label: 'Có trả thêm', valueHtml: d.withExtra.months + ' tháng', helperHtml: 'Lãi ' + money(d.withExtra.interest) + ' · phí ' + money(d.withExtra.fees) })}${C.metricCard({ label: 'Tiết kiệm ròng (ước tính)', emphasis: true, valueHtml: C.money(c.netSaving), helperHtml: 'Sớm ' + c.monthsSaved + ' tháng', badgeHtml: C.badge('Mô phỏng', 'forecast') })}</div><p class="text-sm muted">Giả định:</p><ul class="assumptions">${d.assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`;
}

// ---------- plan: calendar, rules, forecast ----------
function renderPlan() {
  const today = fvToday(), end = FD.money.addDays(today, 60);
  const occ = fvPlanned(FD.money.addDays(today, -45), end).filter(o => o.dueDate >= today || o.status === 'overdue');
  const loans = FD.money.monthRange(today.slice(0, 7), end.slice(0, 7)).map(m => ({ date: m + '-01', loan: homeLoanSummary(m), month: m }));
  const byDate = new Map();
  for (const o of occ) { if (!byDate.has(o.dueDate)) byDate.set(o.dueDate, []); byDate.get(o.dueDate).push({ occ: o }); }
  for (const l of loans) { const d = l.date < today ? today : l.date; if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push({ loan: l }); }
  const statusBadge = { confirmed: ['Đã ghi', 'success'], skipped: ['Bỏ qua', 'neutral'], overdue: ['Quá hạn', 'danger'], 'due-soon': ['Sắp đến', 'warning'], pending: ['Chờ', 'neutral'] };
  $('#financialCalendar').innerHTML = [...byDate.keys()].sort().map(d => `<section class="cal-day"><h3>${escapeHtml(FD.money.dateLabel(d))}</h3>${byDate.get(d).map(x => x.occ
    ? `<div class="cal-item ${x.occ.status}"><span><b>${escapeHtml(x.occ.note || fvLabel(x.occ.category))}</b><small>${x.occ.type === 'Income' ? 'Thu' : 'Chi'} · ${escapeHtml(fvLabel(x.occ.category))} · ${C.badge(...statusBadge[x.occ.status])}</small></span>${C.money(x.occ.amount, { semantic: x.occ.type === 'Income' ? 'income' : 'expense', sign: true })}${['pending', 'due-soon', 'overdue'].includes(x.occ.status) ? `<span class="row-actions">${fvSmallBtn('Xác nhận', { 'data-action': 'confirm-occ', 'data-occ-id': x.occ.id })}${fvSmallBtn('Bỏ qua', { 'data-action': 'skip-occ', 'data-occ-id': x.occ.id }, 'ghost')}</span>` : ''}</div>`
    : `<div class="cal-item scheduled"><span><b>Lịch trả nợ ${fvMonthName(x.loan.month)}</b><small>${C.badge('Lịch dự kiến', 'scheduled')}${x.loan.loan.missing ? ' tạm tính — ' + escapeHtml(x.loan.loan.missingNote) : ''}</small></span>${C.money(x.loan.loan.total, { semantic: 'expense', sign: true })}</div>`).join('')}</section>`).join('') || C.emptyState({ title: 'Không có khoản nào trong 60 ngày tới', iconName: 'calendar' });
  fvConflictBanner('#ruleConflict', ['recurring'], 'Khoản định kỳ');
  $('#ruleList').innerHTML = fvRules().map(r => { const next = FD.recurring.nextOccurrence(r, today); return `<article class="item ${r.status}"><div class="item-main"><b>${escapeHtml(r.note || fvLabel(r.category))}</b><span>${r.type === 'Income' ? 'Thu' : 'Chi'} · ${escapeHtml(fvLabel(r.category))} · ${escapeHtml(FD.recurring.CADENCE_LABELS[r.cadence])}${r.interval > 1 ? ' (mỗi ' + r.interval + ')' : ''}${r.status === 'paused' ? ' · tạm dừng' : ''}</span></div><div class="item-value">${C.money(r.amount, { semantic: r.type === 'Income' ? 'income' : 'expense' })}<small>${next ? 'Kế tiếp ' + escapeHtml(FD.money.dateLabel(next.dueDate)) : 'Không có kỳ tới'}</small></div><div class="row-actions">${fvSmallBtn('Sửa', { 'data-action': 'edit-rule', 'data-id': r.id })}${fvSmallBtn(r.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng', { 'data-action': 'toggle-rule', 'data-id': r.id }, 'ghost')}${C.button({ label: 'Xóa', variant: 'ghost', size: 'sm', cls: 'danger-text', attrs: { 'data-action': 'delete-rule', 'data-id': r.id } })}</div></article>`; }).join('') || C.emptyState({ title: 'Chưa có khoản định kỳ', text: 'Thêm tiền nhà, học phí, lương… để thấy lịch và dự báo.', iconName: 'calendar' });
  const f = FD.forecast.forecastCashFlow({ transactions, rules: fvRules(), schedule: LOAN_SCHEDULE, rates: loanRates, fromMonth: FD.money.shiftMonth(today.slice(0, 7), 1), months: FV.forecastMonths, today });
  $('#forecastTable').innerHTML = fvForecastTable(f);
}

// ---------- settings diagnostics ----------
function renderSyncDiagnostics() {
  const st = syncState(), ops = operations(), counts = {};
  ops.forEach(o => { counts[o.entityType] = (counts[o.entityType] || 0) + 1; });
  $('#syncDiagnostics').textContent = 'Trạng thái: ' + st.label + (ops.length ? ' · Chờ gửi: ' + Object.entries(counts).map(([k, v]) => v + ' ' + ({ transaction: 'giao dịch', budgets: 'ngân sách', assets: 'tài sản', valuations: 'định giá', recurring: 'định kỳ' }[k] || k)).join(', ') : '') + (st.error ? ' · Lỗi: ' + st.error : '');
}

function renderFinanceViews() {
  try { renderReminders(); renderDashboardExtras(); renderBudgetInsights(); renderAssets(); renderPlan(); renderSyncDiagnostics(); }
  catch (error) { console.error('finance views', error); }
  const btn = $('#privacyBtn'); btn.setAttribute('aria-pressed', String(hideAmounts)); btn.setAttribute('aria-label', hideAmounts ? 'Hiện số tiền' : 'Ẩn số tiền'); btn.innerHTML = FFUI.icon(hideAmounts ? 'eyeOff' : 'eye');
  document.body.classList.toggle('amounts-hidden', hideAmounts);
}

// ---------- actions ----------
async function fvAfterExtEdit(message) {
  if (!endpoint()) return showToast(message + ' · Lưu trên máy');
  await syncWithSheet(true);
  const pending = extStore.operations().length;
  showToast(pending ? message + ' · Đã lưu trên máy, chờ đồng bộ' : message + ' · Đã đồng bộ Google Sheets');
}
function fvFindOccurrence(id) { const today = fvToday(); return fvPlanned(FD.money.addDays(today, -400), FD.money.addDays(today, 400)).find(o => o.id === id); }
async function fvConfirmOccurrence(id) {
  const o = fvFindOccurrence(id); if (!o) return showToast('Không tìm thấy khoản định kỳ');
  if (o.status === 'confirmed') return showToast('Khoản này đã được ghi');
  if (!confirm(`Ghi ${o.type === 'Income' ? 'thu nhập' : 'khoản chi'} “${o.note || fvLabel(o.category)}” ${money(o.amount)} ngày ${FD.money.dateLabel(o.dueDate)} thành giao dịch thực tế?`)) return;
  await saveTransaction({ id: o.id, type: o.type, amount: o.amount, category: o.category, person: o.person, date: o.dueDate, note: o.note });
  render();
}
function fvSkipOccurrence(id) {
  const o = fvFindOccurrence(id); if (!o) return;
  extStore.edit('recurring', fvRules().map(r => (r.id === o.ruleId ? FD.recurring.skip(r, o.dueDate) : r)));
  fvAfterExtEdit('Đã bỏ qua kỳ ' + FD.money.dateLabel(o.dueDate));
}
function fvDrill(type) {
  const mk = monthKey(activeMonth), rows = FD.cashflow.sourceRows(transactions, { month: mk, type }).sort(sortTx);
  detailCategory = null;
  $('#categoryDetailTitle').textContent = type === 'Income' ? 'Thu nhập' : 'Chi tiêu';
  $('#categoryDetailScope').textContent = fvMonthName(mk) + ' · ' + rows.length + ' giao dịch nguồn';
  $('#categoryDetailTotal').textContent = money(FD.money.sum(rows, r => r.amount));
  $('#categoryDetailBody').innerHTML = rows.map(t => detailRow(t)).join('');
  $('#categoryDetailEmpty').hidden = !!rows.length; $('#categoryDetailTable').hidden = !rows.length;
  openOverlay('#categoryDetailOverlay', document.activeElement);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const id = b.dataset.id, action = b.dataset.action;
  if (action === 'confirm-occ') fvConfirmOccurrence(b.dataset.occId);
  else if (action === 'sync-now') { retryUnsynced().then(() => syncWithSheet(false)); }
  else if (action === 'add-asset') fvOpenAsset(null);
  else if (action === 'skip-occ') fvSkipOccurrence(b.dataset.occId);
  else if (action === 'drill') fvDrill(b.dataset.type);
  else if (action === 'resolve') { if (b.dataset.choice === 'local' && !confirm('Ghi bản trên máy này thay cho bản trên Google Sheets?')) return; extStore.resolve(b.dataset.collection, b.dataset.choice); if (b.dataset.choice === 'local') fvAfterExtEdit('Đã chọn bản trên máy'); }
  else if (action === 'edit-asset') fvOpenAsset(id);
  else if (action === 'value-asset') fvOpenValuation(id);
  else if (action === 'delete-asset') { const a = fvAssets().find(x => x.id === id); if (!a || !confirm(`Xóa tài sản “${a.name}” và lịch sử định giá của nó?`)) return; extStore.edit('assets', fvAssets().filter(x => x.id !== id)); if (fvValuations().some(v => v.assetId === id)) extStore.edit('valuations', fvValuations().filter(v => v.assetId !== id)); fvAfterExtEdit('Đã xóa tài sản'); }
  else if (action === 'edit-rule') fvOpenRule(id);
  else if (action === 'toggle-rule') { extStore.edit('recurring', fvRules().map(r => (r.id === id ? { ...r, status: r.status === 'paused' ? 'active' : 'paused' } : r))); fvAfterExtEdit('Đã cập nhật khoản định kỳ'); }
  else if (action === 'delete-rule') { const r = fvRules().find(x => x.id === id); if (!r || !confirm(`Xóa khoản định kỳ “${r.note || fvLabel(r.category)}”? Giao dịch đã ghi vẫn giữ nguyên.`)) return; extStore.edit('recurring', fvRules().filter(x => x.id !== id)); fvAfterExtEdit('Đã xóa khoản định kỳ'); }
});
document.querySelectorAll('[data-close-overlay]').forEach(b => b.addEventListener('click', () => closeOverlay('#' + b.dataset.closeOverlay)));

// asset form
$('#assetType').innerHTML = FD.netWorth.ASSET_TYPES.map(t => `<option value="${t}">${FD.netWorth.ASSET_TYPE_LABELS[t]}</option>`).join('');
$('#valSource').innerHTML = FD.netWorth.SOURCE_TYPES.map(t => `<option value="${t}">${FD.netWorth.SOURCE_LABELS[t]}</option>`).join('');
const fvFmt = n => (n === '' || n === null || n === undefined ? '' : new Intl.NumberFormat('vi-VN').format(n));
['#assetValue', '#assetAcqValue', '#valValue', '#ruleAmount', '#simPrincipal', '#simMonthlyPrincipal', '#simExtra'].forEach(s => $(s).addEventListener('input', e => { const v = parseDigits(e.target.value); e.target.value = v ? fvFmt(v) : ''; }));
function fvOpenAsset(id) {
  FV.editingAssetId = id || null;
  const a = fvAssets().find(x => x.id === id) || { type: 'bank', name: '', currentValue: '', valuationDate: fvToday(), ownershipShare: 1, acquisitionDate: '', acquisitionValue: '', status: 'active', disposalDate: '', notes: '' };
  $('#assetFormTitle').textContent = id ? 'Sửa tài sản' : 'Thêm tài sản';
  $('#assetType').value = a.type; $('#assetName').value = a.name; $('#assetValue').value = fvFmt(a.currentValue); $('#assetValuationDate').value = a.valuationDate || '';
  $('#assetShare').value = Math.round(a.ownershipShare * 1000) / 10; $('#assetAcqDate').value = a.acquisitionDate || ''; $('#assetAcqValue').value = fvFmt(a.acquisitionValue);
  $('#assetStatus').value = a.status || 'active'; $('#assetDisposal').value = a.disposalDate || ''; $('#assetNotes').value = a.notes || '';
  openOverlay('#assetOverlay'); $('#assetName').focus();
}
$('#addAssetBtn').onclick = () => fvOpenAsset(null);
$('#assetForm').addEventListener('submit', e => {
  e.preventDefault();
  const num = s => ($(s).value.trim() === '' ? '' : parseDigits($(s).value));
  const asset = { id: FV.editingAssetId || fvUid('a'), type: $('#assetType').value, name: $('#assetName').value.trim(), currency: 'VND', acquisitionDate: $('#assetAcqDate').value, acquisitionValue: num('#assetAcqValue'), currentValue: num('#assetValue'), valuationDate: $('#assetValuationDate').value, ownershipShare: Math.round(Number($('#assetShare').value) * 10) / 1000, notes: $('#assetNotes').value.trim(), status: $('#assetStatus').value, disposalDate: $('#assetDisposal').value };
  if (asset.currentValue === '') asset.valuationDate = ''; // no value → no valuation date; history lives in AssetValuations
  const errors = FD.netWorth.validateAsset(asset);
  if (errors.length) return showToast('Kiểm tra lại: ' + errors.join(', '));
  const list = fvAssets().filter(x => x.id !== asset.id).concat(asset);
  extStore.edit('assets', list); closeOverlay('#assetOverlay');
  fvAfterExtEdit(FV.editingAssetId ? 'Đã sửa tài sản' : 'Đã thêm tài sản');
});
function fvOpenValuation(assetId) {
  FV.valuationAssetId = assetId; const a = fvAssets().find(x => x.id === assetId); if (!a) return;
  $('#valuationTitle').textContent = 'Định giá · ' + a.name; $('#valDate').value = fvToday(); $('#valValue').value = ''; $('#valSource').value = 'estimate'; $('#valNote').value = '';
  const history = fvValuations().filter(v => v.assetId === assetId).sort((x, y) => y.valuationDate.localeCompare(x.valuationDate));
  $('#valHistory').innerHTML = history.length ? '<p class="dash-note">Lịch sử định giá</p><ul class="assumptions">' + history.map(v => `<li>${escapeHtml(FD.money.dateLabel(v.valuationDate))}: ${money(v.value)} (${escapeHtml(FD.netWorth.SOURCE_LABELS[v.sourceType])})</li>`).join('') + '</ul>' : '';
  openOverlay('#valuationOverlay'); $('#valValue').focus();
}
$('#valuationForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = { id: fvUid('v'), assetId: FV.valuationAssetId, valuationDate: $('#valDate').value, value: parseDigits($('#valValue').value), sourceType: $('#valSource').value, note: $('#valNote').value.trim() };
  if ($('#valValue').value.trim() === '') return showToast('Nhập giá trị định giá');
  const errors = FD.netWorth.validateValuation(v); if (errors.length) return showToast('Kiểm tra lại: ' + errors.join(', '));
  extStore.edit('valuations', fvValuations().concat(v)); closeOverlay('#valuationOverlay');
  fvAfterExtEdit('Đã lưu định giá');
});
$('#netWorthCutoff').addEventListener('change', e => { if (FD.money.isDateKey(e.target.value)) { FV.cutoff = e.target.value; FV.simulationKey = ''; renderAssets(); } });
$('#simLoan').addEventListener('change', fvPrefillSimulator);
$('#simMethod').addEventListener('change', () => { const a = $('#simMethod').value === 'annuity'; $('#simTermField').hidden = !a; $('#simPrincipalField').hidden = a; });
$('#simulatorForm').addEventListener('submit', e => { e.preventDefault(); fvRunSimulation(); });

// rule form
$('#ruleCadence').innerHTML = FD.recurring.CADENCES.map(c => `<option value="${c}">${FD.recurring.CADENCE_LABELS[c]}</option>`).join('');
function fvRuleCategories(type, selected) { $('#ruleCategory').innerHTML = (type === 'Income' ? INCOME_CATS : EXPENSE_CATS).map(c => `<option value="${c[0]}" ${c[0] === selected ? 'selected' : ''}>${escapeHtml(c[1])}</option>`).join(''); }
$('#ruleType').addEventListener('change', () => fvRuleCategories($('#ruleType').value));
function fvOpenRule(id) {
  FV.editingRuleId = id || null;
  const r = fvRules().find(x => x.id === id) || { type: 'Expense', category: 'home', amount: '', cadence: 'monthly', interval: 1, startDate: fvToday(), endDate: '', person: 'Gia đình', note: '', status: 'active' };
  $('#ruleFormTitle').textContent = id ? 'Sửa khoản định kỳ' : 'Thêm khoản định kỳ';
  $('#ruleType').value = r.type; fvRuleCategories(r.type, r.category); $('#ruleAmount').value = fvFmt(r.amount); $('#ruleCadence').value = r.cadence; $('#ruleInterval').value = r.interval;
  $('#ruleStart').value = r.startDate; $('#ruleEnd').value = r.endDate || '';
  if (![...$('#rulePerson').options].some(o => o.value === r.person)) $('#rulePerson').add(new Option(r.person, r.person));
  $('#rulePerson').value = r.person; $('#ruleNote').value = r.note; $('#rulePaused').checked = r.status === 'paused';
  openOverlay('#ruleOverlay'); $('#ruleAmount').focus();
}
$('#addRuleBtn').onclick = () => fvOpenRule(null);
$('#ruleForm').addEventListener('submit', e => {
  e.preventDefault();
  const prev = fvRules().find(x => x.id === FV.editingRuleId);
  const rule = { id: FV.editingRuleId || fvUid('r'), type: $('#ruleType').value, amount: parseDigits($('#ruleAmount').value), category: $('#ruleCategory').value, person: $('#rulePerson').value, note: $('#ruleNote').value.trim(), cadence: $('#ruleCadence').value, interval: Math.trunc(Number($('#ruleInterval').value)), startDate: $('#ruleStart').value, endDate: $('#ruleEnd').value, status: $('#rulePaused').checked ? 'paused' : 'active', skipped: prev ? prev.skipped : [] };
  const errors = FD.recurring.validateRule(rule); if (errors.length) return showToast('Kiểm tra lại: ' + errors.join(', '));
  extStore.edit('recurring', fvRules().filter(x => x.id !== rule.id).concat(rule)); closeOverlay('#ruleOverlay');
  fvAfterExtEdit(FV.editingRuleId ? 'Đã sửa khoản định kỳ' : 'Đã thêm khoản định kỳ');
});
$('#forecastMonths').addEventListener('change', e => { FV.forecastMonths = Number(e.target.value) || 6; renderPlan(); });

// privacy mode
$('#privacyBtn').onclick = () => { hideAmounts = !hideAmounts; write('privacy_hide_amounts', hideAmounts); render(); };

// backup and export (no token is ever included)
function fvDownload(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadLocalBackup() {
  const data = FFSync.engine.localBackup({ transactions, pendingDeletes, budgets, budgetState, ext: { collections: extStore.state().collections }, createdAt: new Date().toISOString() });
  fvDownload('family-finance-backup-' + fvToday() + '.json', JSON.stringify(data, null, 2), 'application/json');
}
// Called by destructive actions (clear device data, log out) before anything is removed.
function offerBackupBeforeReset() {
  if (!transactions.length && !operations().length && !fvAssets().length && !fvRules().length) return;
  if (confirm('Tải bản sao lưu dữ liệu trên máy trước khi xóa? (Khuyến nghị — gồm cả thay đổi chưa đồng bộ)')) downloadLocalBackup();
}
$('#backupBtn').onclick = downloadLocalBackup;
$('#exportFrom').value = FD.money.shiftMonth(fvToday().slice(0, 7), -2); $('#exportTo').value = fvToday().slice(0, 7);
$('#exportCsvBtn').onclick = () => {
  const from = $('#exportFrom').value, to = $('#exportTo').value;
  if (!FD.money.isMonthKey(from) || !FD.money.isMonthKey(to) || from > to) return showToast('Chọn khoảng tháng hợp lệ');
  if (!confirm('Tệp CSV chứa giao dịch, ghi chú và tên người nhập từ ' + fvMonthName(from) + ' đến ' + fvMonthName(to) + '. Chỉ lưu ở nơi riêng tư. Tiếp tục?')) return;
  fvDownload(`family-finance-${from}_${to}.csv`, '﻿' + FFSync.engine.transactionsCsv(transactions, from + '-01', fvMonthEnd(to)), 'text/csv');
};

// grounded assistant tools (falls back to legacy chat_scoped on older Apps Script)
function fvToolFallback(t) {
  const d = t.data || {};
  if (t.tool === 'summary') return `${d.month}: thu ${money(d.income)}, chi ${money(d.expense)}, còn lại ${money(d.net)}.`;
  if (t.tool === 'budget_status') return `Đã dùng ${d.usedPct === null ? '—' : d.usedPct + '%'} ngân sách (${money(d.totalSpent)} / ${money(d.totalLimit)}).`;
  if (t.tool === 'loan_position') return `${d.month}: lịch trả nợ ${money(d.scheduledTotal)}${d.incomplete ? ' (tạm tính, thiếu dữ liệu)' : ''}.`;
  if (t.tool === 'forecast') return (d.months || []).map(m => `${m.month}: ròng ước tính ${m.projectedNet === null ? 'thiếu dữ liệu' : money(m.projectedNet)}`).join('; ');
  if (t.tool === 'expense_analysis') return (d.byCategory || []).slice(0, 3).map(c => `${c.category}: ${money(c.current)}`).join('; ');
  return '';
}
async function askAssistantTool(tool, question) {
  if (assistantRequestId) return;
  if (!endpoint()) { openSettings(); return; }
  assistantRequestId = Date.now().toString(36); addChatBubble(question, 'user'); addChatBubble('Đang tính từ dữ liệu gia đình…', 'ai loading', 'assistantLoading'); $('#askAssistantBtn').disabled = true;
  try {
    const r = await nativeRequest({ action: 'assistant_tool', tool, month: monthKey(activeMonth), question, context: JSON.stringify({ rates: loanRates, months: 6 }) });
    finishAssistant(r.answer || ('Trợ lý chưa giải thích được (' + (r.answerError || 'không rõ lỗi') + '). Số liệu tính sẵn: ' + fvToolFallback(r.tool)));
    const t = r.tool, cov = t.coverage || {};
    const facts = [t.provenance, t.period ? 'Kỳ: ' + [t.period.from, t.period.to].filter(Boolean).map(fvMonthName).join(' – ') : '', cov.transactions !== undefined ? cov.transactions + ' giao dịch' : '', cov.missingNote || '', cov.loanBudgetIncomplete ? 'Ngân sách trả nợ tạm tính' : '', (cov.incompleteMonths || []).length ? 'Thiếu dữ liệu: ' + cov.incompleteMonths.join(', ') : ''].filter(Boolean).join(' · ');
    addChatBubble('Nguồn số liệu: ' + facts, 'ai provenance');
  } catch (error) {
    if (/không được hỗ trợ/.test(error.message || '')) { assistantRequestId = ''; $('#assistantLoading')?.remove(); $('#askAssistantBtn').disabled = false; $('#chatLog').lastElementChild?.remove(); return askAssistant(question); }
    finishAssistant(error.message || 'Trợ lý chưa phản hồi.', false);
  }
}
$$('[data-ai-tool]').forEach(b => { b.onclick = () => askAssistantTool(b.dataset.aiTool, b.dataset.aiQuestion); });

renderFinanceViews();
