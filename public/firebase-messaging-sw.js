importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: 'AIzaSyDMy1ig9RdN7fIsHC1l8Hd0e8CoijWNjf0',
    authDomain: 'eevolvee.firebaseapp.com',
    projectId: 'eevolvee',
    storageBucket: 'eevolvee.firebasestorage.app',
    messagingSenderId: '452188896612',
    appId: '1:452188896612:web:09941780cbc15dc0744e71',
  });
}

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
