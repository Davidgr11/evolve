importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase Hosting serves this automatically in production.
// In local dev, vite.config.js provides the same endpoint via a dev middleware.
importScripts('/__/firebase/init.js');

firebase.messaging();
// Firebase auto-displays the notification from the payload's notification + webpush fields.
