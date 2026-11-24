// Domain: money and calendar primitives. Pure; no DOM, storage, network or Apps Script.
// Shared verbatim with Apps Script via tools/build-apps-script.cjs.
(function (root) {
  'use strict';
  const D = root.FFDomain = root.FFDomain || {};
  const MAX_AMOUNT = 1000000000000;

  // Integer VND. Non-finite input becomes null (unknown), never 0.
  function toVnd(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : null; }
  // Legacy-compatible sum: non-numeric entries contribute 0 (matches pre-3.0 reducers).
  function sum(list, pick) { let total = 0; for (const item of list) total += Number(pick ? pick(item) : item) || 0; return total; }
  function isValidAmount(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT; }

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isMonthKey(m) { return typeof m === 'string' && MONTH_RE.test(m); }
  function isDateKey(d) { if (typeof d !== 'string' || !DATE_RE.test(d)) return false; const [y, m, day] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, day)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day; }
  function shiftMonth(month, n) { const [y, k] = month.split('-').map(Number); return new Date(Date.UTC(y, k - 1 + n, 1)).toISOString().slice(0, 7); }
  function monthRange(start, end) { const out = []; for (let m = start; m <= end && out.length < 1200; m = shiftMonth(m, 1)) out.push(m); return out; }
  function daysInMonth(month) { const [y, k] = month.split('-').map(Number); return new Date(Date.UTC(y, k, 0)).getUTCDate(); }
  function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  function monthLabel(month) { return month.slice(5) + '/' + month.slice(0, 4); }
  function dateLabel(date) { return String(date).split('-').reverse().join('/'); }
  // Local-calendar month key of a Date (legacy monthKey()).
  function monthKeyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  function localDateISO(d = new Date()) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  function formatVnd(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫'; }
  function formatMillions(n) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format((Number(n) || 0) / 1000000) + ' tr'; }
  function parseDigits(v) { return Number(String(v).replace(/\D/g, '')) || 0; }

  D.money = { MAX_AMOUNT, toVnd, sum, isValidAmount, isMonthKey, isDateKey, shiftMonth, monthRange, daysInMonth, addDays, monthLabel, dateLabel, monthKeyOf, localDateISO, formatVnd, formatMillions, parseDigits };
})(typeof globalThis !== 'undefined' ? globalThis : this);
