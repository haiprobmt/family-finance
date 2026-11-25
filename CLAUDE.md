# Working on this repository

- **Merging:** when a change is done, open a pull request into `main` and merge it yourself once
  the CI checks (`unit-contract`, `e2e`) pass. The owner has said not to ask first. Never merge
  with failing checks; fix them first.
- **Deploying to the VM** (after merging): `ssh david-nguyen 'sudo /opt/family-finance/app/deploy/install.sh'`
  pulls `main`, checks Google Sheets access and restarts the service. See README → "Run on your own server".
- **Tests:** `npm test` (unit/contract) and `npm run e2e` (Playwright). After changing
  `docs/src/domain/*` or `apps-script/*.gs`, run `npm run build:apps-script` (the contract test fails on a stale bundle).
- **Privacy:** synthetic data only in tests and fixtures. Never commit spreadsheet ids, tokens, keys,
  the Tailscale address or the APK signing key.
