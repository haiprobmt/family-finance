// Display formatting (presentation only). Values come from FFDomain; nothing here computes
// financial truth. Missing/invalid amounts render as "—" (unknown), never as 0.
(function (root) {
  'use strict';
  const UI = root.FFUI = root.FFUI || {};
  const state = UI.state = UI.state || { hideAmounts: false };
  const NUM = new Intl.NumberFormat('vi-VN');
  const COMPACT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const MASK = '•••••';
  const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  function esc(s) { return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  // Full VND, e.g. "1.234.567 ₫". `unknown` text when the value is missing.
  function vnd(n, unknown = '—') { if (!isNum(n)) return unknown; return state.hideAmounts ? MASK + ' ₫' : NUM.format(Math.round(Number(n))) + ' ₫'; }
  // Compact millions for dashboards ("1,26 tr"); the full value must stay available (title/aria-label).
  function compact(n, unknown = '—') { if (!isNum(n)) return unknown; return state.hideAmounts ? '••• tr' : COMPACT.format(Number(n) / 1000000) + ' tr'; }
  // digits=0 uses Math.round, identical to the pre-3.0 savings-rate display.
  function percent(ratio, digits = 0) { if (!isNum(ratio)) return '—'; if (state.hideAmounts) return '••%'; const v = Number(ratio) * 100; return (digits ? v.toFixed(digits).replace('.', ',') : String(Math.round(v))) + '%'; }
  function monthLabel(m) { return /^\d{4}-\d{2}$/.test(m) ? m.slice(5) + '/' + m.slice(0, 4) : String(m); }
  function monthLong(m) { const [y, k] = m.split('-').map(Number); return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date(y, k - 1, 1)); }
  function dateLabel(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : String(d || ''); }
  function shortDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) : String(d || ''); }
  UI.fmt = { esc, vnd, compact, percent, monthLabel, monthLong, dateLabel, shortDate, isNum, MASK };
})(typeof globalThis !== 'undefined' ? globalThis : this);
