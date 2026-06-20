import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export const signIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

/** Passwordless sign-in with a Firebase custom token (Telegram bot login flow). */
export const signInWithToken = (customToken: string) =>
  signInWithCustomToken(auth, customToken);

export const signUp = async (email: string, password: string, displayName: string) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  return cred;
};

// Error codes that mean a popup can't be used here (blocked by the browser,
// unsupported environment, no web storage) — fall back to a full-page redirect.
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

const buildGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  // Always let the user pick the account instead of silently reusing one.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

/**
 * Sign in with Google. Tries a popup first; if the browser blocks it (the
 * common `auth/popup-blocked` case) it transparently falls back to a full-page
 * redirect. Resolves to a credential for the popup flow, or `null` when a
 * redirect was started (the result is then picked up by
 * {@link getGoogleRedirectResult} / `onAuthStateChanged` after the page returns).
 */
export const signInWithGoogle = async (): Promise<UserCredential | null> => {
  try {
    return await signInWithPopup(auth, buildGoogleProvider());
  } catch (err: any) {
    if (POPUP_UNAVAILABLE.has(err?.code)) {
      await signInWithRedirect(auth, buildGoogleProvider());
      return null;
    }
    throw err;
  }
};

/** Resolves the pending Google redirect sign-in (if any) after the page returns. */
export const getGoogleRedirectResult = () => getRedirectResult(auth);

export const signOut = () => firebaseSignOut(auth);

export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);
