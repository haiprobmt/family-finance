# Family Finance 3.0 — Professional UI: Release Candidate Notes

Status: **release candidate, not deployed.** Merge and GitHub Pages publication need owner approval.
Scope: presentation layer only (UI_IMPLEMENTATION_GUIDE §1). Audit and approved decisions: `UI_AUDIT.md`.

## 1. Summary

- **Design system.** Centralised tokens (`docs/styles/tokens.css`) from UI_DESIGN_SYSTEM §2–4: white and light-grey surfaces, navy text, amber accent for actions only, green income / red expense, 4–64 px spacing scale, 8/12/16 px radii. Shadows appear only on overlays. System font stack, nothing downloaded.
- **App shell.**
  - Desktop (≥1024 px): 248 px sidebar with all 8 destinations, quick add, sync status and app version.
  - Tablet (640–1023 px): 72 px icon rail.
  - Mobile (<640 px): compact top bar, five-item bottom nav (Tổng quan, Giao dịch, Ngân sách, Tài sản, Khác) and a quick-add button that clears the content.
  - Hash routes (`#/giao-dich`, …) give deep links and browser back.
- **Shared components** (`docs/src/ui/`): Button/IconButton, Badge/StatusPill, Card, MetricCard, MoneyAmount, Alert, EmptyState, Skeleton, DataTable (stacked rows on phones), TransactionRow, BudgetProgress, LoanSummary, SyncStatus, FinancialChart (bar + donut with table fallbacks), Modal/BottomSheet focus management, form controls, SegmentedControl, SearchInput/FilterBar, PeriodSelector. They are pure functions returning escaped HTML, the same convention as the existing code. No framework, bundler or new dependency.
- **Screens migrated**, in the requested order: Tổng quan, Giao dịch, Ngân sách, Tài sản & Nợ, Khoản vay, Lịch tài chính, Báo cáo, AI Advisor, Cài đặt.

## 2. Screen mapping (old → new)

| Old | New |
|---|---|
| Home (hero, gauge, pie) + Dashboard KPIs, net worth, alerts | **Tổng quan**: net worth, assets and liabilities; actual cash flow with drill-through; recent transactions; upcoming items and reminders; donut (≤7 slices); budget progress |
| Dashboard trends, weekly bars, cumulative | **Báo cáo**: cumulative metrics, income/expense bar chart (click a month for its categories), weekly chart, table alternatives |
| Dashboard loan table + Assets loan position and simulator | **Khoản vay**: LoanSummary per bank (principal, rate, interest, principal portion, installment, schedule coverage), schedule DataTable, simulator labelled Mô phỏng |
| History | **Giao dịch**: search, type segmented control, month/category/person filters (bottom sheet on phones), active-filter chips, separate empty states for "no records" and "no filtered results" |
| Budget | **Ngân sách**: period selector, summary metrics, per-category input with BudgetProgress (actual % above 100 shown, bar capped), insights card |
| Assets | **Tài sản & Nợ**: net worth at a cut-off date, asset DataTable, liabilities card |
| Plan | **Lịch tài chính**: 60-day calendar, reminders, recurring rules, forecast table labelled Dự báo |
| Assistant overlay | **AI Advisor** page: advisory notice, quick analyses, conversation with provenance |
| Settings overlay | **Cài đặt** page: connection, sync status, backup/CSV, app and device data (danger zone) |

## 3. Changed files

- **New:**
  - `docs/styles/{tokens,base,layout,components,pages}.css`
  - `docs/src/ui/{format,icons,components,charts,overlay,shell}.js`
  - `tests/e2e/ui.e2e.cjs`
  - `tests/fixtures/ui-baseline-values.json`
  - `tools/capture-screenshots.cjs`
  - `implementation/screenshots/ui-3.0/{before,after}/`
  - `implementation/UI_*.md` (specs copied unchanged from `upgrade/comprehensive-3.0-docs`, audit, these notes)
- **Rewritten presentation:** `docs/index.html`; render functions in `docs/app.js`, `docs/dashboard.js` and `docs/src/features/finance-views.js`. Names, handlers, state and data flow are kept.
- **Small, additive:**
  - `docs/src/sync/engine.js`: an `offline` status state, which applies only when `navigator.onLine === false`.
  - `docs/sw.js`: cache `family-finance-pages-v4`, new allowlist, and fragment-tolerant matching for hash routes. The allowlist-only rule is unchanged.
- **Removed:**
  - `docs/styles.css`, `redesign.css`, `dashboard.css`, `soft-theme.css`, `features.css` (replaced by the token sheets).
  - `docs/ui-icons.js` (replaced by `src/ui/icons.js`).
  - The Be Vietnam Pro TTF files stay in the repository but are no longer loaded or cached (decision 1).
- **Tests updated for the new structure:** `tests/e2e/harness.cjs` (Settings is a page), `features.e2e.cjs` (drill-through and privacy on Tổng quan, simulator on Khoản vay, new view list), `tests/web.cjs` (also scans `docs/styles/`; no assertion removed), `tests/sync.test.cjs` (offline state).

## 4. Screenshots

Synthetic fixture only. **Before** = pre-redesign UI (commit `7fe12a6`); **after** = this branch.

| Screen | Phone (390 px) | Tablet (768 px) | Desktop (1440 px) |
|---|---|---|---|
| Tổng quan | [before](screenshots/ui-3.0/before/mobile-390-home.png) · [after](screenshots/ui-3.0/after/mobile-390-home.png) | [after](screenshots/ui-3.0/after/tablet-768-home.png) | [before](screenshots/ui-3.0/before/desktop-1440-home.png) · [after](screenshots/ui-3.0/after/desktop-1440-home.png) |
| Giao dịch | [before](screenshots/ui-3.0/before/mobile-390-history.png) · [after](screenshots/ui-3.0/after/mobile-390-history.png) | [after](screenshots/ui-3.0/after/tablet-768-history.png) | [before](screenshots/ui-3.0/before/desktop-1440-history.png) · [after](screenshots/ui-3.0/after/desktop-1440-history.png) |
| Ngân sách | [before](screenshots/ui-3.0/before/mobile-390-budget.png) · [after](screenshots/ui-3.0/after/mobile-390-budget.png) | [after](screenshots/ui-3.0/after/tablet-768-budget.png) | [before](screenshots/ui-3.0/before/desktop-1440-budget.png) · [after](screenshots/ui-3.0/after/desktop-1440-budget.png) |
| Tài sản & Nợ | [before](screenshots/ui-3.0/before/mobile-390-assets.png) · [after](screenshots/ui-3.0/after/mobile-390-assets.png) | [after](screenshots/ui-3.0/after/tablet-768-assets.png) | [before](screenshots/ui-3.0/before/desktop-1440-assets.png) · [after](screenshots/ui-3.0/after/desktop-1440-assets.png) |
| Khoản vay | [after](screenshots/ui-3.0/after/mobile-390-loans.png) | [after](screenshots/ui-3.0/after/tablet-768-loans.png) | [after](screenshots/ui-3.0/after/desktop-1440-loans.png) |
| Lịch tài chính | [before](screenshots/ui-3.0/before/mobile-390-plan.png) · [after](screenshots/ui-3.0/after/mobile-390-plan.png) | [after](screenshots/ui-3.0/after/tablet-768-plan.png) | [before](screenshots/ui-3.0/before/desktop-1440-plan.png) · [after](screenshots/ui-3.0/after/desktop-1440-plan.png) |
| Báo cáo | [before (Dashboard)](screenshots/ui-3.0/before/mobile-390-dashboard.png) · [after](screenshots/ui-3.0/after/mobile-390-reports.png) | [after](screenshots/ui-3.0/after/tablet-768-reports.png) | [before](screenshots/ui-3.0/before/desktop-1440-dashboard.png) · [after](screenshots/ui-3.0/after/desktop-1440-reports.png) |
| AI Advisor | [before](screenshots/ui-3.0/before/mobile-390-overlay-assistant.png) · [after](screenshots/ui-3.0/after/mobile-390-ai.png) | [after](screenshots/ui-3.0/after/tablet-768-ai.png) | [before](screenshots/ui-3.0/before/desktop-1440-overlay-assistant.png) · [after](screenshots/ui-3.0/after/desktop-1440-ai.png) |
| Cài đặt | [before](screenshots/ui-3.0/before/mobile-390-overlay-settings.png) · [after](screenshots/ui-3.0/after/mobile-390-settings.png) | [after](screenshots/ui-3.0/after/tablet-768-settings.png) | [before](screenshots/ui-3.0/before/desktop-1440-overlay-settings.png) · [after](screenshots/ui-3.0/after/desktop-1440-settings.png) |
| Add transaction | [before](screenshots/ui-3.0/before/mobile-390-overlay-entry.png) · [after](screenshots/ui-3.0/after/mobile-390-dialog-entry.png) | [after](screenshots/ui-3.0/after/tablet-768-dialog-entry.png) | [before](screenshots/ui-3.0/before/desktop-1440-overlay-entry.png) · [after](screenshots/ui-3.0/after/desktop-1440-dialog-entry.png) |
| "Khác" menu | [after](screenshots/ui-3.0/after/mobile-390-menu-more.png) | — | — |

Regenerate with `node tools/capture-screenshots.cjs <dir> 390,768,1440`.

## 5. Test results (this branch)

| Command | Result |
|---|---|
| `node tests/web.cjs` | PASS (privacy, endpoint validation, authenticated POST, session-only default, cache boundary, SW allowlist incl. `docs/styles/`) |
| `npm test` | 36 / 36: characterization, legacy parity, domain, API contract (refactored backend = legacy `Code.gs`), backend, sync |
| `npm run e2e` | 24 / 24 in Chromium (real PWA + real `apps-script/*.gs` on emulated Sheets) |

The e2e suite includes:
- **Sync and offline:** the full two-device sync matrix (offline create, lost response, edit conflict, delete vs stale edit, budget conflict, invalid token, partial failure) and the service-worker offline shell.
- **Feature workflows:** assets with conflict resolution, recurring confirmation idempotency, privacy mode, assistant tools, legacy-backend compatibility, backup before reset.
- **Security:** XSS escaping.
- **New UI gates** (`ui.e2e.cjs`):
  - Value parity: every financial value on every migrated screen equals the pre-redesign UI on the same fixture (home totals, savings rate, budget %, limit and remaining, debt summary, cumulative values, loan schedule rows, budget inputs, net worth, transaction count).
  - 360/390/430/768/1024/1440/1920 px: correct shell per breakpoint, no page overflow, no clipped amounts, no console errors.
  - Phones: every interactive target ≥ 44×44 px (chart bars ≥ 24 px wide over the full column height).
  - Hash deep links, browser back, `aria-current`, focus moves to the page heading.
  - Dialogs: focus moves in, Tab is trapped, Escape closes safe dialogs and returns focus, an unsaved entry is not dismissed by Escape, visible keyboard focus ring.
  - **axe-core 4.10.3, WCAG 2.0/2.1/2.2 A+AA: zero violations** on all 9 screens and the entry dialog at 390 and 1440 px.

## 6. Compatibility assessment

| Contract | Changed? | Evidence |
|---|---|---|
| Apps Script API v3, actions, payloads, conflict codes | **No**. No file under `apps-script/` changed | `git diff --stat main -- apps-script` is empty; contract test passes |
| Google Sheets schema | **No** | — |
| localStorage keys | **No new or renamed keys**; same read/write paths | Storage writes reviewed in the diff; sync matrix passes |
| Financial calculations / loan formulas / validation | **No**. `docs/src/domain/` untouched | Parity, characterization and UI value-parity tests |
| Offline / pending records / conflicts | Unchanged behaviour; offline now *shown* explicitly | Sync matrix and offline SW test |
| Persistence mechanisms | None added | — |
| Android / bridge shim (`FamilyNative`, `nativeRequest`, `familyresume`) | **No** (`web-bridge.js` untouched) | APK 2.3.0 has its own UI and is unaffected |

## 7. Deliberate deviations and known issues

1. **AA text colour variants.** The spec's semantic hues (e.g. income `#159A65`, 3.6:1 on white) fail WCAG 4.5:1 for small text. They are kept for fills, bars, dots and icons. Text uses darker variants of the same hues (`--color-*-text`, all ≥ 4.8:1) so the AA target in §9 is met.
2. **Display-only corrections (approved, decision 6):**
   - Savings rate shows "—" without income (was "0%").
   - The donut groups more than 7 categories into "Khác (gộp n danh mục)".
   - Emoji became line icons.
   - The gauge became BudgetProgress.
   - The dashboard budget limit shows the full value "22.517.123 ₫" (was compact "22,52 tr").
   - An explicit 0 budget reads "Hạn mức 0 ₫" instead of "Chưa đặt".
3. **Swipe order** now follows the bottom nav (Tổng quan → Giao dịch → Ngân sách → Tài sản). Dashboard is no longer a primary tab. Swipes are disabled at ≥1024 px.
4. **Phones hide row edit/delete icons.** Both actions are in the transaction detail sheet (Delete was added there), keeping rows readable and targets at 44 px.
5. **Wide tables scroll horizontally on tablet** (forecast) inside a labelled, focusable region. On phones they become stacked rows.
6. **No skeletons on first paint.** Data renders instantly from the local cache. Skeleton and MetricCard loading states exist for asynchronous content; sync progress shows in SyncStatus.
7. **Not testable here:** real Android WebView, iOS Safari, and a physical phone install of the PWA. These are owner checks before merge (CSS uses only widely supported features plus `env(safe-area-inset-*)`).
8. **Remaining-term figure.** The spec asks for "remaining term"; the loan sheet has no maturity data. The UI shows schedule coverage ("Lịch có đến MM/YYYY") instead of inventing a term.
9. **Asset trend history** is not shown in Reports. Only individual valuations exist, and a trend would need backfilling, which the data model forbids.

## 8. Rollback

- Before merge: close the PR; `main` is unchanged.
- After publication: revert the merge commit on `main` (`git revert -m 1 <merge>`). Pages then serves the previous `docs/`. Its service worker uses cache `-v3`, and users reopen the app once.
- No data migration is involved, so nothing in Google Sheets, localStorage or Apps Script needs restoring. Pending offline records stay in the same keys and are picked up by either version.
