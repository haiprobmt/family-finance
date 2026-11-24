# Implementation Plan — Comprehensive Refactor

## 1. Delivery decisions and feasibility

- Comprehensive scope.
- Android + PWA target.
- APK 2.3.0 is currently the only Android artifact available.
- Refactor strategy.
- Single coordinated production release.
- Priorities: dashboard, loans/assets, AI, budget, automation and UX.

This repository has no Android source project or APK build pipeline. Implementation can refactor PWA and Apps Script while preserving APK 2.3.0 API compatibility. Native Android refactor is blocked until source is supplied. Do not substitute APK decompilation.

## 2. Workstreams and dependencies

### W0 — Discovery and characterization

Deliverables: inventory PWA/backend/local storage; API fixtures; characterization tests for current calculations; synthetic fixtures; private backup/restore runbook.

Exit: existing tests pass; legacy transaction/budget/loan outputs reproducible; all write paths identified.

### W1 — Domain and application refactor

Deliverables: pure money/date utilities; transaction aggregation; budget engine; loan engine with parity tests; asset/net-worth engine; cash-flow classification actual/planned/forecast; typed validation/errors.

Rules: domain modules do not depend on DOM, localStorage, Apps Script or AI SDK. Preserve outputs while extracting.

### W2 — Data and sync refactor

Deliverables: repository interfaces; local persistence adapter; durable operation queue; idempotency/conflict strategy; sync status model; compatibility adapter for current localStorage keys.

Rules: do not switch live users to IndexedDB until migration/rollback tests pass. Preserve pending drafts/deletes. Keep current API calls unchanged until contract tests pass. Additive endpoints only.

### W3 — PWA UI and dashboard

Deliverables: modular PWA; Dashboard 2.0; net worth and asset/liability cards; cash-flow and budget drill-down; hide-amount mode; quick entry/history improvements; responsive layout.

### W4 — Assets, loans and budgets

Deliverables: asset register/valuation history; loan account/payment views; repayment simulator with assumptions; budget thresholds/comparisons; planned vs posted states; missing-data handling.

Do not replace private loan schedule before full schema and calculation characterization.

### W5 — Automation and calendar

Deliverables: recurring rules; pending occurrence generation; financial calendar; in-app reminders; idempotent generation.

Push notifications are optional and must not block core correctness.

### W6 — AI advisor

Deliverables: provider abstraction; allowlisted typed tools; summary/expense/budget/loan/forecast prompts; evidence/data coverage; confirmation before writes.

AI follows deterministic services. It does not calculate canonical loan balances or post recurring items.

### W7 — Release hardening

Deliverables: regression suite; two-device sync; APK 2.3.0 compatibility; responsive/accessibility checks; security scan; backup/rollback rehearsal; coordinated release.

## 3. Indicative schedule

| Phase | Estimate | Exit gate |
|---|---:|---|
| W0 Discovery | 3–5 days | Legacy behavior documented/tested |
| W1 Domain refactor | 1–2 weeks | Calculation parity |
| W2 Data/sync | 1–2 weeks | Offline/retry/conflict tests |
| W3 Dashboard/UX | 1–2 weeks | Reconciled UI |
| W4 Assets/loans/budget | 1–2 weeks | Financial acceptance |
| W5/W6 Automation and AI | 1–2 weeks | Safe/idempotent workflows |
| W7 Release hardening | 3–5 days | All gates pass |

Indicative total: approximately 8–11 weeks. This depends on Android source availability, loan-data discovery and test environment readiness.

## 4. Milestones

- M0: audit complete; backup/restore rehearsal.
- M1: domain calculations match legacy behavior.
- M2: API contract and offline sync pass.
- M3: dashboard and transaction UX complete.
- M4: assets, loans and budgets reconcile.
- M5: recurring rules and AI tools pass safety tests.
- M6: release candidate passes all gates; cutover approved.

## 5. Definition of done

Acceptance criteria implemented; unit/integration tests pass; loading/empty/error/offline/conflict UI exists; no private data/secrets in diff/logs; mobile and desktop checked; docs updated; API compatibility retained; no production migration/deployment without owner approval.

## 6. Blockers / owner inputs

1. Android source repository or confirmation it is a WebView wrapper.
2. Copied test spreadsheet and test Apps Script deployment.
3. Current loan sheet structure and contract-specific rules, reviewed privately.
4. APK 2.3.0 test binary/device availability.
5. Release owner approval after reconciliation report.

Never request or commit live tokens, private spreadsheet URLs, signing keys or real financial rows.
