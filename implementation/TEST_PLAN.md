# Test Plan — Family Finance 3.0

## 1. Test layers

| Layer | Coverage | Data |
|---|---|---|
| Unit | Money, dates, budget, loan, net worth, forecast | Synthetic fixtures |
| Contract | Apps Script request/response and errors | Sanitized fixtures |
| Integration | Repositories, local persistence, Apps Script | Test spreadsheet |
| Sync | Offline, retry, duplicate, conflict, two devices | Two test clients |
| UI | Navigation, forms, drill-down, privacy | Browser/manual |
| Security | Token handling, formula injection, leakage | Synthetic secrets |
| Release | PWA install/cache and APK compatibility | Test deployment |

## 2. Characterization before refactor

Capture current behavior:
- Monthly income/expense/remaining and savings rate.
- Category totals and budget utilization.
- Month-scoped budget overrides and -1 loan-payment sentinel.
- Loan bank tracking by month.
- Techcombank forecast rate and principal-payment rule.
- Missing loan schedule behavior.
- Transaction create/update/delete conflict behavior.
- Budget revision conflict behavior.
- Local pending transactions and pending deletes.
- AI scoped-context size/error behavior.

Do not change legacy outputs while extracting code unless a separate approved requirement defines the new behavior.

## 3. Financial test scenarios

### Transactions
- Income/expense aggregation.
- Zero, negative, non-finite and over-limit amount rejected.
- Invalid date/type rejected.
- Duplicate operation replay does not duplicate ID.
- Stale update base returns conflict.
- Offline delete remains queued.

### Budget
- Base category budgets.
- Month-specific override.
- Removal sentinel for loan-payment override.
- Stale revision returns BUDGET_CONFLICT.
- Empty and zero budget display correctly.
- Planned recurring expense does not count as actual spend.

### Loans
- Missing schedule is incomplete, not zero/paid.
- Existing calculation parity for every bank/month.
- Rate boundary and day-count tests.
- Principal and interest separated.
- Extra-payment simulation uses explicit assumptions.
- Principal reduces liability, not expense.
- Interest and fees are expenses.
- Techcombank exclusion from 2026-11 onward is preserved.

### Assets and net worth
- Latest valuation by cut-off date.
- Ownership share.
- Missing valuation is unknown.
- Liability snapshot date aligned with net-worth date.
- Historical net worth is not backfilled from current valuation.

### Forecast
- Actual, planned and forecast separated.
- Recurring occurrence generation idempotent.
- No duplicate loan payment.
- Forecast labels assumptions and missing inputs.
- Forecast never mutates actual transactions.

## 4. Sync test matrix

| Scenario | Expected result |
|---|---|
| Device A creates online | Acknowledged; no pending operation |
| Device A creates offline | Durable pending operation |
| App restarts offline | Draft/queue survives |
| Network returns | Retry syncs once |
| Server accepted but response lost | Retry does not duplicate |
| A and B update same transaction | Visible conflict; no silent overwrite |
| A deletes while B edits stale copy | Conflict/tombstone policy applied |
| Budget changed on B | A receives budget conflict |
| Invalid token | Clear auth error; drafts retained |
| Partial sync failure | Acknowledged ops removed; remaining ops retained |

## 5. Security/privacy tests

- No token in URL, query string, browser history or logs.
- No API key in PWA assets or Git.
- Formula-injection strings stored safely.
- User-entered text escaped in UI.
- Service worker caches only allowlisted static assets.
- No API response/financial data cached by service worker.
- AI context minimized, allowlisted and bounded.
- Fixtures contain no real family records, identifiers or loan data.

## 6. Existing test command

Run from repository root:

~~~bash
node tests/web.cjs
~~~

Expand the suite without removing existing privacy, endpoint validation, session-only default, asset-path and cache-boundary assertions.

## 7. Release gates

- [ ] Existing test suite passes.
- [ ] New unit and contract tests pass.
- [ ] APK 2.3.0 reads snapshot and performs supported operations against test deployment.
- [ ] Two-device sync matrix passes.
- [ ] Transaction count and monthly totals reconcile before/after migration.
- [ ] Budget revision/conflict handling passes.
- [ ] Loan calculations match characterized legacy outputs.
- [ ] Offline drafts survive reload and failed sync.
- [ ] No secrets/private records in diff or built assets.
- [ ] Backup and rollback rehearsal completed.
- [ ] PWA install/update/service-worker behavior verified.
- [ ] Owner approves single-release cutover.

## 8. Implemented test inventory

| File | Layer | Covers |
|---|---|---|
| `tests/web.cjs` | Security/release | Original assertions + SW allowlist equals referenced assets, secret scan of `docs/src` |
| `tests/characterization.test.cjs` | Characterization | Legacy budgets, -1 sentinel, loans (Techcombank cut-off, 365/909,400), cash flow, merge, search, full legacy v3 contract |
| `tests/parity.test.cjs` | Unit (parity) | Domain vs frozen legacy on randomized synthetic inputs |
| `tests/domain.test.cjs` | Unit | Money/dates, budget thresholds, liabilities, simulator, net worth, recurring, forecast, insights |
| `tests/contract.test.cjs` | Contract | Legacy vs refactored backend: identical responses and sheets; chat_scoped; Domain.gs drift |
| `tests/backend.test.cjs` | Integration | Migrations (dry-run, additive, repeatable, abort), ext collections, assistant tools, reconciliation |
| `tests/sync.test.cjs` | Sync (unit) | Merge parity, decisions, operation view, status model, backup/CSV safety, local store |
| `tests/e2e/sync.e2e.cjs` | Sync (browser) | §4 matrix with two devices |
| `tests/e2e/features.e2e.cjs` | UI/Security/Release | Assets + conflicts, recurring idempotency, privacy mode, assistant, drill-through, simulator, backup, legacy backend, SW, layout, XSS |

Harness: `tests/harness/apps-script-runtime.cjs` emulates the Sheets behaviours the backend relies on (date auto-typing, apostrophe literals, cross-realm Dates). It does **not** replace testing against a copied spreadsheet and a test deployment.
