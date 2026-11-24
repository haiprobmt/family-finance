# Family Finance — Android app (3.0)

A small native wrapper (one Java activity, no third-party libraries) around the published web app
<https://haiprobmt.github.io/family-finance/>. All features, data handling and sync live in the
web app, so **web updates reach the Android app without reinstalling**. The wrapper adds:

- full-screen, edge-to-edge layout that keeps content clear of the status bar, navigation bar and keyboard;
- system Back walks the app's own pages (hash routes), then exits;
- JavaScript confirm/alert dialogs (used before deletes/resets);
- JSON backups and CSV exports saved to *Downloads*;
- a `familyresume` event on resume so pending changes sync (same contract as APK 2.3.0's bridge);
- links outside the app open in the browser; an offline notice if the very first launch has no network.

| | |
|---|---|
| Package | `io.github.haiprobmt.familyfinance` (new app; installs alongside APK 2.3.0) |
| Version | 3.0.0 (versionCode 1) |
| SDK | min 26 (Android 8.0), target/compile 35 (Android 15) |
| Permissions | `INTERNET` only |

Data lives in the WebView's own storage, so on first launch enter the Apps Script `/exec` URL and family
token in **Cài đặt**. Unsynced drafts of other installs (APK 2.3.0, browser) do not move over — sync them first.

## Build

Requirements: JDK 17+, Gradle 8.9+ (or Android Studio), Android SDK platform 35 + build-tools 35.

```bash
cd android
echo "sdk.dir=/path/to/android-sdk" > local.properties
FF_KEYSTORE=/path/family-finance-release.jks FF_KEY_ALIAS=familyfinance \
FF_KEYSTORE_PASSWORD=... FF_KEY_PASSWORD=... gradle assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Without the `FF_*` variables the release APK is built unsigned. **Never commit the keystore or its
password** (`*.jks`, `*.keystore` are git-ignored). Future updates of this app must be signed with the
same key, and bump `versionCode` in `app/build.gradle`.

Release certificate SHA-256: `B6:52:41:0F:A7:B7:0F:0C:8F:E4:5F:D5:21:3A:21:E9:06:6C:27:04:97:2F:05:7D:E9:A2:AD:52:5F:74:1C:18`
