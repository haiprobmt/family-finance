// AppShell: route table (hash deep links + browser back), navigation active state, page titles
// and the mobile "Khác" menu. Owns no financial data; view rendering stays in the app scripts.
(function (root) {
  'use strict';
  const UI = root.FFUI = root.FFUI || {};
  // view id (without "View") -> hash slug, title, bottom-nav group
  const ROUTES = {
    home: { slug: 'tong-quan', title: 'Tổng quan', group: 'home' },
    history: { slug: 'giao-dich', title: 'Giao dịch', group: 'history' },
    budget: { slug: 'ngan-sach', title: 'Ngân sách', group: 'budget' },
    assets: { slug: 'tai-san', title: 'Tài sản & Nợ', group: 'assets' },
    loans: { slug: 'khoan-vay', title: 'Khoản vay', group: 'more' },
    plan: { slug: 'lich', title: 'Lịch tài chính', group: 'more' },
    ai: { slug: 'ai-advisor', title: 'AI Advisor', group: 'more' },
    reports: { slug: 'bao-cao', title: 'Báo cáo', group: 'more' },
    settings: { slug: 'cai-dat', title: 'Cài đặt', group: 'more' }
  };
  const BY_SLUG = Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [v.slug, k]));
  // Legacy view names kept working for existing callers/tests.
  const ALIASES = { dashboard: 'reports' };
  function resolve(name) { return ROUTES[name] ? name : ALIASES[name] || null; }
  function routeFromHash(hash = location.hash) { const slug = String(hash).replace(/^#\/?/, '').split('?')[0]; return BY_SLUG[slug] || 'home'; }
  function hashFor(name) { return '#/' + ROUTES[name].slug; }
  // Marks every navigation control for `name` (sidebar, bottom nav, more menu).
  function markActive(name) {
    const group = ROUTES[name].group;
    document.querySelectorAll('[data-nav]').forEach(el => {
      if (!el.matches('.side-link,.nav-item')) return;
      const target = resolve(el.dataset.nav), on = el.classList.contains('nav-item') ? (el.dataset.nav === 'more' ? group === 'more' : target && ROUTES[target].group === group) : target === name;
      el.classList.toggle('active', !!on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    document.title = ROUTES[name].title + ' · Chi Tiêu Gia Đình';
  }
  UI.shell = { ROUTES, resolve, routeFromHash, hashFor, markActive };
})(typeof globalThis !== 'undefined' ? globalThis : this);
// Replace static <span data-icon="name"> placeholders with the line icon (runs once at load).
(function (root) {
  'use strict';
  const UI = root.FFUI;
  function hydrateIcons(scope) { (scope || document).querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = UI.icon(el.dataset.icon); }); }
  UI.shell.hydrateIcons = hydrateIcons;
  if (typeof document !== 'undefined' && document.querySelectorAll) hydrateIcons();
})(typeof globalThis !== 'undefined' ? globalThis : this);
