# AI Coding Agent Guide

## Mission

Implement Family Finance 3.0 in haiprobmt/family-finance using the approved comprehensive refactor plan. Preserve household data and the current Apps Script API contract.

## Mandatory first steps

1. Read every document in implementation/.
2. Inspect repository and report discrepancies against the plan.
3. Run node tests/web.cjs and record baseline.
4. Map PWA script dependencies, backend functions, localStorage keys and all write paths.
5. Add synthetic fixtures and characterization tests before refactoring calculations.
6. Confirm a test spreadsheet and test Apps Script deployment exist.

## Never do these

- Never connect agents/tests to production family spreadsheet.
- Never request or commit live tokens, API keys, private URLs, loan rows, transactions, family photos, APKs or signing keys.
- Never change current API version/action semantics during refactor.
- Never remove legacy localStorage keys without tested migration adapter.
- Never drop pending local writes/deletes after sync failure.
- Never treat missing loan data as confirmed zero.
- Never mix actual, planned and forecast totals.
- Never let AI calculate authoritative totals or mutate records without confirmation.
- Never decompile APK and call it a source refactor.
- Never publish partial code to main.

## Work protocol

For each task:
1. List files to change and rationale.
2. Define acceptance tests before implementation.
3. Make smallest coherent change.
4. Run relevant tests and full existing test command.
5. Inspect diff for secrets, private data and unrelated changes.
6. Update docs.
7. Report tests, limitations and migration impact.

Avoid one mega-commit touching UI, domain, API and migration at once.

## Suggested ownership

| Area | Primary owner |
|---|---|
| Domain calculations | Finance/domain agent |
| Apps Script API/repositories | Backend agent |
| PWA UI/features | Frontend agent |
| Sync/local persistence | Sync agent |
| Regression/release | QA agent |
| Cross-cutting decisions | Architect/orchestrator |

Only one agent owns a shared file at a time. Avoid parallel edits to docs/app.js, apps-script/Code.gs or shared schemas.

## Required deliverables before feature work

- Baseline audit report.
- API contract fixtures.
- Local storage inventory.
- Legacy financial calculation characterization suite.
- Synthetic transaction/budget/loan fixtures.
- Test spreadsheet setup guide.
- Android source availability decision.

## Refactoring order

1. Extract pure calculation functions without changing outputs.
2. Add repository interfaces and adapters.
3. Add sync state model and queue behind current transport.
4. Extract backend services while keeping existing router.
5. Refactor UI to use application use cases.
6. Add assets/loans/budget enhancements.
7. Add recurring workflow.
8. Add AI tools over deterministic services.
9. Rehearse migration and harden release.

## Definition of done

Acceptance tests pass; compatibility tests pass; no private data/secrets in diff; offline/error/conflict states handled; docs match implementation; no production migration/deployment without owner approval.
