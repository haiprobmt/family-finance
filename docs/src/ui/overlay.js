// Modal / BottomSheet behaviour shared by every `.overlay`: focus moves into the dialog, Tab is
// trapped, Escape closes (unless the dialog marks itself data-unsafe-close), and focus returns to
// the element that opened it. Layout (centred modal vs bottom sheet) is pure CSS.
(function (root) {
  'use strict';
  const UI = root.FFUI = root.FFUI || {};
  const stack = [];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const visible = el => el.offsetParent !== null || el.getClientRects().length > 0;
  function focusables(o) { return [...o.querySelectorAll(FOCUSABLE)].filter(visible); }
  function open(o, trigger) {
    if (!o || o.classList.contains('open')) return;
    stack.push({ o, trigger: trigger || document.activeElement });
    o.classList.add('open'); o.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-overlay');
    if (!o.contains(document.activeElement)) { const target = o.querySelector('[autofocus]') || focusables(o)[0] || o.querySelector('[role="dialog"]'); if (target && target.matches('[role="dialog"]') && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1'); target?.focus({ preventScroll: true }); }
  }
  function close(o) {
    if (!o || !o.classList.contains('open')) return;
    o.classList.remove('open'); o.setAttribute('aria-hidden', 'true');
    const i = stack.findIndex(s => s.o === o), entry = i >= 0 ? stack.splice(i, 1)[0] : null;
    if (!stack.length) document.body.classList.remove('has-overlay');
    if (entry && entry.trigger && entry.trigger.isConnected && typeof entry.trigger.focus === 'function') entry.trigger.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', e => {
    const top = stack[stack.length - 1]; if (!top || e.defaultPrevented) return;
    if (e.key === 'Escape' && !top.o.hasAttribute('data-unsafe-close')) { e.preventDefault(); close(top.o); }
    if (e.key === 'Tab') {
      const f = focusables(top.o); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  UI.overlay = { open, close, isOpen: () => stack.length > 0 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
