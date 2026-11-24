// RONNY app service worker (patch 137).
// - App files (HTML, JS, CSS, icons, patch notes): network first, so every visit online gets the latest
//   version; the cached copy is used only when offline.
// - Map and icon libraries from unpkg: cache first (versioned URLs never change).
// - Map tiles, routing, search and elevation services: always network, never cached here.
const VERSION='ronny-app-137';
const SHELL=[
 './','index.html','manifest.webmanifest','scripts/app.js','scripts/install-app.js',
 'styles/app.css','styles/ui-refresh.css','styles/schedule-drag.css','styles/planner-polish.css','styles/phone.css',
 'assets/favicon.png','assets/glencairn_icon.svg',
 'assets/app/icon-192.png','assets/app/icon-512.png','assets/app/icon-maskable-512.png','assets/app/apple-touch-icon.png'
];
const LIBS=[
 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
 'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js'
];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await cache.addAll(SHELL);
  // Libraries are best effort: the app still installs if the CDN is briefly unreachable.
  await Promise.all(LIBS.map(url=>cache.add(new Request(url,{mode:'cors'})).catch(()=>{})));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key!==VERSION)await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin===self.location.origin){
  event.respondWith((async()=>{
   const cache=await caches.open(VERSION);
   try{
    const fresh=await fetch(request);
    if(fresh.ok&&fresh.type==='basic')cache.put(request,fresh.clone());
    return fresh;
   }catch(error){
    const cached=await cache.match(request,{ignoreSearch:request.mode==='navigate'});
    if(cached)return cached;
    if(request.mode==='navigate')return (await cache.match('index.html'))||Response.error();
    return Response.error();
   }
  })());
  return;
 }
 if(url.hostname==='unpkg.com'){
  event.respondWith((async()=>{
   const cache=await caches.open(VERSION);
   const cached=await cache.match(request);if(cached)return cached;
   const fresh=await fetch(request);if(fresh.ok)cache.put(request,fresh.clone());return fresh;
  })());
 }
 // Everything else (map tiles, routing, geocoding) goes straight to the network.
});
