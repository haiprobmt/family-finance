# Chi Tiêu Gia Đình — browser / installable PWA

Public application code only. No family photos, transactions, loan records, keys,
tokens, private spreadsheet URLs, APK binaries or signing keys are included.

## Publish

In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**,
then **main**, **/docs**, **Save**. The web app will be:

https://haiprobmt.github.io/family-finance/

The published folder is `docs/`; `apps-script/` is backend source, not a hosted server.

## Connect your existing spreadsheet

1. Back up your existing spreadsheet and Apps Script. Finish pending sync on both phones.
2. In the bound Apps Script project add **every** file listed in `apps-script/files.json`
   (`Domain.gs`, `Code.gs`, `TransactionService.gs`, `BudgetService.gs`, `LoanReadService.gs`,
   `Extensions.gs`, `Migrations.gs`, `Assistant.gs`), replacing the old `Code.gs`, or run
   `clasp push` from `apps-script/`. Do this on a **copy** of the spreadsheet first.
   Keep existing `FAMILY_ACCESS_TOKEN` and `DEEPSEEK_API_KEY` Script Properties.
   Never put either value in this repository, an issue, or a URL.
   Optional 3.0 features (assets, recurring rules): in the editor run `migrationsDryRun`,
   review, then `migrationsApply`. It only adds new sheets; existing sheets are never changed.
3. Deploy → Manage deployments → Edit → New version → Deploy.
   Execute as yourself; access **Anyone**. All financial API actions still require the family token.
   The API remains compatible with Android APK 2.3.0.
4. Open the Pages app, enter the same `/exec` URL and token (at least 24 characters).
   The token goes only to your configured Google Apps Script over HTTPS, in the POST body.
5. By default the connection is kept only for this browser session. Enable
   **Ghi nhớ mã kết nối trên thiết bị riêng này** only on your own phone.

APK local drafts and settings do not automatically transfer into the browser.
Once synced, transactions and budgets are shared through the same spreadsheet.

## Family Finance 3.0 features

- **Dashboard 2.0:** actual cash flow (tap a figure to see its source transactions), net worth,
  budget alerts and a clearly labelled 3-month forecast.
- **Tài sản & nợ:** asset register with valuation history, net worth at a chosen date
  (shown only when assets and loan balances are complete), loan interest vs principal, and a
  repayment simulator that lists its assumptions.
- **Kế hoạch & lịch:** recurring income/expenses, 60-day calendar, reminders. A planned item
  becomes a transaction only when you confirm it (safe to confirm twice or on two phones).
- **Budget tracking:** 80%/100% thresholds and month-over-month change; planned items shown separately.
- **Privacy:** ◉ button hides all amounts. Settings → backup (JSON) and CSV export by date range.
- **Assistant:** quick buttons use deterministic calculations from your sheet and show the
  source, period and missing data; the AI only explains them and cannot change records.

Planning documents, audit and release status: `implementation/` (start with `RELEASE_REPORT.md`).

## Install

- Android Chrome: menu → Install app / Add to Home screen.
- iPhone Safari: Share → Add to Home Screen.
- Desktop Chrome/Edge: the browser install button.

This is an installable **web app**, not an APK. It opens independently of ChatGPT.
App assets and locally saved transactions work offline; sync and assistant require internet.
New deployments may require closing every open app tab/window and reopening to activate.

## Private loans

The web bundle deliberately has **no loan records**. In your private spreadsheet, create:

- `Loans`: headers `Bank | Month | Principal | Rate | Interest | Days`.
  Month must be text `YYYY-MM`, rate decimal (`0.08` = 8%).
  Bank is `Shinhan` or `Techcombank`. Shinhan Interest is the original column G only.
  Techcombank is excluded from November 2026 onward.
- `FinanceSettings`: headers `Key | Value`; add `ExtraDebtMonthly` with your chosen
  supplementary monthly repayment amount. Without it the value is zero.

Import your private loan schedule there yourself; do not commit it to GitHub.
Until imported, missing loans are shown explicitly; the scheduled repayment is incomplete.
Actual transactions, budgets and savings do not depend on this import.

## Privacy and limitations

- GitHub Pages serves public static files; app access is not GitHub login protection.
- Financial data and optional remembered token are stored in this browser profile.
  Other apps on the same GitHub Pages origin share that origin: only host trusted code there.
- **Đăng xuất và xóa bản lưu trên máy** removes this app's local cache/configuration,
  not the records in Sheets. Do not log out with unsynced changes you need to keep.
- The service worker caches only the explicitly listed public app files, never API responses.
- Apps Script must allow cross-origin simple POST/redirect responses. If Google returns
  a login page or your organization blocks anonymous Web Apps, do not use a public CORS proxy;
  resolve the deployment/account restriction instead.
- DeepSeek key remains in Apps Script. The assistant's API usage may cost money.

## Local verification

Serve `docs/` over HTTP on localhost. All tests use synthetic data only:

```bash
npm test
```

runs the privacy/transport checks plus unit, legacy-parity, API-contract and backend tests.

```bash
npm run e2e
```

drives the real PWA in Chromium (two devices) against the real Apps Script files on an
in-memory Sheets emulation. It needs `playwright`.

After editing `docs/src/domain/`, regenerate the backend copy with `npm run build:apps-script`.
Live two-phone sync, APK 2.3.0 and installation must still be verified against your own
test Apps Script deployment.
