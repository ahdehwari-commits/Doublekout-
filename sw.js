const CACHE='double-kout-0.8.36';
const ASSETS=['./','./index.html','./manifest.webmanifest','./IMG_3647.png','./kuwaiti-six-player-ui.js','./supabase-multiplayer.js','./lan-multiplayer.js','./three-d-scene.js','./engines/standard-hokm/engine.js','./engines/kuwaiti-six-player/engine.js','./engines/double-kout-sequence.js','./engines/double-kout-game.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;})));});
