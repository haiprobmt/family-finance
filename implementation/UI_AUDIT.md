# UI Modernization — Phase 0 Repository Audit

Status: **awaiting owner approval.** No application code was changed in Phase 0.
Audited: `main` @ `7fe12a6` (includes the 3.0 work merged in PR #2). Specs read:
UI_DESIGN_SYSTEM.md, UI_COMPONENT_CATALOG.md, UI_IMPLEMENTATION_GUIDE.md, PRD, ARCHITECTURE,
API_COMPATIBILITY, DATA_MODEL, TEST_PLAN.

> Source note: the three UI_*.md specs exist only on branch `upgrade/comprehensive-3.0-docs`,
> which is based on the *pre-3.0* commit `2315b93`. Merging that branch would delete the 3.0 code.
> This audit copies just the three spec files onto the working branch, unchanged.

## 1. Baseline test results

| Command | Result |
|---|---|
| `node tests/web.cjs` | PASS: privacy, asset paths, manifest, session-only default, HTTPS endpoint validation, authenticated POST, cache boundary, SW allowlist |
| `npm test` (characterization, parity, domain, contract, backend, sync) | 36 / 36 pass |
| `npm run e2e` (Playwright, real PWA + real `.gs` on emulated Sheets, 2 devices) | 18 / 18 pass (~28 s) |

Before-migration evidence (stored outside the repo, to attach to the PR): screenshots of
every view and overlay at 390 px and 1440 px. Also the financial values each screen shows on a
fixed synthetic fixture (home totals, savings rate, budget gauge, debt summary, cumulative values,
net worth, loan rows, budget inputs, history count). Phase 3 will turn these into a value-parity test.

## 2. Existing architecture

- **Hosting:** static GitHub Pages from `docs/`. No build step for the PWA. Classic `<script>` files share
  one global scope. CSP: `script-src 'self'` (no inline scripts); inline *styles* allowed.
- **Script order:** `src/domain/*` (8 pure modules) → `src/sync/engine.js` → `src/data/local-store.js` →
  `src/features/ext-store.js` → `web-bridge.js` → `loans-data.js` → `dashboard.js` → `app.js` →
  `src/features/finance-views.js` → `ui-icons.js` → `pwa.js`.
- **Layering today:** domain and sync rules are already separated (W1/W2). Presentation is spread
  over `app.js` (44 KB: state, UI, sync orchestration), `dashboard.js` (8.6 KB), `finance-views.js`
  (39 KB). They render with template strings plus `innerHTML` (38 writes; all user text goes through
  `escapeHtml`; an XSS e2e test covers this). Events: `onclick` assignment plus `data-action` delegation.
- **State:** module-level `let` globals in `app.js` (`transactions`, `budgets`, `budgetState`,
  `pendingDeletes`, `activeMonth`, `hideAmounts`, …) plus `extStore`. Everything persists
  through existing localStorage keys (BASELINE_AUDIT §4). `render()` rebuilds every view after any change.
- **Data flows:** writes go through `saveTransaction`/`updateIncome`/`deleteTransaction` →
  `pushToSheet` → `nativeRequest` (`v3_*`). Budgets go through `save_budgets`; extensions through `extStore.sync`
  (`ext_*`); the assistant through `assistant_tool`/`chat_scoped`. Sync runs at start, on visibility,
  `online`, `familyresume`, and from the pill or button.
- **Bridge:** `FamilyNative.configure/getConfig`, `nativeRequest()`, `familyresume` event. This is a
  browser shim with the native bridge's name. APK 2.3.0 ships its own UI and does not load `docs/`.
  No Android source exists here.
- **CSS:** 5 stacked sheets loaded in order: `styles.css` (191 rules), `redesign.css` (140), `dashboard.css` (80),
  `soft-theme.css` (243), `features.css` (94). About 750 rules, 7 `!important`, with heavy override layering:
  the 3.0 topbar overflow came from `soft-theme.css` re-defining the grid. Fonts: self-hosted
  Be Vietnam Pro (3 TTF). Palette: pink/magenta. Light only.
- **Navigation:** 6 in-page views toggled by `nav(name)`. There is **no URL/hash routing and no back
  behaviour**, so there are no deep links to preserve. Mobile swipe moves between the 4 main views.
  There are 8 overlays (bottom sheets).

## 3. Screen inventory and target mapping

| Current screen / overlay | Contents (key IDs / functions) | Target screen (spec §5 nav) |
|---|---|---|
| `homeView` | Month switcher, "Đã chi" hero + income/remaining/savings (`renderHome`), budget gauge, debt summary, hub links, reminders, expense pie + budget legend (`renderExpensePie`) | **Tổng quan** (dashboard) |
| `dashboardView` | Month/range filters, cumulative income/expense/savings, cash-flow KPIs + drill-through, net worth, budget alerts, 3-month forecast, 6–12 month trend bars, weekly bars, loan interest table | Split: KPIs/net worth/alerts → **Tổng quan**; trend, weekly, cumulative, category breakdown → **Báo cáo**; loan table → **Khoản vay** |
| `historyView` | Type filters, search (`matchesHistory`), day groups, row edit/delete, sync button | **Giao dịch** |
| `budgetView` | Per-category inputs incl. loan-payment placeholder/sentinel, conflict panel, insights | **Ngân sách** |
| `assetsView` | Ext banner, net worth at cut-off, asset list, loan position, repayment simulator | **Tài sản & Nợ** (assets + liabilities) and **Khoản vay** (position, full schedule, simulator) |
| `planView` | Reminders, 60-day calendar, recurring rules, forecast table | **Lịch tài chính** (forecast kept here, labelled Dự báo, so Reports stays actual-only) |
| `assistantOverlay` | Chat log, tool chips, composer | **AI Advisor** page (desktop sidebar; mobile under "Khác") |
| `settingsOverlay` | Connection form, backup/CSV, diagnostics, install, logout, clear | **Cài đặt** page. First-run connection still opens it automatically |
| `entryOverlay` | Quick add/edit transaction | Stays a Modal (desktop) / BottomSheet (mobile) |
| `categoryDetailOverlay`, `transactionDetailOverlay`, `assetOverlay`, `valuationOverlay`, `ruleOverlay` | Detail/edit flows | Stay Modal/BottomSheet on the shared component |

Spec content with **no source data** — shown as unavailable, never invented: cash balance as a separate
figure (closest: sum of cash/bank *assets* at latest valuation, unknown if unvalued); asset trend
history (only individual valuations exist); notification settings (no notifications exist);
appearance options (light theme only).

## 4. Component reuse opportunities (existing duplicates → catalog component)

| Catalog component | Existing implementations to unify |
|---|---|
| Card / MetricCard | `.panel`, `.dash-card`, `.balance-card`, `.cumulative-cards article`, `.accumulated-savings`, `.kpi` (6 variants) |
| MoneyAmount | `money()` / `moneyMillions()` + ad-hoc `title`/`aria-label` full values; privacy masking already central |
| BudgetProgress | home legend `.cat-bar`, budget insights bar, dashboard category `.dash-track` (3 copies) |
| DataTable | `.loan-table`, `.detail-table`, `.data-table` (3 table styles) |
| TransactionRow | `txRow()` (history), category-detail rows, drill-through rows (3 templates) |
| Badge / StatusPill | `.kind-badge`, `.sync-pill`, sync labels in rows, reminder classes |
| Modal / BottomSheet | 8 `.overlay > .sheet` copies; focus trap exists only in category detail |
| EmptyState | `.empty-state`, `.dash-empty`, inline "Chưa có…" paragraphs |
| FinancialChart | custom SVG pie, CSS trend bars, weekly bars, SVG gauge |
| SyncStatus | `#syncPill` + `syncState()` (status model already complete in `FFSync.engine`) |
| Button / form controls | `.filter`, `.submit-entry`, `.save-budget`, `.sync-btn`, `.text-btn`, `.danger-link`, `.form-grid` inputs, `.endpoint-field` |
| Alert / Toast | `.ext-banner`, `#budgetConflict`, `showToast()` |

## 5. Gaps against UI_DESIGN_SYSTEM

1. Emoji category icons (🍜 🛒 🧸 🚗 🏠 💡 ♥ 👛 💼 ★ 🏦) and glyph nav icons (⌂ ☷ ◒ ◉). Replace with line SVG icons; the category IDs and data stay the same.
2. Pink palette, gradient assistant button, capsule pills → tokens from §2 (navy text, amber accent, green income / red expense).
3. Desktop renders the phone layout in a centred column with a bottom nav → sidebar shell.
4. Bottom nav has 5 items plus a centre "+" that overlaps content → spec's 5 destinations plus a non-overlapping quick add.
5. Savings rate shows **"0%" when there is no income**. This renders missing data as zero; it should show "—" (display only).
6. Gauge chart → spec charts (bar/line/donut). The pie has up to 10 slices → donut with ≤7 slices, the rest grouped as "Khác" (display grouping only).
7. Settings and assistant are overlays, not destinations; no hash routes / back behaviour.
8. Inconsistent empty, loading and error states. There is no skeleton, because data renders from local cache instantly; the "loading" state applies to sync and the assistant.

## 6. Technical risks

| Risk | Mitigation |
|---|---|
| CSS override debt (5 sheets, ~750 rules) fights new styles | New layered stylesheets (`styles/tokens, base, layout, components, pages`). Old sheets are removed screen by screen and gone before the PR is ready, so the two systems don't stay mixed |
| Tests depend on ~60 DOM selectors and 6 globals (`nav`, `retryUnsynced`, `syncWithSheet`, `editIncome`, `deleteTransaction`, `fvConfirmOccurrence`) | Keep IDs and globals. Where structure changes (settings/assistant → pages), update the harness in the same commit |
| Behaviour hidden in render code (sentinel handling in budget inputs, loan placeholder, conflict flows) | Keep the handlers and state functions; only templates and CSS change. Value-parity test against the Phase 0 snapshot |
| Service worker allowlist and cache-first strategy | Every new file goes into `sw.js` (enforced by `tests/web.cjs`). Bump to `family-finance-pages-v4`; release note: reopen the app once |
| Android WebView (evergreen Chromium) can't be tested here | Use widely supported CSS only (grid, flex, custom properties, `env(safe-area-inset-*)`, `@media`); avoid features newer than ~Chrome 100 without fallbacks. Real-device check remains an owner gate |
| `render()` rebuilds all views, so focus can be lost | Keep the pattern (data is small) but restore focus after re-render for inputs; don't re-render while an overlay form is open |
| Swipe navigation conflicts with the sidebar layout | Enable swipes only below 1024 px |
| No visual mockups beyond the written spec | Build from tokens and the catalog; screenshots at every breakpoint for review |

## 7. Proposed implementation mapping

No framework or bundler (spec §1, guide §2.9). Files follow the catalog §4 proposal, adapted to the
global-script convention:

~~~text
docs/styles/tokens.css  base.css  layout.css  components.css  pages.css   (replace the 5 old sheets)
docs/src/ui/format.js       MoneyAmount, date/period labels, privacy mask (wraps FFDomain.money)
docs/src/ui/icons.js        line icon set (nav + categories), replaces ui-icons.js
docs/src/ui/components.js   Button, IconButton, Card, MetricCard, Badge, StatusPill, Alert, EmptyState,
                            Skeleton, DataTable, TransactionRow, BudgetProgress, LoanSummary, SyncStatus,
                            FormField helpers, FilterBar, PeriodSelector — pure functions returning
                            escaped HTML strings (current convention), no data access
docs/src/ui/charts.js       FinancialChart: bar, line, donut (inline SVG) + table fallback
docs/src/ui/overlay.js      Modal/BottomSheet (focus trap, return focus, Escape), Toast
docs/src/ui/shell.js        AppShell: sidebar, mobile top bar, bottom nav + "Khác" sheet, PageHeader,
                            hash router (#/tong-quan …) mapping to the existing nav()
docs/src/pages/*.js         dashboard, transactions, budgets, assets-debt, loans, calendar, reports,
                            ai-advisor, settings — view composition only; business calls go to
                            existing functions in app.js / dashboard.js / finance-views.js / FFDomain
~~~

Phases (separate commits): **1** tokens, base, shell, PageHeader, SyncStatus → **2** components (catalog
order) with a component smoke page in the test harness only → **3** screens in the requested order,
each with value parity plus existing e2e green → **4** widths 360/390/430/768/1024/1440/1920, overflow,
44 px targets, focus, axe-style checks with Playwright → **5** PR with before/after screenshots.

Compatibility: **no change** to Apps Script, Sheets, API payloads, localStorage keys, domain formulas or
validation. Routing uses the URL hash (no storage). No new persisted keys are needed; the
existing `privacy_hide_amounts` stays.

## 8. Decisions requested from the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Font: spec stack (Inter/system-ui, no download) vs keep self-hosted Be Vietnam Pro | System stack per spec; drop the 3 TTFs from the page and cache (files may stay in repo) |
| 2 | Add hash routes for deep links + browser back | Yes (additive, no storage) |
| 3 | Settings and AI Advisor become pages; entry/detail stay Modal/BottomSheet | Yes |
| 4 | Screen split in §3 (Dashboard → Tổng quan + Báo cáo + Khoản vay; forecast stays in Lịch tài chính) | Yes |
| 5 | Quick add: desktop header primary button; mobile floating button above the bottom nav (safe-area aware), replacing the centre "+" | Yes |
| 6 | Display-only corrections: savings rate "—" without income; donut groups >7 categories as "Khác"; emoji → line icons; gauge → progress bar + donut | Yes — no calculation changes |
| 7 | Keep mobile swipe between primary tabs (disabled ≥1024 px) | Yes |
| 8 | Branch: session rules require `claude/gallant-babbage-5dl3j6` (restarted from `main`) instead of the guide's `feature/family-finance-3-ui` | Accept |
| 9 | Android WebView: treat as "docs/ must stay embeddable" (bridge shim unchanged); APK 2.3.0 has its own UI and is unaffected | Confirm |
