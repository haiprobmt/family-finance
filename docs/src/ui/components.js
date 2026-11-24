// Shared UI components (implementation/UI_COMPONENT_CATALOG.md). Each component is a pure
// function returning an HTML string. Text inputs are escaped here; parameters named *Html are
// trusted markup produced by other components. No data access, API calls or financial math.
(function (root) {
  'use strict';
  const UI = root.FFUI = root.FFUI || {};
  const { esc, vnd, compact, isNum } = UI.fmt;
  const icon = (n, c) => UI.icon(n, c);
  function attrs(map) {
    if (!map) return '';
    return Object.entries(map).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => (v === true ? ' ' + k : ` ${k}="${esc(v)}"`)).join('');
  }

  // Button / IconButton — variants: primary, secondary, outline, ghost, danger; sizes sm/md/lg.
  function button({ label, variant = 'secondary', size = 'md', iconName = null, iconOnly = false, type = 'button', cls = '', attrs: a = {}, loading = false } = {}) {
    const classes = ['btn', 'btn-' + variant, 'btn-' + size, iconOnly ? 'btn-icon' : '', loading ? 'is-loading' : '', cls].filter(Boolean).join(' ');
    const aria = iconOnly ? { 'aria-label': label } : {};
    return `<button type="${type}" class="${classes}"${attrs({ ...aria, ...a, disabled: a.disabled || loading, 'aria-busy': loading ? 'true' : undefined })}>${iconName ? icon(iconName) : ''}${iconOnly ? '' : `<span class="btn-label">${esc(label)}</span>`}</button>`;
  }
  // Badge / StatusPill — variants: neutral, success, warning, danger, info, brand (+ income, expense, forecast, planned, scheduled).
  function badge(text, variant = 'neutral', a) { return `<span class="badge badge-${variant}"${attrs(a)}>${esc(text)}</span>`; }

  // MoneyAmount — semantic colour: null | 'income' | 'expense' | 'auto' (from value sign).
  function money(amount, { semantic = null, sign = false, compact: isCompact = false, unknown = '—', cls = '' } = {}) {
    if (!isNum(amount)) return `<span class="money money-unknown ${cls}">${esc(unknown)}</span>`;
    const n = Number(amount), sem = semantic === 'auto' ? (n < 0 ? 'expense' : n > 0 ? 'income' : null) : semantic;
    // sign: false (only negatives get −) | 'type'/true (transaction direction: income +, expense −) | 'value' (+/− from the number).
    const mode = sign === true ? 'type' : sign;
    const prefix = mode === 'type' ? (sem === 'income' ? '+' : sem === 'expense' ? '−' : n < 0 ? '−' : '') : mode === 'value' ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
    const abs = Math.abs(n), full = prefix + vnd(abs);
    const shown = isCompact ? prefix + compact(abs) : full;
    return `<span class="money${sem ? ' money-' + sem : ''}${cls ? ' ' + cls : ''}"${isCompact ? ` title="${esc(full)}" aria-label="${esc(full)}"` : ''}>${esc(shown)}</span>`;
  }

  // Card — variants: default, muted, outlined.
  function card({ id, title, titleId, subtitle, actionsHtml = '', bodyHtml = '', footerHtml = '', variant = 'default', cls = '', tag = 'section', headingLevel = 2, attrs: a = {} } = {}) {
    const hid = titleId || (id ? id + 'Title' : null);
    const head = title ? `<header class="card-header"><div class="card-heading"><h${headingLevel} class="card-title"${hid ? ` id="${esc(hid)}"` : ''}>${esc(title)}</h${headingLevel}>${subtitle ? `<p class="card-subtitle">${esc(subtitle)}</p>` : ''}</div>${actionsHtml ? `<div class="card-actions">${actionsHtml}</div>` : ''}</header>` : '';
    return `<${tag} class="card card-${variant}${cls ? ' ' + cls : ''}"${attrs({ id, 'aria-labelledby': title && hid ? hid : undefined, ...a })}>${head}<div class="card-body">${bodyHtml}</div>${footerHtml ? `<footer class="card-footer">${footerHtml}</footer>` : ''}</${tag}>`;
  }

  // MetricCard — receives an authoritative value; state: ready | loading | unavailable | error.
  function metricCard({ id, label, valueHtml, helperHtml = '', badgeHtml = '', emphasis = false, state = 'ready', tag = 'div', cls = '', attrs: a = {}, valueId } = {}) {
    const value = state === 'loading' ? '<span class="skeleton skeleton-text" aria-hidden="true"></span><span class="sr-only">Đang tải</span>' : state === 'unavailable' ? '<span class="money money-unknown">Chưa đủ dữ liệu</span>' : state === 'error' ? '<span class="money money-unknown">Lỗi dữ liệu</span>' : valueHtml;
    const t = tag === 'button' ? 'button type="button"' : tag;
    return `<${t} class="metric${emphasis ? ' metric-emphasis' : ''}${tag === 'button' ? ' metric-action' : ''}${cls ? ' ' + cls : ''}"${attrs({ id, ...a })}><span class="metric-label">${esc(label)}${badgeHtml}</span><span class="metric-value"${valueId ? ` id="${esc(valueId)}"` : ''}>${value}</span>${helperHtml ? `<span class="metric-helper">${helperHtml}</span>` : ''}</${tag === 'button' ? 'button' : tag}>`;
  }

  // Alert — persistent context. variant: info | warning | danger | success.
  function alert({ variant = 'info', title = '', bodyHtml = '', actionsHtml = '', role } = {}) {
    const ic = variant === 'danger' || variant === 'warning' ? 'alert' : variant === 'success' ? 'check' : 'info';
    return `<div class="alert alert-${variant}"${role ? ` role="${role}"` : ''}>${icon(ic, 'alert-icon')}<div class="alert-content">${title ? `<p class="alert-title">${esc(title)}</p>` : ''}${bodyHtml ? `<div class="alert-body">${bodyHtml}</div>` : ''}${actionsHtml ? `<div class="alert-actions">${actionsHtml}</div>` : ''}</div></div>`;
  }

  // EmptyState — kind: empty | filtered | error.
  function emptyState({ title, text = '', actionHtml = '', iconName = 'info', kind = 'empty' } = {}) {
    return `<div class="empty-state empty-${kind}">${icon(kind === 'error' ? 'alert' : kind === 'filtered' ? 'search' : iconName, 'empty-icon')}<p class="empty-title">${esc(title)}</p>${text ? `<p class="empty-text">${esc(text)}</p>` : ''}${actionHtml ? `<div class="empty-action">${actionHtml}</div>` : ''}</div>`;
  }
  function skeleton(lines = 3) { return `<div class="skeleton-block" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<span class="skeleton skeleton-line" style="width:${[92, 76, 84, 60][i % 4]}%"></span>`).join('')}</div>`; }

  // Definition list of label/value pairs; values are trusted HTML.
  function kv(items, cls = '') { return `<dl class="kv ${cls}">${items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`; }

  // DataTable — columns: {key, label, num?, render?(row)->html, cls?}. Mobile: stacked rows (data-label).
  function dataTable({ caption = '', columns, rows, emptyHtml = '', rowAttrs = null, cls = '', id, rowHeader = true, footRows = [] } = {}) {
    if (!rows.length && emptyHtml) return emptyHtml;
    const head = `<thead><tr>${columns.map(c => `<th scope="col"${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>`;
    const cell = (c, r, i) => { const v = c.render ? c.render(r) : esc(r[c.key] ?? ''); const label = ` data-label="${esc(c.label)}"`; return i === 0 && rowHeader ? `<th scope="row"${label}${c.num ? ' class="num"' : ''}>${v}</th>` : `<td${label}${c.num || c.cls ? ` class="${[c.num ? 'num' : '', c.cls || ''].join(' ').trim()}"` : ''}>${v}</td>`; };
    const body = rows.map(r => `<tr${attrs(rowAttrs ? rowAttrs(r) : null)}>${columns.map((c, i) => cell(c, r, i)).join('')}</tr>`).join('');
    const foot = footRows.length ? `<tfoot>${footRows.map(r => `<tr>${columns.map((c, i) => cell(c, r, i)).join('')}</tr>`).join('')}</tfoot>` : '';
    return `<div class="table-wrap"${id ? ` id="${esc(id)}"` : ''}><table class="table table-stack ${cls}">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}${head}<tbody>${body}</tbody>${foot}</table></div>`;
  }

  // TransactionRow — the row itself is a button that opens the existing detail/edit flow
  // (data-tx-id); optional actions are sibling buttons (no nested interactive content).
  function transactionRow({ id, iconName, title, meta, amount, type, status, actionsHtml = '', conflict = false }) {
    const sem = type === 'Income' ? 'income' : 'expense';
    return `<div class="tx-row${conflict ? ' tx-conflict' : ''}"><button type="button" class="tx-open" data-tx-id="${esc(id)}" aria-haspopup="dialog"><span class="tx-icon tx-icon-${sem}">${icon(iconName)}</span><span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-meta">${esc(meta)}</span></span><span class="tx-side">${money(amount, { semantic: sem, sign: true })}${status}</span></button>${actionsHtml ? `<span class="tx-actions">${actionsHtml}</span>` : ''}</div>`;
  }

  // BudgetProgress — bar clamped to 0–100% but text shows actual usage (e.g. 112%).
  function budgetProgress({ label, iconName = null, spent, limit, level = 'unset', noteHtml = '', attrs: a = null, tag = 'div', provisional = false, cls = '' } = {}) {
    const hasLimit = isNum(limit) && Number(limit) > 0;
    const ratio = hasLimit ? Number(spent) / Number(limit) : null;
    const pct = ratio === null ? null : Math.round(ratio * 100);
    const remaining = hasLimit ? Number(limit) - Number(spent) : null;
    const zero = isNum(limit) && Number(limit) === 0;
    const status = !hasLimit ? (zero ? (Number(spent) > 0 ? 'Vượt hạn mức 0 ₫' : 'Hạn mức 0 ₫') : 'Chưa đặt ngân sách') : remaining < 0 ? 'Vượt ' + vnd(-remaining) : 'Còn ' + vnd(remaining);
    const t = tag === 'button' ? 'button type="button"' : tag;
    return `<${t} class="budget-progress level-${level}${cls ? ' ' + cls : ''}"${attrs(a)}><span class="bp-head">${iconName ? `<span class="bp-icon">${icon(iconName)}</span>` : ''}<span class="bp-label">${esc(label)}</span><span class="bp-pct">${UI.state.hideAmounts && pct !== null ? '••%' : pct === null ? '—' : pct + '%'}</span></span><span class="bp-bar" aria-hidden="true"><i style="width:${pct === null ? 0 : Math.max(0, Math.min(100, pct))}%"></i></span><span class="bp-foot"><span>${money(spent)} / ${hasLimit || isNum(limit) ? money(limit) : '<span class="muted">chưa đặt</span>'}${provisional ? ' <span class="unknown">(tạm tính)</span>' : ''}</span><span class="bp-status">${esc(status)}</span></span>${noteHtml ? `<span class="bp-note">${noteHtml}</span>` : ''}</${tag === 'button' ? 'button' : tag}>`;
  }

  // LoanSummary — values come from the loan domain; missing values stay unknown.
  function loanSummary(items) {
    return `<div class="loan-summary">${items.map(i => `<article class="loan-item"><header><h3>${esc(i.bank)}</h3>${i.badgeHtml || ''}</header>${kv([['Dư nợ gốc', money(i.outstanding, { unknown: 'Thiếu dữ liệu' })], ['Lãi suất', i.rateText || '—'], ['Lãi tháng', money(i.interest, { unknown: '—' })], ['Gốc tháng', i.principal === null ? '<span class="muted" title="Lịch vay không tách phần gốc">Không tách trong lịch</span>' : money(i.principal, { unknown: '—' })], ['Phải trả', money(i.payment, { unknown: 'Thiếu dữ liệu' })], ['Lịch có đến', esc(i.coverage || '—')]], 'kv-grid')}</article>`).join('')}</div>`;
  }

  // SyncStatus label/state for mirrors (top-bar pill markup is static in index.html).
  function syncStatus(status, lastText = '') {
    return `<span class="status-pill" data-state="${esc(status.state)}"><i aria-hidden="true"></i><span>${esc(status.label)}</span></span>${lastText ? `<span class="sync-last">${esc(lastText)}</span>` : ''}`;
  }

  UI.attrs = attrs;
  UI.c = { button, badge, money, card, metricCard, alert, emptyState, skeleton, kv, dataTable, transactionRow, budgetProgress, loanSummary, syncStatus };
})(typeof globalThis !== 'undefined' ? globalThis : this);
