importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase Hosting serves this automatically in production.
// In local dev, vite.config.js provides the same endpoint via a dev middleware.
importScripts('/__/firebase/init.js');

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  if (!title) return;
  self.registration.showNotification(title, {
    body: body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [200, 100, 200],
  });
});
