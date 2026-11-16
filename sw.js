const CACHE='double-kout-0.8.61-user-auth';;
const ASSETS=['./','./index.html','./manifest.webmanifest','./IMG_3647.png','./assets/card-back-black-gold.svg','./assets/card-back-black-gold.png','./kuwaiti-six-player-ui.js','./supabase-multiplayer.js','./anonymous-learning.js','./lan-multiplayer.js','./three-d-scene.js','./engines/standard-hokm/engine.js','./engines/kuwaiti-six-player/engine.js','./engines/double-kout-sequence.js','./engines/double-kout-game.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 // Never cache cross-origin data/API calls such as Supabase private hands.
 // A stale cached REST response prevents played cards from disappearing on iOS.
 const requestUrl=new URL(event.request.url);
 if(requestUrl.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  // Prefer the current deployed page on every online launch; use cache only offline.
  event.respondWith(fetch(event.request).then(response=>{
   if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
   return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
  return;
 }
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
  if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 })));
});
