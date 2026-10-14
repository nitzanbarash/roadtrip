// the app shell works offline once it was opened; the map parts are stored by the page itself (IndexedDB)
var V='rt-ab20d0f622', SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(V).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k!==V && k.indexOf('rt-')===0; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
function cacheFirst(e){ return caches.match(e.request, {ignoreSearch:true}).then(function(r){ return r || fetch(e.request).then(function(res){ if(res && res.ok){ var c=res.clone(); caches.open(V).then(function(x){ x.put(e.request, c); }); } return res; }); }); }
self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET') return;
  var u=new URL(e.request.url);
  if(u.origin===location.origin){ if(/\/map\//.test(u.pathname)) return; e.respondWith(cacheFirst(e)); return; }
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) e.respondWith(cacheFirst(e).catch(function(){ return new Response('', {status:504}); }));
});
