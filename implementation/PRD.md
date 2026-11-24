# Product Requirements — Family Finance 3.0

## 1. Objective

Evolve Chi Tiêu Gia Đình from a transaction logger into a private household financial control center. Users should understand what the household owns and owes, actual cash flow, budget status, upcoming obligations and a clearly qualified 1–12 month forecast.

The product serves one household and trusted devices. Multi-tenant SaaS, bank aggregation, automatic transfers and bill payment are out of scope.

## 2. Personas and platforms

- Primary user: household administrator entering and reviewing finances.
- Secondary user: trusted household member using another device.
- PWA: responsive installable web app.
- Android: existing APK 2.3.0 remains a supported client until its source/build pipeline is supplied. This repository does not contain Android source.

## 3. Product principles

1. Data correctness before visual polish or AI.
2. Actual, planned and forecast values must never be silently mixed.
3. Every financial total must be traceable to source records or an explicitly labeled estimate.
4. Deterministic code performs financial arithmetic; AI explains results.
5. AI cannot create, update or delete financial records without explicit user confirmation.
6. Offline drafts survive app restarts and failed sync attempts.
7. Privacy is default: no household data in public source, logs or unnecessary prompts.

## 4. Functional requirements

### FR-01 Dashboard

- Selected month and period navigation.
- Actual income, actual expenses, net cash flow and savings rate.
- Total assets, liabilities and net worth only when source data is sufficiently complete.
- Budget utilization and upcoming planned obligations shown separately.
- Drill-through from KPIs to source records.
- 6–12 month trends when sufficient history exists.
- Cash-flow forecast with assumptions and coverage notes.
- Hide-amount/privacy mode.

Acceptance: totals reconcile to source calculations; missing loan or asset data is labeled unknown/incomplete, not silently zero; forecast is visually distinct from actual.

### FR-02 Assets

- Support bank/cash accounts, real estate, vehicles, investments and other assets.
- Capture ID, type, name, acquisition date/value, current estimated value, valuation date, ownership share and notes.
- Maintain valuation history and allow manual updates.
- Label user-entered estimates as estimates.

Acceptance: net worth uses latest valid valuation and ownership share. Do not fabricate historical net worth from today's value.

### FR-03 Loans

- Preserve current private loan schedule and existing business rules.
- Add structured loan metadata, principal snapshots and payment schedules only after schema discovery and migration approval.
- Separate principal, interest, fees and actual payment.
- Support fixed/variable rates and repayment methods where contract data exists.
- Simulate early repayment with explicit assumptions and known fees.
- Label incomplete schedules and forecast rates.

Acceptance: legacy calculation parity tests pass; private loan rows stay out of public source; preserve Techcombank exclusion from 2026-11 onward unless owner changes the rule; principal is not counted as an expense in net-worth accounting.

### FR-04 Budget

- Preserve current category budgets and month-scoped overrides.
- Add monthly/category budgets, alert thresholds, period comparisons and drill-down.
- Keep recurring planned expenses separate from posted transactions.
- Rollover is optional and requires an explicit policy.

Acceptance: current revision/conflict behavior remains; stale revisions cannot overwrite newer budgets; preserve loan-payment sentinel behavior until intentionally redesigned.

### FR-05 AI advisor

- Retain current provider and server-side key boundary initially.
- Add provider adapter and typed tools for summary, expense analysis, budget status, loan position, repayment simulation and forecast.
- Build deterministic calculations first.
- Return period, data coverage and calculation provenance.
- Require user confirmation before any write action.

Acceptance: answers are grounded in tool output; missing/stale data is disclosed; context is minimized and bounded; provider failure cannot block transaction entry or sync.

### FR-06 Automation

- Recurring rules with cadence, start/end dates, next occurrence and pause state.
- Generated occurrences default to pending confirmation, not paid transactions.
- In-app reminders for due dates, budget thresholds and sync failures.
- Notification delivery is opt-in; avoid exposing amounts on lock screens by default.

Acceptance: occurrence generation is idempotent; retry cannot create duplicates; planned items do not change actual cash flow until confirmed.

### FR-07 Transactions and UX

- Preserve create, edit, delete, search and filtering.
- Improve quick entry and templates after regression coverage.
- Add export/backup with explicit date range and privacy warnings.
- Maintain accessibility and responsive layouts.

### FR-08 Sync and settings

- Preserve authenticated Apps Script transport.
- Add durable local operation queue and conflict-aware reconciliation.
- Show synced, pending, syncing, conflict and failed states.
- Never clear a pending operation before server acknowledgement.
- Provide manual backup before destructive reset.

Acceptance: retry does not duplicate operations; two-device edits surface conflict or safe deterministic resolution; stale clients cannot silently overwrite newer state.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Integrity | No silent loss or duplication |
| Compatibility | APK 2.3.0 contract remains valid during transition |
| Security | Secrets remain in Apps Script properties; HTTPS only |
| Privacy | No private records in GitHub |
| Offline | Draft entry survives reload/restart |
| Performance | Dashboard uses normalized local snapshot |
| Accessibility | Semantic controls, focus and contrast |
| Observability | Safe error codes/operation IDs; no tokens or financial payloads |
| Recovery | Backup, migration verification and rollback |

## 6. Out of scope

Bank aggregation, scraping, automatic transfer/payment, investment trading, multi-household tenancy, replacing Sheets in this release, and native Android rebuild without source/build/signing setup.

## 7. Release definition

One coordinated production cutover: compatible Apps Script and PWA are promoted together after all gates pass. APK 2.3.0 must pass compatibility tests. A new APK requires its source repository and signing/build pipeline before release approval.
