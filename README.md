# Chi Tiêu Gia Đình — browser / installable PWA

Public application code only. No family photos, transactions, loan records, keys,
tokens, private spreadsheet URLs, APK binaries or signing keys are included.

## Run on your own server (no Apps Script)

`server/` is a small Node.js server (no dependencies) that serves the web app **and** the API from
one HTTPS address on your VM. Data stays in the same Google Sheet: the server reads and writes it
through the Google Sheets API, running the same backend code as before (`apps-script/` is now
plain JavaScript executed by the server; nothing is deployed to Apps Script).

One-time setup:

1. **Google service account** (lets the server open the spreadsheet):
   Google Cloud console → create/select a project → enable **Google Sheets API** →
   IAM → Service accounts → Create → Keys → Add key → JSON. Open the spreadsheet → Share →
   add the service account's e-mail (`…@….iam.gserviceaccount.com`) as **Editor**.
2. **Install on the VM** (Debian/Ubuntu with systemd):
   ```bash
   ssh david-nguyen 'curl -fsSL https://raw.githubusercontent.com/haiprobmt/family-finance/main/deploy/install.sh | sudo bash'
   ```
   Then on the VM put the key at `/etc/family-finance/google-credentials.json` and fill in
   `/etc/family-finance/env` (`SPREADSHEET_ID`, `FAMILY_ACCESS_TOKEN` — reuse the old one —
   and optionally `DEEPSEEK_API_KEY`), and run `sudo /opt/family-finance/app/deploy/install.sh`
   again. It checks Sheets access and starts the `family-finance` service on 127.0.0.1:8080.
3. **HTTPS**: install Caddy and use `deploy/Caddyfile.example` with a DNS name for the VM.
4. On each phone open `https://<your-domain>/`, enter the family token (the address is filled in),
   and install it from the browser menu (Add to Home screen).

Updates: `ssh david-nguyen 'sudo /opt/family-finance/app/deploy/install.sh'` pulls `main`, checks
Sheets access and restarts. Logs: `journalctl -u family-finance -f`. Backend functions such as
`migrationsDryRun` run with
`sudo -u family-finance bash -c 'set -a; . /etc/family-finance/env; node /opt/family-finance/app/server/index.js --run migrationsDryRun'`.

The Apps Script instructions below remain only for the old setup.

## Publish

In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**,
then **main**, **/docs**, **Save**. The web app will be:

https://haiprobmt.github.io/family-finance/

The published folder is `docs/`; `apps-script/` is backend source, not a hosted server.

## Connect your existing spreadsheet

1. Back up your existing spreadsheet and Apps Script. Finish pending sync on both phones.
2. In the bound Apps Script project, **replace the whole content of `Code.gs` with
   [`apps-script/dist/Code.gs`](apps-script/dist/Code.gs)**. It is one generated file containing
   the entire backend, so no extra files are needed. (Developers can instead `clasp push` the
   separate files in `apps-script/`; never use both.) Ideally try it on a copy of the spreadsheet first.
   Keep existing `FAMILY_ACCESS_TOKEN` and `DEEPSEEK_API_KEY` Script Properties.
   Never put either value in this repository, an issue, or a URL.
   New sheets for 3.0 features (assets, recurring rules, debts) are created automatically on the
   app's next sync; they are only ever added, existing sheets are never changed.
   (`migrationsDryRun` in the editor shows what would be added.)
3. Deploy → Manage deployments → **Edit (pencil) on the existing deployment** → Version: **New version** → Deploy.
   Editing the existing deployment keeps the same `/exec` URL, so the APK and both phones keep syncing
   without any change; creating a *new* deployment would change the URL.
   Execute as yourself; access **Anyone**. All financial API actions still require the family token.
   The API remains compatible with Android APK 2.3.0.
4. Open the Pages app, enter the same `/exec` URL and token (at least 24 characters).
   The token goes only to your configured Google Apps Script over HTTPS, in the POST body.
5. By default the connection is kept only for this browser session. Enable
   **Ghi nhớ mã kết nối trên thiết bị riêng này** only on your own phone.

APK local drafts and settings do not automatically transfer into the browser.
Once synced, transactions and budgets are shared through the same spreadsheet.

## Automatic Apps Script updates

After a one-time setup, every push to `main` that changes the backend is deployed by the
**Deploy Apps Script** GitHub workflow (`.github/workflows/deploy-apps-script.yml`): it runs the
tests, uploads `apps-script/dist/Code.gs`, moves your **existing** deployment to the new version
(same `/exec` URL, so the APK and phones need nothing) and checks that the web app answers with the
new build. New sheets are then added by the backend on the next sync. The web app and the Android
app already update themselves from GitHub Pages.

One-time setup (about 10 minutes, on a computer):

1. Turn on **Google Apps Script API** at <https://script.google.com/home/usersettings>
   (signed in with the Google account that owns the spreadsheet).
2. Install [Node.js](https://nodejs.org) (LTS). In a terminal (PowerShell on Windows) run
   `npx @google/clasp@3.4.1 login` and sign in with that same account. This creates the file
   `.clasprc.json` in your user folder (`C:\Users\<you>\.clasprc.json` on Windows).
3. Collect two IDs in the Apps Script editor:
   - **Script ID**: ⚙ Project Settings → IDs → Script ID.
   - **Deployment ID**: Deploy → Manage deployments → the active deployment → Deployment ID
     (the part of your `/exec` URL between `/s/` and `/exec`).
4. On GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**,
   add three secrets:
   - `CLASPRC_JSON`: the whole content of `.clasprc.json`
   - `APPS_SCRIPT_ID`: the Script ID
   - `APPS_SCRIPT_DEPLOYMENT_ID`: the Deployment ID
5. **Actions → Deploy Apps Script → Run workflow** for the first deploy. If the last step says
   the web app does not answer, open the Apps Script editor once, choose the function `setup`,
   press **Run** and **Allow** the permissions, then run the workflow again.

`CLASPRC_JSON` lets its holder manage the Apps Script projects of that Google account: keep it
only in GitHub Secrets (pull requests and forks never receive it) and delete your local
`.clasprc.json` afterwards if you like. To revoke it, remove the clasp app at
<https://myaccount.google.com/permissions>. The workflow replaces every file in the Apps Script
project with `Code.gs` + `appsscript.json`; Script Properties (token, API key) are not touched.
Until the secrets exist the workflow only prints a warning and changes nothing.

## Family Finance 3.0 features

- **Dashboard 2.0:** actual cash flow (tap a figure to see its source transactions), net worth,
  budget alerts and a clearly labelled 3-month forecast.
- **Tài sản & nợ:** asset register with valuation history, net worth at a chosen date
  (shown only when assets and loan balances are complete), loan interest vs principal, and a
  repayment simulator that lists its assumptions. **Thêm nợ** records debts outside the Loans
  sheet (relatives, credit cards, instalments) in a `Debts` sheet; they count toward total debt.
  The `Debts` sheet is added automatically on the first sync after the backend update.
- **Kế hoạch & lịch:** recurring income/expenses, 60-day calendar, reminders. A planned item
  becomes a transaction only when you confirm it (safe to confirm twice or on two phones).
- **Budget tracking:** 80%/100% thresholds and month-over-month change; planned items shown separately.
- **Privacy:** ◉ button hides all amounts. Settings → backup (JSON) and CSV export by date range.
- **Assistant:** quick buttons use deterministic calculations from your sheet and show the
  source, period and missing data; the AI only explains them and cannot change records.

- **Professional UI:** desktop sidebar, tablet icon rail, phone bottom navigation; linkable pages
  (`#/giao-dich`, `#/ngan-sach`, …) with browser back; WCAG 2.2 AA checked with axe-core.

Planning documents, audit and release status: `implementation/` (start with `RELEASE_REPORT.md`;
UI work: `UI_RELEASE_NOTES.md`).

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
