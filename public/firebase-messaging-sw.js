// Firebase Cloud Messaging Service Worker
// Handles background push notifications

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// NOTE: Service workers cannot access import.meta.env or process.env.
// These values must be hardcoded or injected at build time.
// They are safe to expose — Firebase client config is public by design.
firebase.initializeApp({
  apiKey: 'AIzaSyBxc6ziiPSAcJuX7fcbcPTbx3K4nmcyXcQ',
  authDomain: 'confident-totem-426112-j6.firebaseapp.com',
  projectId: 'confident-totem-426112-j6',
  storageBucket: 'confident-totem-426112-j6.firebasestorage.app',
  messagingSenderId: '646458638686',
  appId: '1:646458638686:web:deb5d61bb39e6b391fcfcf',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Planula';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icons/logo.png',
    badge: '/icons/logo.png',
    data: payload.data,
    tag: 'notification-' + Date.now(),
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(link);
          return;
        }
      }
      return clients.openWindow(link);
    })
  );
});
