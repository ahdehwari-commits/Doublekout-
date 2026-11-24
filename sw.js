const CACHE='double-kout-9.87-avatar-gallery-fallback';
const ASSETS=['./','./index.html','./web-prototype.html','./manifest.webmanifest','./IMG_3647.png','./assets/card-back-black-gold.svg','./assets/card-back-black-gold.png','./kuwaiti-six-player-ui.js','./supabase-multiplayer.js','./anonymous-learning.js','./central-progress.js','./central-store.js','./central-payments-admin.js','./lan-multiplayer.js','./three-d-scene.js','./engines/standard-hokm/engine.js','./engines/kuwaiti-six-player/engine.js','./engines/double-kout-game.js','./engines/double-kout-9.80-challenge-contract-compact-legal-cards-trick-label'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 // Never cache cross-origin data/API calls such as Supabase private hands.
 const requestUrl=new URL(event.request.url);
 if(requestUrl.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  // Network-first while online; on failure, resolve each cached fallback in order.
  event.respondWith(fetch(event.request).then(response=>{
   if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
   return response;
  }).catch(()=>caches.match(event.request).then(cached=>{
   if(cached)return cached;
   return caches.match('./web-prototype.html').then(page=>{
    if(page)return page;
    return caches.match('./index.html');
   });
  }).then(fallback=>fallback||new Response('برای اجرای بازی، یک بار در حالت آنلاین سایت را باز کنید.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
  return;
 }
 // Ignore query-string cache-busters for same-origin static assets.
 event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request).then(response=>{
  if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 })));
});
