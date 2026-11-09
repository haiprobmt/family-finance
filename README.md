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
2. In the bound Apps Script project replace `Code.gs` with `apps-script/Code.gs`.
   Keep existing `FAMILY_ACCESS_TOKEN` and `DEEPSEEK_API_KEY` Script Properties.
   Never put either value in this repository, an issue, or a URL.
3. Deploy → Manage deployments → Edit → New version → Deploy.
   Execute as yourself; access **Anyone**. All financial API actions still require the family token.
   The API remains compatible with Android APK 2.3.0.
4. Open the Pages app, enter the same `/exec` URL and token (at least 24 characters).
   The token goes only to your configured Google Apps Script over HTTPS, in the POST body.
5. By default the connection is kept only for this browser session. Enable
   **Ghi nhớ mã kết nối trên thiết bị riêng này** only on your own phone.

APK local drafts and settings do not automatically transfer into the browser.
Once synced, transactions and budgets are shared through the same spreadsheet.

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

Serve `docs/` over HTTP on localhost. Run `node tests/web.cjs` for privacy/transport checks.
Live two-phone sync and installation must be verified against your own Apps Script deployment.
