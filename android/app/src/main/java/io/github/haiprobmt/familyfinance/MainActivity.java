package io.github.haiprobmt.familyfinance;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Family Finance Android app: a full-screen WebView around the published web app
 * (https://haiprobmt.github.io/family-finance/). All features, data handling and sync live in
 * the web app; this wrapper only adds Android integration:
 *  - edge-to-edge layout that keeps content clear of the status/navigation bars and keyboard;
 *  - system Back walks the app's own history (hash routes), then exits;
 *  - JavaScript confirm/alert dialogs (used before deletes and resets);
 *  - saving JSON backups / CSV exports to Downloads;
 *  - a "familyresume" event on resume so pending changes sync when the app comes back.
 * Links outside the app open in the default browser. No data is stored by this wrapper.
 */
public class MainActivity extends Activity {
    // The web app this wrapper opens: GitHub Pages by default, or the family's own server when built
    // with FF_START_URL (see app/build.gradle). Only this origin and path count as "the app".
    static final String START_URL = BuildConfig.START_URL;
    static final Uri START = Uri.parse(START_URL);
    static final String APP_HOST = START.getHost();
    static final int APP_PORT = START.getPort();
    static final String APP_PATH = START.getPath() == null || START.getPath().isEmpty() ? "/" : START.getPath();
    static final String VERSION = BuildConfig.VERSION_NAME;

    private WebView web;
    private volatile String currentUrl = "";

    private static final String OFFLINE_HTML =
        "<!doctype html><html lang='vi'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#F5F6F8;color:#172033}"
        + "main{max-width:320px;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#667085;font-size:14px;line-height:20px}"
        + "button{margin-top:16px;min-height:44px;padding:0 20px;border:0;border-radius:8px;background:#EA8A00;color:#1B1300;font-weight:600;font-size:15px}</style></head>"
        + "<body><main><h1>Chưa có kết nối mạng</h1><p>Lần đầu mở ứng dụng cần Internet để tải giao diện. Sau đó ứng dụng vẫn mở và ghi chép được khi ngoại tuyến.</p>"
        + "<button onclick=\"location.href='" + START_URL + "'\">Thử lại</button></main></body></html>";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setUpSystemBars(root);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // localStorage: offline drafts and settings
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " FamilyFinanceAndroid/" + VERSION);

        web.setWebChromeClient(new WebChromeClient());   // enables window.confirm / alert dialogs
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isAppUrl(url)) return false;
                openExternal(url);
                return true;
            }
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { currentUrl = url == null ? "" : url; }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Only the first-ever launch without network reaches this: afterwards the web app's
                // service worker serves the cached app offline.
                if (request.isForMainFrame()) view.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "utf-8", null);
            }
        });
        web.addJavascriptInterface(new Bridge(), "FFAndroid");
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> handleDownload(url, mimeType));

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (savedInstanceState == null || web.getUrl() == null) web.loadUrl(START_URL);
    }

    private void setUpSystemBars(View root) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Draw edge-to-edge on every Android 11+ device (Android 15 enforces it) and pad the content
            // by the system bars, display cutout and keyboard so nothing is hidden behind them.
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        }
    }

    private boolean isAppUrl(Uri url) {
        if (url == null || !"https".equals(url.getScheme()) || !APP_HOST.equals(url.getHost()) || url.getPort() != APP_PORT) return false;
        String path = url.getPath() == null || url.getPath().isEmpty() ? "/" : url.getPath();
        return path.startsWith(APP_PATH) || (APP_PATH.endsWith("/") && path.equals(APP_PATH.substring(0, APP_PATH.length() - 1)));
    }

    private void openExternal(Uri url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, "Không mở được liên kết", Toast.LENGTH_SHORT).show(); }
    }

    /** Backups/exports are created as blob: URLs by the web app; read them in the page and save natively. */
    private void handleDownload(String url, String mimeType) {
        String mime = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String name = mime.contains("json") ? "family-finance-backup-" + date + ".json"
            : mime.contains("csv") ? "family-finance-export-" + date + ".csv"
            : "family-finance-" + date;
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            String js = "(function(){fetch(" + jsString(url) + ").then(function(r){return r.blob()}).then(function(b){return new Promise(function(res,rej){var f=new FileReader();f.onload=function(){res(f.result)};f.onerror=rej;f.readAsDataURL(b)})})"
                + ".then(function(d){FFAndroid.saveFile(d.slice(d.indexOf(',')+1)," + jsString(name) + "," + jsString(mime) + ")})"
                + ".catch(function(e){FFAndroid.saveFailed(String(e))})})();";
            web.evaluateJavascript(js, null);
        } else {
            openExternal(Uri.parse(url));
        }
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "") + "'";
    }

    /** Called from the page (only while the app's own origin is loaded). */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            if (!isAppUrl(Uri.parse(currentUrl))) return;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, v, null, null);
                    where = "Đã lưu vào Tải xuống: " + name;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                    where = "Đã lưu: " + f.getAbsolutePath();
                }
                final String msg = where;
                runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                saveFailed(e.getMessage());
            }
        }

        @JavascriptInterface
        public void saveFailed(String reason) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Không lưu được tệp", Toast.LENGTH_LONG).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();   // hash routes (#/giao-dich …) are history entries
        else super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            // The web app retries pending sync on this event (same contract as APK 2.3.0's bridge).
            web.evaluateJavascript("window.dispatchEvent(new Event('familyresume'))", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
