// Line icon set (24×24, stroke = currentColor). Replaces emoji category icons and glyph nav icons.
// Icons are decorative (aria-hidden); every control carries its own text or aria-label.
(function (root) {
  'use strict';
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    transactions: '<path d="M7 7h12M7 12h12M7 17h12"/><path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01"/>',
    budget: '<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"/>',
    assets: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/>',
    loans: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    advisor: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z"/><path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8Z"/>',
    reports: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3M20 16V6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 20h16"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7Z"/>',
    // Categories (ids from budget.EXPENSE_CATEGORIES / INCOME_CATEGORIES)
    'cat-food': '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2 0-3.5 2.5-3.5 6S15 13 17 13"/>',
    'cat-grocery': '<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    'cat-kids': '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01"/><path d="M9 14.5a4 4 0 0 0 6 0"/>',
    'cat-transport': '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3Z"/><path d="M7 11h10"/><circle cx="7.5" cy="19" r="1"/><circle cx="16.5" cy="19" r="1"/>',
    'cat-home': '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    'cat-bills': '<path d="M13 3 5 13h6l-1 8 8-10h-6Z"/>',
    'cat-health': '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    'cat-couple-allowance': '<path d="M3 7h15a3 3 0 0 1 3 3v8H3Z"/><path d="M3 7l12-3v3"/><path d="M16 13h2"/>',
    'cat-other': '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
    'cat-loan-payment': '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
    'cat-salary': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2M3 12h18"/>',
    'cat-bonus': '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
    'cat-business': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'cat-other-income': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'
  };
  function icon(name, cls) {
    const body = P[name] || P['cat-other'];
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  const UI = root.FFUI = root.FFUI || {};
  UI.icon = icon;
  UI.hasIcon = name => Object.prototype.hasOwnProperty.call(P, name);
})(typeof globalThis !== 'undefined' ? globalThis : this);
