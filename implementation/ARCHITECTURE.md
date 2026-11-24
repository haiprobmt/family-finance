# Architecture — Family Finance 3.0

## 1. Current verified topology

~~~text
PWA (GitHub Pages: docs/)
  docs/index.html
  docs/app.js              transaction, budget and UI logic
  docs/dashboard.js        charts and loan calculations
  docs/web-bridge.js       authenticated Apps Script transport
  docs/loans-data.js       public empty defaults + local private cache
  docs/sw.js               explicit static-asset cache
          |
          | HTTPS POST, URL-encoded body
          v
Google Apps Script (apps-script/Code.gs)
  authentication via Script Properties
  snapshot / budget / transaction mutation
  private loan reads
  AI provider call
          |
          v
Existing Google Spreadsheet
  Transactions
  Budgets
  Loans (private)
  FinanceSettings (private)

Existing Android APK 2.3.0 uses the documented API contract.
Android source is not present in this repository.
~~~

## 2. Target logical architecture

Refactor by module boundaries; do not introduce a framework or database migration just for folder symmetry.

- Presentation: PWA pages, components and accessible controls.
- Application: use cases, validation and state transitions.
- Domain: pure financial calculations and invariants.
- Data: repositories, DTO mapping and local persistence.
- Sync: durable operation queue, retry and conflict resolution.
- Backend: Apps Script handlers, services, repositories and AI adapter.
- Platform adapters: browser storage and any future Android implementation.

Dependency direction: presentation -> application -> domain. Data/platform adapters implement application ports. Domain must not import DOM, localStorage, Apps Script globals, provider SDKs or UI code.

## 3. Suggested PWA structure

~~~text
docs/
  index.html
  assets/
  src/
    app/                 bootstrap, navigation, state
    components/
    features/
      transactions/
      dashboard/
      budgets/
      assets/
      loans/
      calendar/
      assistant/
      settings/
    domain/
      money.js
      cashflow.js
      net-worth.js
      budget.js
      loan-amortization.js
      forecast.js
    data/
      repositories/
      mappers/
      local/
    sync/
      queue.js
      coordinator.js
      conflict-policy.js
    platform/
      browser-storage.js
      notifications.js
  sw.js
~~~

This is a target, not a demand to move every file in one commit. Keep current static hosting unless a build pipeline is justified and tested. If assets are split, update the service-worker allowlist and verify all paths.

## 4. Suggested Apps Script structure

~~~text
apps-script/
  Code.gs                 entry point and router
  api/                    legacy v3 adapter
  services/
    transaction-service.js
    budget-service.js
    loan-read-service.js
    financial-query-service.js
  repositories/
    sheets-transaction-repository.js
    sheets-budget-repository.js
    sheets-loan-repository.js
  ai/
    provider.js
    tools.js
  migrations/
    registry.js
~~~

Apps Script deployment may need clasp or deterministic bundling. Do not assume Node module imports work in Apps Script. Test the exact bundled artifact deployed.

## 5. Financial calculation engine

All calculations are pure functions with explicit contracts:
- Money and rounding policy.
- Transaction aggregation.
- Budget utilization and period overrides.
- Loan payment/amortization.
- Asset valuation aggregation.
- Net worth.
- Cash-flow forecast.

Persist monetary values as integer VND. Avoid binary floating-point accumulation for currency. Rates may use decimal precision, with rounding documented per loan contract. Never infer contract terms.

## 6. Offline and sync design

Map current localStorage keys and pending-operation behavior before changing storage. Recommended future persistence:
- IndexedDB for normalized records and operation queue.
- localStorage only for small preferences/configuration under current token-storage policy.
- Service worker must never cache API responses or secrets.

Proposed internal operation envelope (not an existing API payload):

~~~json
{
  "operationId": "unique-client-operation-id",
  "entityType": "transaction",
  "entityId": "stable-id",
  "operation": "create|update|delete",
  "baseRevision": "optional-server-revision",
  "createdAt": "ISO-8601",
  "payload": {}
}
~~~

Do not send this envelope to the current API until an explicit compatible endpoint exists.

Rules: unique idempotency key; server acknowledgement before queue removal; base revision for updates; durable delete/tombstone until acknowledgement; conflict UI shows local and remote values when merge is unsafe.

## 7. AI architecture

~~~text
UI -> assistant use case -> allowlisted financial tools
                         -> deterministic domain engine
                         -> minimal structured context
                         -> server-side AI provider adapter
                         -> grounded explanation + provenance
~~~

The model is not the source of truth. Tool output is. Keep provider credentials in Apps Script Script Properties.

## 8. Security boundaries

- Keep authenticated POST and current token validation.
- Keep HTTPS endpoint validation.
- Do not use public CORS proxies.
- Do not log request bodies, tokens, notes, personal names or loan details.
- Sanitize text before writing to Sheets.
- Expose only minimum fields required to AI tools.
- Public GitHub Pages content is public; never put private family data there.

## 9. Android boundary

Only APK artifact is available here. Do not claim a native refactor or use decompilation as a substitute for source. Preserve APK 2.3.0 API compatibility. Request source repository, application ID, build instructions and signing ownership before changing native code. If Android is a WebView wrapper, confirm from source first.

## 10. As implemented (3.0)

~~~text
docs/src/domain/      pure engine (shared with Apps Script via generated apps-script/Domain.gs)
docs/src/sync/        engine.js — merge, decisions, operation view, status model, backup/CSV
docs/src/data/        local-store.js — legacy key inventory, additive schema marker
docs/src/features/    ext-store.js (collections sync), finance-views.js (3.0 views)
docs/app.js, dashboard.js   legacy UI, now delegating calculations/sync rules to the modules above
apps-script/          Code.gs (router), Domain.gs (generated), TransactionService, BudgetService,
                      LoanReadService, Extensions, Migrations, Assistant; order in files.json
~~~

Still classic `<script>` files with static hosting (no build step for the PWA). The only build step is `npm run build:apps-script`, which concatenates the domain modules into `Domain.gs`; `tests/contract.test.cjs` fails if the file is stale.

## 11. Presentation layer (professional UI)

~~~text
docs/styles/      tokens.css → base.css → layout.css → components.css → pages.css (only stylesheets)
docs/src/ui/      format.js (MoneyAmount formatting, privacy mask) · icons.js (line icons)
                  components.js (catalog components → escaped HTML strings) · charts.js (bar, donut + tables)
                  overlay.js (Modal/BottomSheet focus management) · shell.js (routes, active nav, icons)
~~~

Components never read state, call the API or compute financial values. View code in app.js, dashboard.js
and finance-views.js gathers values from FFDomain and the existing state, then composes components.
Hash routes map to the existing `nav(view)`; `dashboard` remains an alias for `reports`.
