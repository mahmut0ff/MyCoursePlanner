import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/auth.service';
import { getUser } from '../services/users.service';
import { isFirebaseConfigured, requestNotificationPermission, setupForegroundMessaging } from '../lib/firebase';
import type { FcmForegroundPayload } from '../lib/firebase';
import { apiSaveFcmToken, apiRemoveFcmToken } from '../lib/api';
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
  isStudent: boolean;
  isManager: boolean;
  isTeacherWithoutOrg: boolean;
  isStudentWithoutOrg: boolean;
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
  isStudent: false,
  isManager: false,
  isTeacherWithoutOrg: false,
  isStudentWithoutOrg: false,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ---- Foreground FCM Toast ----

interface ToastData extends FcmForegroundPayload {
  id: number;
}

const FcmToast: React.FC<{ toast: ToastData; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className="flex items-start gap-3 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-2xl shadow-slate-900/20 animate-[slideIn_0.3s_ease-out]"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{toast.title}</p>
        {toast.body && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{toast.body}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// ---- AuthProvider ----

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const fcmTokenRef = useRef<string | null>(null);
  const fgUnsubRef = useRef<(() => void) | null>(null);
  let toastIdCounter = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const loadProfile = async (user: User) => {
    try {
      const p = await getUser(user.uid);
      setProfile(p || null);
    } catch (e) {
      console.error('Failed to load user profile:', e);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (firebaseUser) await loadProfile(firebaseUser);
  };

  // Register FCM push token + foreground listener (best-effort, non-blocking)
  const registerFcmToken = async () => {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        fcmTokenRef.current = token;
        await apiSaveFcmToken(token);
      }

      // Setup foreground message listener
      const unsub = await setupForegroundMessaging((payload) => {
        const id = ++toastIdCounter.current;
        setToasts(prev => [...prev.slice(-4), { ...payload, id }]);
      });
      if (unsub) fgUnsubRef.current = unsub;
    } catch (e) {
      console.warn('FCM token registration failed:', e);
    }
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
        // Register push notifications (non-blocking)
        registerFcmToken();
      } else {
        // Remove FCM token on logout
        if (fcmTokenRef.current) {
          apiRemoveFcmToken(fcmTokenRef.current).catch(() => {});
          fcmTokenRef.current = null;
        }
        // Cleanup foreground listener
        if (fgUnsubRef.current) {
          fgUnsubRef.current();
          fgUnsubRef.current = null;
        }
        setProfile(null);
      }
      setLoading(false);
    });
    return () => {
      unsub();
      if (fgUnsubRef.current) {
        fgUnsubRef.current();
        fgUnsubRef.current = null;
      }
    };
  }, []);

  const role = profile?.role || null;
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

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
        isStaff: role === 'super_admin' || role === 'admin' || role === 'manager' || role === 'teacher',
        isTeacher,
        isStudent,
        isManager: role === 'manager',
        isTeacherWithoutOrg: isTeacher && !profile?.organizationId,
        isStudentWithoutOrg: isStudent && !profile?.organizationId,
        refreshProfile,
      }}
    >
      {children}

      {/* FCM Foreground Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <FcmToast key={t.id} toast={t} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </AuthContext.Provider>
  );
};

