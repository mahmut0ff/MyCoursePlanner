import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { firebaseUser, profile, loading, configured } = useAuth();

  // Give the profile a moment to load from Firestore before concluding it doesn't exist.
  // This prevents premature redirects to /onboarding during the auth → profile fetch cycle.
  const [profileSettled, setProfileSettled] = useState(false);

  useEffect(() => {
    if (loading) return; // still loading auth — wait
    if (profile) {
      // Profile exists, no need to wait
      setProfileSettled(true);
      return;
    }
    // Firebase user exists but profile is null — wait 1.5s for Firestore fetch
    const timer = setTimeout(() => {
      setProfileSettled(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading, profile]);

  if (loading || (!profileSettled && firebaseUser && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-lg text-center border border-slate-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Firebase не настроен</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Создайте файл <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-sm">.env</code>.</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;

  // Only redirect to onboarding after we've confirmed profile truly doesn't exist
  if (!profile && profileSettled) {
    return <Navigate to="/onboarding" replace />;
  }
  
  // super_admin can access everything
  if (profile?.role === 'super_admin') return <>{children}</>;
  
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
