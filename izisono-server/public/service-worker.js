const CACHE='izisono-v23-shell';
const SHELL=['/','/index.html','/styles.css','/script.js','/manifest.webmanifest','/assets/izisono-logo.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>{}))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  // Retire previous Izisono shell versions so installed PWAs use the latest assets.
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('izisono-v')&&key!==CACHE).map(key=>caches.delete(key)));
  const cache=await caches.open(CACHE);
  // Keep only the versioned offline shell; never retain dynamic or user-specific responses.
  for(const request of await cache.keys()){
    const url=new URL(request.url);
    if(!SHELL.includes(url.pathname)||url.search)await cache.delete(request);
  }
  await self.clients.claim();
})())});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // Auth, payments and user data must always reach the server, never Cache Storage.
  if(url.origin!==self.location.origin||!SHELL.includes(url.pathname)||url.search||event.request.headers.has('Authorization'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone()).catch(()=>{});
      return response;
    }catch{
      return await cache.match(event.request)||Response.error();
    }
  })());
});
