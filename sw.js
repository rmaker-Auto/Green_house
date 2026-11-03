/* Green House Log — service worker (অফলাইনে অ্যাপ খোলার জন্য)
   অফলাইন-আগে: ক্যাশ থেকে সাথে সাথে খোলে, নেট থাকলে পেছনে নতুন ভার্সন এনে রাখে।
   কোনো ফাইল GitHub-এ না থাকলেও ক্যাশ ব্যর্থ হয় না। */
var CACHE = 'ghlog-v3';
var FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(FILES.map(function (u) {
        return fetch(u, { cache: 'reload' }).then(function (r) { if (r && r.ok) return c.put(u, r); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function tell(msg) {
  self.clients.matchAll().then(function (list) { list.forEach(function (c) { c.postMessage(msg); }); });
}
function sig(r) { return r ? (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '') : ''; }

function refresh(key, req, old) {
  return fetch(req).then(function (r) {
    if (r && r.ok && r.type !== 'opaque') {
      var copy = r.clone();
      return caches.open(CACHE).then(function (c) { return c.put(key, copy); }).then(function () {
        if (old && sig(old) && sig(r) && sig(old) !== sig(r)) tell({ t: 'updated' });
        return r;
      });
    }
    return r;
  }).catch(function () { return null; });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;               // Google Script / আবহাওয়ার কল কখনো ক্যাশ হবে না

  if (req.mode === 'navigate') {                            // অ্যাপের পেজ: সবসময় একই ক্যাশ-কপি
    e.respondWith(
      caches.match('./').then(function (hit) {
        return hit || caches.match('index.html');
      }).then(function (hit) {
        var up = refresh('./', req, hit);
        if (hit) { e.waitUntil(up); return hit; }
        return up.then(function (r) { return r || new Response('অফলাইন — একবার অনলাইনে অ্যাপ খুলুন', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var up = refresh(req, req, hit);
      if (hit) { e.waitUntil(up); return hit; }
      return up.then(function (r) { return r || Response.error(); });
    })
  );
});
