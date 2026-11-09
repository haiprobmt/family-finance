'use strict';
const CACHE='family-finance-pages-v1';
const FILES=['./','index.html','styles.css','redesign.css','soft-theme.css','dashboard.css','app.js','dashboard.js','web-bridge.js','loans-data.js','ui-icons.js','pwa.js','favicon.svg','icon-192.png','icon-512.png','manifest.webmanifest','be-vietnam-400.ttf','be-vietnam-500.ttf','be-vietnam-600.ttf'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...urls])))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('family-finance-pages-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!urls.has(event.request.url))return;
 // Never cache Google Sheets responses or credentials.
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
