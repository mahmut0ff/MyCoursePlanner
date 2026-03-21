import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/auth.service';
import { getUser, createUser } from '../services/users.service';
import { isFirebaseConfigured } from '../lib/firebase';
import type { UserProfile, UserRole } from '../types';

interface AuthContextType {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  role: UserRole | null;
  configured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  profile: null,
  loading: true,
  role: null,
  configured: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          let p = await getUser(user.uid);
          if (!p) {
            await createUser(user.uid, user.email || '', user.displayName || 'User', 'student');
            p = await getUser(user.uid);
          }
          setProfile(p);
        } catch (e) {
          console.error('Failed to load user profile:', e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        role: profile?.role || null,
        configured: isFirebaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
