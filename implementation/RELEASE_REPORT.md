# Release Report — Family Finance 3.0 (release candidate)

Branch: `claude/gallant-babbage-5dl3j6`. Status: **release candidate, not deployed.**
Production deployment, migration and cutover need the owner (MIGRATION_PLAN §5, steps 3–14).

## 1. What was delivered per workstream

| WS | Delivered | Where |
|---|---|---|
| W0 | Restored the empty implementation docs; baseline audit (discrepancies, storage keys, write paths); frozen legacy oracle; in-memory Apps Script/Sheets emulation that runs the real `.gs` files; synthetic fixtures; characterization suite | `implementation/BASELINE_AUDIT.md`, `tests/legacy/`, `tests/harness/`, `tests/fixtures/`, `tests/characterization.test.cjs` |
| W1 | Pure domain engine: money/dates, budgets, cash flow, loans, net worth, recurring, forecast, insights. PWA delegates to it under the same function names. Parity with legacy shown on randomized synthetic inputs | `docs/src/domain/`, `tests/parity.test.cjs`, `tests/domain.test.cjs` |
| W2 | Sync engine (merge, decisions, operation view, status model), local-store adapter (no key renamed or removed), local-first extension store with revisions and conflicts | `docs/src/sync/`, `docs/src/data/`, `docs/src/features/ext-store.js`, `tests/sync.test.cjs` |
| Backend | `Code.gs` router kept; services split into files; `Domain.gs` generated from the PWA domain (drift-checked); additive `ext_snapshot`/`ext_save`/`assistant_tool`; versioned migrations; private reconciliation report | `apps-script/`, `tools/build-apps-script.cjs`, `tests/contract.test.cjs`, `tests/backend.test.cjs` |
| W3 | Dashboard 2.0: actual cash-flow KPIs with drill-through, net worth, budget alerts, forecast card; hide-amount mode; reminders on home | `docs/index.html`, `docs/src/features/finance-views.js`, `docs/features.css` |
| W4 | Asset register and valuation history, net worth at a cut-off date, loan position (interest vs principal; missing = unknown), repayment simulator with explicit assumptions, budget thresholds and month-over-month comparison | same |
| W5 | Recurring rules (weekly/monthly/yearly, interval, end date, pause, skip), 60-day financial calendar, idempotent confirmation, in-app reminders (due/overdue, budget thresholds, sync failure/conflict). No push notifications | same |
| W6 | Provider adapter (`AI_PROVIDER`, default DeepSeek). Allowlisted deterministic tools return period, coverage and provenance. Provider failure still returns the data. No write tools. Falls back to `chat_scoped` on older backends | `apps-script/Assistant.gs`, `docs/src/domain/insights.js` |
| W7 | Browser e2e (two devices against the real backend code), security checks, SW allowlist test, layout/accessibility checks, CI workflow, backup/CSV export | `tests/e2e/`, `.github/workflows/test.yml` |

## 2. Test evidence

Commands (from the repository root):

~~~bash
npm test        # node tests/web.cjs + 36 unit/characterization/parity/contract/backend/sync tests
npm run e2e     # 18 Playwright tests: real PWA + real apps-script/*.gs on emulated Sheets
~~~

Last local run: `npm test` 36/36 plus `web.cjs` PASS; `npm run e2e` 18/18.

Key assurances:
- **API compatibility (APK 2.3.0 stand-in):** `tests/contract.test.cjs` replays 43 requests (the full v3 set) (auth, version gate, validation limits, idempotent replay, `TX_CONFLICT`, `BUDGET_CONFLICT`, deletes, formula text) against the frozen pre-3.0 `Code.gs` and the refactored files. Responses and resulting sheets are identical. `chat_scoped` requests to the provider are byte-identical.
- **Calculation parity:** budgets, loan schedule/payment/summary (including the Techcombank 365-day path and 909,400 principal), monthly totals, dashboard trend, weekly buckets and accumulated savings all match legacy outputs. Mutation checks confirmed the tests fail when a rule changes.
- **Sync matrix (TEST_PLAN §4), in a real browser:** online create; offline create surviving reload; lost response with no duplicate; concurrent edit → visible conflict; delete vs stale edit; budget conflict; invalid token with drafts kept; partial failure keeping unacknowledged operations.
- **Security/privacy:** token only in the POST body (never URL/logs); provider key never returned or logged; formula-injection text stored literally (transactions and ext sheets); UI escapes user text (XSS test); service worker caches only the allowlisted static files (asserted against page/CSS/manifest references); no notes, names or IDs in assistant tool payloads; backup and CSV contain no credentials; CSV cells formula-guarded.

## 3. Release gates (TEST_PLAN §7)

| Gate | Status |
|---|---|
| Existing test suite passes | ✅ (`node tests/web.cjs`, extended, nothing removed) |
| New unit and contract tests pass | ✅ |
| APK 2.3.0 reads snapshot and writes against test deployment | ⛔ **Blocked — needs device + test deployment.** Contract parity with the legacy backend is the proxy evidence |
| Two-device sync matrix passes | ✅ in emulation (two browser contexts); ⏳ repeat on two phones against the test deployment |
| Transaction count and monthly totals reconcile before/after migration | ⏳ Owner: run `reconciliationReport()` before and after on the test copy, then production |
| Budget revision/conflict handling | ✅ |
| Loan calculations match characterized legacy outputs | ✅ |
| Offline drafts survive reload and failed sync | ✅ |
| No secrets/private records in diff or built assets | ✅ (scan in `tests/web.cjs` covers `docs/` including `docs/src/`; staged diffs scanned per commit) |
| Backup and rollback rehearsal | ⏳ Owner (MIGRATION_PLAN §3, §7) |
| PWA install/update/service-worker behaviour | ✅ cache boundary + offline shell in Chromium; ⏳ install/update on real phones |
| Owner approves single-release cutover | ⏳ |

## 4. Migration impact

- **Legacy sheets untouched:** `Transactions`, `Budgets`, `Loans`, `FinanceSettings` keep their names, headers and semantics. `setup()` still only creates the two legacy sheets.
- **New sheets** (`Assets`, `AssetValuations`, `RecurringRules`, `Migrations`) are created only by `migrationsApply()`. It does a dry run by default, can be re-run safely, validates headers before any write, logs id/timestamp/counts only, and aborts if legacy row counts change.
- **Clients:** APK 2.3.0 and older PWA builds keep working; they never call the new actions. The new PWA on an old backend detects the missing actions and keeps assets and recurring rules on the device, with a banner saying so.
- **Local storage:** all legacy keys are read in place. New keys are `ext_cache_v1`, `privacy_hide_amounts` and `schema_version`. The service-worker cache name changed to `family-finance-pages-v3`, so users must close every app tab once after the deploy.

## 5. Owner runbook (cutover)

1. Finish pending sync on every device; copy the spreadsheet (MIGRATION_PLAN §3).
2. In the **copied** spreadsheet's Apps Script project, add every file listed in `apps-script/files.json` (or `clasp push` from `apps-script/`; `.claspignore` skips `files.json`). Keep `FAMILY_ACCESS_TOKEN` and `DEEPSEEK_API_KEY`.
3. Run `reconciliationReport()` and save its output privately.
4. Run `migrationsDryRun()`, review it, then `migrationsApply()`.
5. Deploy a test Web App version. Point a PWA build (local `docs/` server) and APK 2.3.0 at it. Run the smoke checks: snapshot, create/edit/delete, budgets, assets, recurring confirm, assistant.
6. Run `reconciliationReport()` again; transaction rows, unique IDs, monthly totals, budget revision and loan rows must match step 3.
7. Repeat steps 1–6 on production during a short write freeze, then publish `docs/` (merge to `main`).
8. Rollback: previous Apps Script version + previous `docs/` commit; restore the spreadsheet copy only if a migration misbehaved (MIGRATION_PLAN §7). New sheets can be left in place; old clients ignore them.

## 6. Known limitations and deliberate non-goals

- No native Android work: the source is not in this repository. No decompilation.
- Assets and recurring rules are saved as whole collections with a revision (like budgets). Concurrent edits to *different* items on two devices still conflict and the user chooses a copy. This is safe but coarse.
- Forecast variable spending is a simple average over up to three months with data. It is labelled as an estimate, with its assumptions listed.
- The repayment simulator assumes a fixed rate, actual days/365 and monthly interest rounding. It is labelled as a simulation, not contract terms.
- Push notifications and lock-screen reminders are not implemented (optional per PRD FR-06); reminders are in-app.
- The Techcombank actual-rate input stays dead, as characterized (BASELINE_AUDIT D5).
- `Asia/Singapore` date recovery in `sheetDate` is preserved verbatim from legacy behaviour.
