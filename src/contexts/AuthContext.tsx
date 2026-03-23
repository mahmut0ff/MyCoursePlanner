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
  organizationId: string | null;
  isSuperAdmin: boolean;
  isStaff: boolean;
  isTeacher: boolean;
  isTeacherWithoutOrg: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  profile: null,
  loading: true,
  role: null,
  configured: false,
  organizationId: null,
  isSuperAdmin: false,
  isStaff: false,
  isTeacher: false,
  isTeacherWithoutOrg: false,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (user: User) => {
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
  };

  const refreshProfile = async () => {
    if (firebaseUser) await loadProfile(firebaseUser);
  };

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadProfile(user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const role = profile?.role || null;
  const isTeacher = role === 'teacher';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        role,
        configured: isFirebaseConfigured,
        organizationId: profile?.organizationId || null,
        isSuperAdmin: role === 'super_admin',
        isStaff: role === 'super_admin' || role === 'admin' || role === 'teacher',
        isTeacher,
        isTeacherWithoutOrg: isTeacher && !profile?.organizationId,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

