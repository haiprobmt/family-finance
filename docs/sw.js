'use strict';
// Offline support for the public static app files only. API calls (/api, script.google.com) are never
// cached or intercepted.
const CACHE='family-finance-pages-v10';
// Explicit allowlist of public static files (kept equal to index.html references by tests/web.cjs).
const FILES=['./','index.html','icon-512.png','manifest.webmanifest','icon-192.png','favicon.svg','styles/tokens.css','styles/base.css','styles/layout.css','styles/components.css','styles/pages.css','src/ui/format.js','src/ui/icons.js','src/ui/components.js','src/ui/charts.js','src/ui/overlay.js','src/ui/shell.js','src/domain/money.js','src/domain/budget.js','src/domain/cashflow.js','src/domain/loan.js','src/domain/net-worth.js','src/domain/recurring.js','src/domain/forecast.js','src/domain/insights.js','src/sync/engine.js','src/data/local-store.js','src/features/ext-store.js','web-bridge.js','loans-data.js','dashboard.js','app.js','src/features/finance-views.js','pwa.js'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
// Install with cache:'reload' so a copy from the browser's HTTP cache (GitHub Pages: 10 min) of the
// PREVIOUS release can never be stored next to new files. Activate immediately: this also repairs
// phones whose v3/v4 cache held a stale index.html pointing at stylesheets that no longer exist.
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...urls].map(u=>new Request(u,{cache:'reload'})))))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('family-finance-pages-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 // Hash routes (#/giao-dich) stay on the request URL; match the allowlisted file without the fragment.
 const clean=new URL(event.request.url);clean.hash='';
 if(!urls.has(event.request.url)&&!urls.has(clean.href))return;
 // Never cache Google Sheets responses or credentials.
 // Network first (revalidated, cheap 304s): page, styles and scripts always come from the same
 // release while online; the cache is the offline fallback.
 event.respondWith(fetch(clean.href,{cache:'no-cache',credentials:'same-origin'}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(clean.href,copy)));}
  return response;
 }).catch(()=>caches.match(clean.href).then(cached=>cached||Response.error())));
});
