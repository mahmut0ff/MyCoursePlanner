import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

if (!isFirebaseConfigured) {
  console.warn(
    '⚠️ Firebase is not configured. Create a .env file with your Firebase config.\n' +
    'See .env.example for the required variables.'
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ---- Firebase Cloud Messaging ----

let messaging: Messaging | null = null;

export async function getMessagingInstance(): Promise<Messaging | null> {
  if (messaging) return messaging;
  const supported = await isSupported();
  if (!supported) return null;
  messaging = getMessaging(app);
  return messaging;
}

/**
 * Request notification permission and get FCM token.
 * Returns the token string or null if denied/unsupported.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const m = await getMessagingInstance();
    if (!m) return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('⚠️ VITE_FIREBASE_VAPID_KEY is not set. Push notifications disabled.');
      return null;
    }

    const token = await getToken(m, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
    });

    return token || null;
  } catch (err) {
    console.warn('Push notification setup failed:', err);
    return null;
  }
}

export interface FcmForegroundPayload {
  title: string;
  body: string;
  link?: string;
}

/**
 * Subscribe to FCM messages while the app is in the **foreground**.
 * Without this listener, foreground pushes are silently dropped by design.
 * Returns an unsubscribe function.
 */
export async function setupForegroundMessaging(
  callback: (payload: FcmForegroundPayload) => void,
): Promise<(() => void) | null> {
  try {
    const m = await getMessagingInstance();
    if (!m) return null;

    const unsubscribe = onMessage(m, (payload) => {
      const title = payload.notification?.title || 'Уведомление';
      const body = payload.notification?.body || '';
      const link = payload.data?.link;
      callback({ title, body, link });
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Foreground messaging setup failed:', err);
    return null;
  }
}

export default app;
