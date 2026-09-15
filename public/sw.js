const CACHE='market-intel-v4';
const APP_SHELL=['/','/manifest.webmanifest','/icon.svg'];
const isStatic=(url)=>url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.css')||url.pathname.endsWith('.js')||url.pathname.endsWith('.svg')||url.pathname.endsWith('.png')||url.pathname.endsWith('.webp')||url.pathname.endsWith('.ico')||url.pathname==='/manifest.webmanifest';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(isStatic(url)){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response})));
  return;
 }
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response}).catch(()=>caches.match(request).then(cached=>cached||caches.match('/'))));
 }
});
