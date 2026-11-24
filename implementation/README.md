# Family Finance 3.0 — Implementation Pack

Status: planning baseline; documentation only.
Repository: haiprobmt/family-finance.

## Approved decisions

- Scope: comprehensive upgrade.
- Platforms: PWA and Android target.
- Android artifact available: APK 2.3.0 only; no Android source is present in this repository.
- Strategy: refactor, not a rewrite of the financial data store.
- Release: one coordinated production release after all gates pass.
- Data store: keep Google Sheets.
- Backend: keep Google Apps Script.
- AI: retain current provider integration initially; isolate behind an adapter.
- Data safety: preserve current sheets, API actions, local drafts and loan privacy.

## Read this pack

1. PRD.md — product requirements.
2. ARCHITECTURE.md — architecture and refactoring boundaries.
3. DATA_MODEL.md — schemas and financial invariants.
4. API_COMPATIBILITY.md — observed API contract and compatibility gates.
5. MIGRATION_PLAN.md — safe migration and rollback.
6. IMPLEMENTATION_PLAN.md — workstreams, dependencies and milestones.
7. TEST_PLAN.md — test matrix and release gates.
8. AGENT_GUIDE.md — coding-agent rules.

## Repository facts verified from main

- PWA is served from docs/ (GitHub Pages).
- PWA logic is currently in docs/app.js, docs/dashboard.js, docs/web-bridge.js and docs/loans-data.js.
- Apps Script backend source is apps-script/Code.gs.
- Automated test entry point is node tests/web.cjs.
- Existing sheets include Transactions and Budgets. Private loan data is read from Loans and FinanceSettings.
- Current API advertises apiVersion 3; PWA requests send nativeVersion=3 and webVersion=1.
- README states compatibility with Android APK 2.3.0.
- No Android source project or APK build pipeline is present.

## Scope of this documentation change

This pack does not modify application code, Apps Script deployments, Google Sheets, secrets, private loan records, APK files or GitHub Pages runtime assets.

## Non-negotiable safety rules

1. Never run migrations against the live family spreadsheet during development.
2. Never commit transactions, loan rows, tokens, API keys, private spreadsheet URLs, family photos, APKs or signing keys.
3. Preserve the current API contract until a separately versioned migration is designed and tested.
4. Add schema elements additively; do not rename, reorder, reinterpret or delete legacy columns.
5. Writes must be idempotent or protected against duplicate replay.
6. Single release means one coordinated production cutover after isolated validation, not direct commits to main or skipping tests.
7. If Android source remains unavailable, preserve APK 2.3.0 compatibility; do not claim the APK itself was refactored.
