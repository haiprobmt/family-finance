# Migration and Rollback Plan

## 1. Objective

Refactor while preserving household records, client settings and API behavior. Production Google Spreadsheet is authoritative.

## 2. Environments

- Local: synthetic data only.
- Test spreadsheet: owner-created copy of production with controlled access.
- Production: existing spreadsheet and Apps Script Web App.
- Public GitHub repository: source and synthetic fixtures only.

Never connect coding agents or automated tests to the live family spreadsheet.

## 3. Pre-migration checklist

- [ ] Finish pending sync on every device.
- [ ] Confirm no pending operations or unresolved conflicts.
- [ ] Export/copy the entire spreadsheet, including hidden sheets and formulas.
- [ ] Save current Apps Script source and deployment/version details.
- [ ] Record current APK version and PWA release commit.
- [ ] Record sheet names, headers, row counts and formulas as metadata only.
- [ ] Confirm FAMILY_ACCESS_TOKEN and DEEPSEEK_API_KEY remain in Script Properties.
- [ ] Confirm restore operator and restore procedure.
- [ ] Verify backup privately using representative totals.

## 4. Migration rules

1. Additive and versioned.
2. Dry-run supported.
3. Repeatable without duplicate sheets/columns/records.
4. Validate headers before writes.
5. Never delete, rename, reorder or reinterpret legacy columns.
6. Never copy private loan rows into public source or fixtures.
7. Do not migrate unsynced local drafts as part of server schema migration.
8. Log migration ID, timestamp, counts and pass/fail only.

## 5. Single-release rollout sequence

One production release does not mean skipping isolated validation:

1. Build/refactor locally with synthetic fixtures.
2. Run unit and contract tests.
3. Deploy to copied test spreadsheet and test Apps Script.
4. Test PWA on two devices against test deployment.
5. Test existing APK 2.3.0 against test deployment.
6. Run migration dry-run and validate row counts/totals privately.
7. Freeze production writes briefly; finish pending sync first.
8. Create fresh production backup.
9. Deploy backward-compatible Apps Script version.
10. Apply additive migrations.
11. Publish PWA release.
12. Reopen app on both devices and run smoke tests.
13. Resume normal entry only after verification.
14. Retain backup and previous deployment for rollback.

## 6. Rollback triggers

Rollback if APK cannot authenticate/read snapshot; transaction operations diverge; row counts or reconciliation totals change unexpectedly; duplicates/missing transactions appear; budget conflict protection fails; loan totals change without approval; sync queue drops unacknowledged operations; or private data/secrets are exposed.

## 7. Rollback procedure

1. Pause writes; tell users not to clear local app data.
2. Preserve/export pending local operations where possible.
3. Restore previous PWA assets.
4. Restore previous Apps Script deployment/version.
5. If schema migration altered data, restore spreadsheet backup; reconcile writes after backup from preserved operations.
6. Verify transaction count, budget revision, loan summary and sync state.
7. Re-enable writes only after old release passes smoke tests.

Do not automatically replay uncertain queue items against restored data until operation IDs and server state are reconciled.

## 8. Private reconciliation evidence

Record privately: transaction row count; unique ID count; income/expense totals by month; budget keys/revision; loan rows by bank/month and missing schedule count; pending operation count per device; API smoke test results.

Never commit amounts, account names, notes or detailed loan schedules to GitHub.
