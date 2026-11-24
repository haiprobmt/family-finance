// FROZEN COPY of docs/sw.js as deployed in the 3.0 UI release (cache v4). Used by tests/e2e/upgrade.e2e.cjs
// to prove phones still running this service worker recover after an update. Do not edit.
'use strict';
const CACHE='family-finance-pages-v4';
// Explicit allowlist of public static files (kept equal to index.html references by tests/web.cjs).
const FILES=['./','index.html','icon-512.png','manifest.webmanifest','icon-192.png','favicon.svg','styles/tokens.css','styles/base.css','styles/layout.css','styles/components.css','styles/pages.css','src/ui/format.js','src/ui/icons.js','src/ui/components.js','src/ui/charts.js','src/ui/overlay.js','src/ui/shell.js','src/domain/money.js','src/domain/budget.js','src/domain/cashflow.js','src/domain/loan.js','src/domain/net-worth.js','src/domain/recurring.js','src/domain/forecast.js','src/domain/insights.js','src/sync/engine.js','src/data/local-store.js','src/features/ext-store.js','web-bridge.js','loans-data.js','dashboard.js','app.js','src/features/finance-views.js','pwa.js'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...urls])))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('family-finance-pages-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 // Hash routes (#/giao-dich) stay on the request URL; match the allowlisted file without the fragment.
 const clean=new URL(event.request.url);clean.hash='';
 if(!urls.has(event.request.url)&&!urls.has(clean.href))return;
 // Never cache Google Sheets responses or credentials.
 event.respondWith(caches.match(clean.href).then(cached=>cached||fetch(event.request)));
});
