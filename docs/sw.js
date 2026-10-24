// the app shell works offline once it was opened; the map parts are stored by the page itself (IndexedDB)
var V='rt-eb7e299bb7', SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(V).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k!==V && k.indexOf('rt-')===0; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
function netFirst(e){ return fetch(e.request).then(function(res){ if(res && res.ok){ var c=res.clone(); caches.open(V).then(function(x){ x.put(e.request, c); }); } return res; }, function(){ return caches.match(e.request, {ignoreSearch:true}); }); }
function cacheFirst(e){ return caches.match(e.request, {ignoreSearch:true}).then(function(r){ return r || fetch(e.request).then(function(res){ if(res && res.ok){ var c=res.clone(); caches.open(V).then(function(x){ x.put(e.request, c); }); } return res; }); }); }
// event pictures (Wikipedia, with CORS): kept across versions, so they show without signal too
function imgCache(e){ return caches.open('img-1').then(function(c){ return c.match(e.request).then(function(r){ return r || fetch(e.request).then(function(res){ if(res && res.ok) c.put(e.request, res.clone()); return res; }); }); }); }
self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET') return;
  var u=new URL(e.request.url);
  if(u.origin===location.origin){ if(/\/map\//.test(u.pathname)) return; if(/fuel\.json$/.test(u.pathname)){ e.respondWith(netFirst(e)); return; } e.respondWith(cacheFirst(e)); return; }
  if(u.host==='upload.wikimedia.org'){ e.respondWith(imgCache(e).catch(function(){ return new Response('', {status:504}); })); return; }
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) e.respondWith(cacheFirst(e).catch(function(){ return new Response('', {status:504}); }));
});
