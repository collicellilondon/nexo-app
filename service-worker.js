importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

const CACHE='nexo-v29-push-notifications';
const ASSETS=['./','./index.html','./styles.css','./app.js','./firebase-config.js','./nexo-logo.jpeg','./nexo-icon-192.png','./nexo-icon-512.png','./nexo-icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});

const firebaseConfig = {
  apiKey: "AIzaSyB4CFSnW634akMIpBuohgrWaFS3lC5lmnc",
  authDomain: "kidsafe-collidev-securit-74307.firebaseapp.com",
  projectId: "kidsafe-collidev-securit-74307",
  appId: "1:1006389451626:web:a1cf6db127910c207b2313",
  messagingSenderId: "1006389451626",
  storageBucket: "kidsafe-collidev-securit-74307.firebasestorage.app"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title || payload.data?.title || 'Nexo';
    const body = payload.notification?.body || payload.data?.body || 'Nova mensagem';
    const url = payload.data?.url || './';
    self.registration.showNotification(title, {
      body,
      icon: './nexo-icon-192.png',
      badge: './nexo-icon-192.png',
      tag: payload.data?.chatId || 'nexo-message',
      renotify: true,
      data: { url }
    });
  });
} catch {
  // O app continua funcionando mesmo se o navegador não suportar FCM no service worker.
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification?.data?.url || './', self.location.origin + self.location.pathname.replace(/service-worker\.js$/, ''));
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url.href);
          return client.focus();
        }
      }
      return clients.openWindow(url.href);
    })
  );
});
