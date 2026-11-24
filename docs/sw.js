'use strict';
const CACHE='family-finance-pages-v3';
// Explicit allowlist of public static files (kept equal to index.html references by tests/web.cjs).
const FILES=['./','index.html','icon-512.png','be-vietnam-500.ttf','be-vietnam-600.ttf','manifest.webmanifest','icon-192.png','favicon.svg','styles.css','be-vietnam-400.ttf','redesign.css','dashboard.css','soft-theme.css','features.css','src/domain/money.js','src/domain/budget.js','src/domain/cashflow.js','src/domain/loan.js','src/domain/net-worth.js','src/domain/recurring.js','src/domain/forecast.js','src/domain/insights.js','src/sync/engine.js','src/data/local-store.js','src/features/ext-store.js','web-bridge.js','loans-data.js','dashboard.js','app.js','src/features/finance-views.js','ui-icons.js','pwa.js'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...urls])))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('family-finance-pages-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!urls.has(event.request.url))return;
 // Never cache Google Sheets responses or credentials.
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
