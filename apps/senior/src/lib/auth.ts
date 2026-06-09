import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import { useEffect, useState } from 'react';

/**
 * Subscribe to Firebase Auth state changes. Returns `{ user, initializing }`
 * so we can render a splash while Firebase restores the session on cold
 * start instead of redirecting to /login by mistake.
 */
export function useAuthState() {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = auth().onAuthStateChanged((u) => {
      setUser(u);
      if (initializing) setInitializing(false);
    });
    return unsub;
  }, [initializing]);

  return { user, initializing };
}

export const signIn = (email: string, password: string) =>
  auth().signInWithEmailAndPassword(email, password);

export const signUp = (email: string, password: string) =>
  auth().createUserWithEmailAndPassword(email, password);

export const signOut = () => auth().signOut();
