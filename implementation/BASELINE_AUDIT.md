# Baseline Audit — W0

Audited commit: `7cb5b74` (main before Family Finance 3.0 work). Baseline test
command `node tests/web.cjs` passed before any change.

## 1. Discrepancies against the implementation pack

| # | Finding | Impact | Resolution |
|---|---|---|---|
| D1 | All nine `implementation/*.md` files were committed **empty**; their text existed only in commit messages. | Agents following AGENT_GUIDE step 1 would read nothing. | Restored verbatim from the commits. |
| D2 | `Code.gs` header says "Standalone Android API v2" while `doGet` reports `apiVersion: 3`. | Cosmetic. | Comment corrected; API unchanged. |
| D3 | `setup()` runs inside **every** locked request and auto-creates `Transactions`/`Budgets`. | New sheets must not be auto-created per DATA_MODEL §6. | Kept for the two legacy sheets (compatibility); new sheets are created only by explicit, versioned migrations (`runMigrations`). |
| D4 | "Clear device data" and "Log out" drop pending local writes after a `confirm()` only. | Violates FR-08 "manual backup before destructive reset". | Both now offer a JSON backup download of local data and pending operations first (token never included). |
| D5 | Techcombank actual-rate `<input class="loan-actual-rate">` is rendered but has no handler, and only appears for Techcombank months ≥ 2026-12, which the backend excludes. | Dead control; never visible with backend data. | Preserved as characterized (no behaviour change). |
| D6 | Home budget gauge includes the auto loan schedule total even when the schedule is incomplete (missing bank treated as 0 in the sum, flagged elsewhere). | Missing data could read as a confirmed number. | Legacy total kept for parity; gauge and Dashboard now label the value "tạm tính / thiếu dữ liệu". |
| D7 | `STORE.endpoint` (`ffpages:family_finance_endpoint_v1`) is declared but never read or written. `ffpages:lastPerson` is used but not listed in DATA_MODEL §2. | Inventory gap. | Both added to the storage inventory; neither removed. |
| D8 | `v3_create` with an existing ID returns `ok` without writing (idempotent replay). A *different* payload reusing an ID is silently ignored. | Safe for retries; IDs are random UUIDs. | Documented; behaviour preserved. |
| D9 | `save_budgets` with malformed JSON returns the raw V8 parse message. | No sensitive content. | Preserved (contract parity). |
| D10 | Service worker is cache-first with a fixed cache name; adding files requires a cache-name bump. | Stale assets after deploy. | Cache name bumped to `family-finance-pages-v3` and allowlist extended; test asserts every allowlisted file exists. |
| D11 | Loan window is hard-coded `2026-10 … 2030-12` in backend and UI. | Characterized legacy rule. | Preserved. |

## 2. PWA script dependency map (load order in `index.html`)

1. `web-bridge.js` — `FamilyNative.configure/getConfig`, `nativeRequest()` (authenticated POST), `nativeConfig`.
2. `loans-data.js` — `LOAN_SCHEDULE` public empty default + `ffpages:loans` cache.
3. `dashboard.js` — loan calculations (`trackedBanks`, `calculateLoanPayment`, `loanScheduleRows`), `dashboardData`, `weeklySpending`, `accumulatedSavings`, dashboard rendering. Uses `$`, `money`, `escapeHtml` from app.js at call time.
4. `app.js` — state, budgets (`limitsAt`), totals, sync (`retryUnsynced`, `syncWithSheet`, `mergeSheetTransactions`, `mergeRemoteBudget`), all UI.
5. `ui-icons.js`, 6. `pwa.js` — icons, service-worker registration, install, logout.

## 3. Backend functions (`apps-script/Code.gs`)

`setup`, `json`, `authenticate` (constant-time compare, token ≥ 24), `doGet`, `doPost` (router + script lock), `validLimit`, `readBudgets`, `budgetRevision` (SHA-256 of sorted entries), `saveBudgets`, `snapshot`, `mutateTransaction`, `callDeepSeek`, `LABELS`, `scopedKnowledge`, `testAssistantKnowledge`, `testDeepSeekConnection`, `readPrivateLoans`.

## 4. Local storage inventory (all prefixed `ffpages:`)

| Key | Contents | Writer |
|---|---|---|
| `family_finance_transactions_v1` | Transactions incl. unsynced (`synced:false`, `pendingUpdate`, `base`, `conflict`) | app.js |
| `family_finance_budgets_v1` | Budget map incl. month-scoped keys | app.js |
| `family_budget_sync_v2` | `{revision, pending:{values, baseRevision}, remote}` | app.js |
| `family_deleted_v2` | IDs pending delete (durable tombstones) | app.js |
| `lastVerifiedV3` | Last fully verified sync time | app.js |
| `lastPerson` | Last selected person | app.js |
| `connection` | `{endpoint, token}` — sessionStorage by default, localStorage only when "remember" | web-bridge.js |
| `family_finance_loan_rates_v1` | Techcombank forecast/actual rate settings | dashboard.js (read only) |
| `loans` | Cached private loan schedule from snapshot | app.js |
| `family_finance_endpoint_v1` | Declared, unused | — |

New 3.0 keys are additive: `ext_cache_v1` (assets/valuations/recurring + pending), `privacy_hide_amounts`, `schema_version`.

## 5. Write paths

| UI action | Local effect | Remote call |
|---|---|---|
| Save entry | push tx `synced:false` | `v3_create` |
| Edit entry | tx `pendingUpdate`, `base` snapshot | `v3_update` (`TX_CONFLICT` → `conflict`) |
| Delete entry | add to `family_deleted_v2`, remove local | `v3_delete`, tombstone removed after ack |
| Save budgets | `family_budget_sync_v2.pending` | `save_budgets` (`BUDGET_CONFLICT` → `remote`) |
| Resolve budget conflict | take remote / re-base pending | `save_budgets` |
| Save connection | session/local `connection` | none |
| Clear data / Log out | remove `ffpages:*` | none |
| Assistant | none | `chat_scoped` |

Retry triggers: app start, `visibilitychange`, `online`, `familyresume`, sync button, sync pill.

## 6. Owner inputs still required (blockers outside this repository)

1. Copied **test spreadsheet** and **test Apps Script deployment** — not available to the agent. All backend testing here uses an in-memory Sheets emulation (`tests/harness/apps-script-runtime.cjs`) running the real `.gs` files.
2. **Android source** — not present. APK 2.3.0 compatibility is protected by contract tests that replay the v3 request set against the frozen legacy backend and the refactored one.
3. **Private loan sheet structure review** — only the documented headers are used; fixtures are synthetic.
4. **APK 2.3.0 device** for the release gate.
5. **Owner approval** for production cutover.
