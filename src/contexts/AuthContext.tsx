import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/auth.service';
import { getUser } from '../services/users.service';
import { isFirebaseConfigured, requestNotificationPermission, db } from '../lib/firebase';
import { apiSaveFcmToken, apiRemoveFcmToken, apiSwitchOrg } from '../lib/api';
import { doc, getDoc } from 'firebase/firestore';
import type { UserProfile, UserRole } from '../types';

interface ManagerPermissions {
  finances: boolean;
  settings: boolean;
  managers: boolean;
  branches: boolean;
}

const ALL_PERMISSIONS: ManagerPermissions = { finances: true, settings: true, managers: true, branches: true };
const NO_PERMISSIONS: ManagerPermissions = { finances: false, settings: false, managers: false, branches: false };

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
  permissions: ManagerPermissions;
  hasPermission: (key: keyof ManagerPermissions) => boolean;
  refreshProfile: () => Promise<void>;
  /** Switch the user's active organization context and refresh profile. */
  switchOrganization: (orgId: string) => Promise<void>;
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
  permissions: { ...NO_PERMISSIONS },
  hasPermission: () => false,
  refreshProfile: async () => {},
  switchOrganization: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ---- AuthProvider ----

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<ManagerPermissions>({ ...NO_PERMISSIONS });
  const fcmTokenRef = useRef<string | null>(null);

  const loadProfile = async (user: User) => {
    try {
      const p = await getUser(user.uid);
      setProfile(p || null);
      // Load manager permissions from membership
      if (p) {
        const orgId = (p as any)?.activeOrgId || p.organizationId;
        if (orgId && p.role === 'manager') {
          try {
            const memberDoc = await getDoc(doc(db, 'users', user.uid, 'memberships', orgId));
            if (memberDoc.exists()) {
              const mData = memberDoc.data();
              setPermissions({
                finances: mData.permissions?.finances === true,
                settings: mData.permissions?.settings === true,
                managers: mData.permissions?.managers === true,
                branches: mData.permissions?.branches === true,
              });
            } else {
              setPermissions({ ...NO_PERMISSIONS });
            }
          } catch { setPermissions({ ...NO_PERMISSIONS }); }
        } else if (p.role === 'admin' || p.role === 'super_admin') {
          setPermissions({ ...ALL_PERMISSIONS });
        } else {
          setPermissions({ ...NO_PERMISSIONS });
        }
      }
    } catch (e) {
      console.error('Failed to load user profile:', e);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (firebaseUser) await loadProfile(firebaseUser);
  };

  /**
   * Switch the user's active organization and reload their profile.
   * This calls the backend switchOrg endpoint which updates both
   * activeOrgId and the legacy organizationId field, then refreshes
   * the local profile to reflect the new context.
   */
  const switchOrganization = useCallback(async (orgId: string) => {
    await apiSwitchOrg(orgId);
    if (firebaseUser) await loadProfile(firebaseUser);
  }, [firebaseUser]);

  // Register FCM push token (best-effort, non-blocking, runs only once per session).
  // IMPORTANT: We NEVER auto-prompt the browser's notification dialog.
  // We only silently register the token if the user has ALREADY granted permission
  // (e.g. from a previous explicit opt-in via a settings toggle / bell icon).
  const fcmRegisteredRef = useRef(false);
  const registerFcmToken = async () => {
    if (fcmRegisteredRef.current) return;
    fcmRegisteredRef.current = true;

    // Only proceed if permission was already granted — never trigger the popup
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }

    try {
      const token = await requestNotificationPermission();
      if (token) {
        fcmTokenRef.current = token;
        await apiSaveFcmToken(token);
      }
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
        setLoading(true);
        await loadProfile(user);
        // Register push notifications (non-blocking)
        registerFcmToken();
      } else {
        // Remove FCM token on logout
        if (fcmTokenRef.current) {
          apiRemoveFcmToken(fcmTokenRef.current).catch(() => {});
          fcmTokenRef.current = null;
        }
        setProfile(null);
      }
      setLoading(false);
    });
    return () => {
      unsub();
    };
  }, []);

  const role = profile?.role || null;
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  // Prefer activeOrgId, fall back to legacy organizationId
  const resolvedOrgId = (profile as any)?.activeOrgId || profile?.organizationId || null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        role,
        configured: isFirebaseConfigured,
        organizationId: resolvedOrgId,
        isSuperAdmin: role === 'super_admin',
        isStaff: role === 'super_admin' || role === 'admin' || role === 'manager' || role === 'teacher',
        isTeacher,
        isStudent,
        isManager: role === 'manager',
        isTeacherWithoutOrg: isTeacher && !resolvedOrgId,
        isStudentWithoutOrg: isStudent && !resolvedOrgId,
        permissions,
        hasPermission: (key: keyof ManagerPermissions) => {
          if (role === 'admin' || role === 'super_admin') return true;
          if (role !== 'manager') return false;
          return permissions[key] === true;
        },
        refreshProfile,
        switchOrganization,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
