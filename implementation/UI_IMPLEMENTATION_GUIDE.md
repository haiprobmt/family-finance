# Family Finance 3.0 — Agent UI Implementation Guide

Status: Ready for implementation planning; not authorization to deploy  
Audience: coding agents  
Companion: UI_DESIGN_SYSTEM.md, UI_COMPONENT_CATALOG.md, PRD.md, ARCHITECTURE.md, API_COMPATIBILITY.md, MIGRATION_PLAN.md, TEST_PLAN.md

## 1. Mission

Implement the approved professional responsive interface for the existing PWA and Android WebView surface. This is a presentation-layer modernization, not a financial-domain rewrite.

Current backend, Google Sheets layout, Apps Script API contract, transaction identifiers, local storage, loan calculations and sync semantics are compatibility boundaries.

## 2. Non-negotiable guardrails

1. Do not change Apps Script action names, request/response shapes, API version, conflict codes or transaction validation.
2. Do not change Google Sheets tabs, column order, header meanings or private loan data structures.
3. Do not rename/remove/migrate localStorage keys during UI work.
4. Do not add a second source of truth or parallel persistence mechanism.
5. Do not discard pending writes, local-only records, deleted markers or conflict state.
6. Do not change financial formulas, loan forecasts, repayment exclusions or settings.
7. Do not commit household financial records, emails, tokens, secrets or private configuration.
8. Do not deploy or write to production Sheets during development.
9. Do not add a frontend framework, bundler or CSS framework before inspecting current dependencies and documenting the need.
10. Do not use generated mockup images as application UI. Rebuild with semantic HTML/CSS and real chart primitives.
11. Use one design system across desktop, mobile web and Android WebView.
12. Preserve current Android WebView integration unless separately approved.

If a requirement appears to need a business logic/API/storage change, stop and document the dependency instead of creating a workaround.

## 3. Repository baseline to inspect

Prior repository audit observed:
- PWA served from docs/
- docs/app.js
- docs/dashboard.js
- docs/web-bridge.js
- docs/loans-data.js
- Apps Script backend: apps-script/Code.gs
- Existing test command: node tests/web.cjs
- Android source project/build pipeline was not present in the audited repository.
- README claimed compatibility with Android APK 2.3.0.

These are audit observations, not substitutes for re-inspection. At start:
1. Check branch and working tree.
2. Read root README and implementation docs.
3. Inspect current files, script/style loading order and deployment path.
4. Run baseline tests before editing.
5. Record routes, DOM IDs/selectors, global functions and bridge contracts.
6. Map current screens to functions and data contracts.
7. Do not assume repository still matches the audit snapshot.

## 4. Recommended implementation sequence

### Phase 0 — Baseline and inventory
Deliver DOM/component inventory, routes/navigation map, data loading/mutation call graph, screen-to-function mapping and baseline test output. No code changes in this phase. Exit only after the owner can review the map.

### Phase 1 — Tokens and application shell
Implement tokens, base typography, focus states, page background/layout primitives, desktop sidebar, mobile header/bottom nav, PageHeader and SyncStatus wired to existing state only. Do not modify business logic. Validate rendering and navigation.

### Phase 2 — Shared primitives and composites
Build in order:
1. Button / IconButton / Badge
2. Card / MetricCard / MoneyAmount
3. Form controls
4. Tabs / PeriodSelector / FilterBar
5. Alert / Toast / Modal / BottomSheet
6. EmptyState / Skeleton / DataTable
7. TransactionRow / BudgetProgress / LoanSummary / SyncStatus / FinancialChart

Implement component states and accessibility before broad reuse.

### Phase 3 — Screen migration
Migrate one screen at a time, preserving existing event handlers and data contracts. Suggested order:
1. Dashboard
2. Transactions
3. Budgets
4. Assets & Debt
5. Loan details and schedule
6. Financial calendar
7. Reports
8. AI Advisor
9. Settings

For each screen, document old-to-new mapping, retain DOM selectors relied on elsewhere (or update every consumer with tests), keep calculations outside view code, implement loading/empty/offline/error/conflict states, verify desktop/mobile and compare key values against the same fixture/snapshot.

### Phase 4 — Responsive and accessibility hardening
Test widths: 360, 390, 430, 768, 1024, 1440 and 1920px.

Verify no page-level horizontal overflow; sticky navigation does not cover content; tables have mobile fallbacks; dialogs/sheets fit viewport and keyboard; touch targets >=44px; focus order and visible focus; zoom/text scaling; semantic labels; no clipping of financial amounts.

### Phase 5 — Regression and release candidate
- Run node tests/web.cjs.
- Add/extend component and visual smoke tests using tools already in repo.
- Run transaction, budget, loan, sync, conflict and offline regression scenarios.
- Verify API request/response payload shapes remain compatible.
- Attach before/after desktop and mobile screenshots for each route.
- Prepare release notes and rollback instructions.
- Wait for explicit owner approval before production deployment.

## 5. Screen-level requirements

### Dashboard
Priority:
1. Household net worth (assets minus liabilities), clearly distinguished from cash.
2. Total assets and total liabilities.
3. Monthly cash flow: income, expense, net flow and savings.
4. Recent transactions.
5. Budget status/top category alerts.
6. Upcoming loan payments and financial calendar.
7. Optional AI insight, explicitly advisory.

Do not fabricate values. If the source cannot provide a metric, hide it or label unavailable.

Desktop: 12-column layout; net-worth hero and metric cards first, cash-flow chart and recent transactions below, supporting insight in a side column.  
Mobile: vertical priority stack; net worth and cash flow first, then recent transactions and actionable alerts.

### Transactions
Search, period, income/expense, category/person filters where supported. Add action remains connected to existing flow. Rows show description, category/person, date and amount. Detail/edit/delete use existing API and conflict behavior. Distinguish no transactions from no filtered results.

### Budgets
Month selector and category spent/limit/remaining. Show overage even when progress bar is capped. Respect existing month-specific budget semantics and loan-payment override sentinel. Do not alter save_budgets payload.

### Assets & Debt
Separate asset classes and liabilities. Show totals/net worth only if source values are available and reconciled. Do not count a loan as both liability and expense. Keep asset valuation distinct from cash.

### Loans
Summary: outstanding principal, rate, installment and remaining term. Schedule separates due date, principal, interest and payment only where source data exists. Simulations are isolated from actual records and labeled Dự báo / Mô phỏng. Preserve existing Techcombank forecast exclusion from November 2026 onward unless owner changes the rule. No UI-only formula changes.

### Financial calendar
Show due dates and recurring events only from verified data. Distinguish actual transaction, scheduled obligation and reminder. Do not create calendar records merely by rendering the view.

### AI Advisor
Generated content is advisory. Show period and source facts. Never automatically create/update transactions, budgets or loans. Proposed changes require review/confirmation and existing authorized write path. If context is unavailable, show limitation rather than fabricated personalized analysis.

### Reports
Period filters, category breakdown, income/expense trends and asset/debt trends only where data supports them. Show exact values and period. Provide accessible text/table chart alternatives. Do not mix forecast with actual history.

### Settings
Sync, backup/restore, notifications, appearance. Destructive reset/restore requires explicit confirmation and consequence summary. Never expose endpoint secrets or private configuration in UI/logs.

## 6. Data and state boundaries

~~~text
Existing API / local cache / bridge
              |
              v
Existing data adapters and domain functions
              |
              v
View model (formatting and display-only derivations)
              |
              v
Reusable components
              |
              v
DOM
~~~

- Keep business calculations in existing domain functions.
- View models may format/group/select fields but must not invent financial truth.
- Component state is presentation-only: open/closed, selected tab, input draft, current filter.
- Persisted financial state continues through existing services/API.
- Do not persist computed dashboard totals as a second copy.
- Keep money arithmetic out of floating-point display calculations.

## 7. Performance and constraints

Prefer CSS layout over JavaScript resize logic. Avoid large dependencies for simple components. Lazy-load only if current navigation supports it safely. Avoid full-page rebuilds for small interactions where feasible. Use event delegation only when consistent with current conventions. Ensure chart rendering does not block transaction entry. Respect reduced-motion preference.

## 8. Required evidence and tests

Before marking a screen complete:
- Existing tests pass.
- Component states verified.
- Desktop and mobile screenshots attached to PR.
- Key financial values match pre-change values on the same fixture.
- No API payload/response contract changed.
- No new storage key or Sheets schema without explicit approval.
- Keyboard/focus checks complete.
- No console errors or unhandled promise rejections.

Financial regression cases:
- Income/expense signs and formatting.
- Month boundary/timezone behavior.
- Budget below, at and above limit.
- Loan principal/interest/installment separation.
- Existing loan exclusion behavior.
- Pending offline create/update/delete.
- Sync success, failure and conflict recovery.
- Deleted markers and duplicate prevention.
- Empty and partially loaded data.

## 9. Pull request protocol

Work on a dedicated feature branch; keep UI changes scoped; put backend/API proposals in a separate PR; include screenshots; list changed routes/components and compatibility assumptions; report actual test commands/results; state whether API, storage, sheet, financial formula or bridge contract changed; request review before merge/deploy.

Suggested branch: feature/family-finance-3-ui (check for collision first).

## 10. Definition of Done

- [ ] Design tokens centralized and consistently applied.
- [ ] Shared component catalog implemented with documented contracts.
- [ ] Desktop and mobile shells responsive.
- [ ] Migrated screens preserve existing workflows.
- [ ] No cartoon illustrations, excessive gradients, glass effects or decorative UI.
- [ ] Financial values retain correctness and semantic clarity.
- [ ] Sync and conflict states visible and actionable.
- [ ] Accessibility and responsive checks pass.
- [ ] Existing tests pass; new tests cover new behavior.
- [ ] No undocumented API, Sheets, localStorage or financial logic changes.
- [ ] Desktop/mobile screenshots included in PR.
- [ ] No production deployment without owner approval.

## 11. Final instruction to coding agent

Treat UI_DESIGN_SYSTEM.md as visual source of truth and UI_COMPONENT_CATALOG.md as component contract. This guide governs sequencing and safety. Inspect the repository before coding, preserve existing behavior, and stop for owner review whenever the design requires a financial rule, API contract, persistence model or native Android integration change.
