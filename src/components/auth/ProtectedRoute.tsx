import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { firebaseUser, profile, loading, configured } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
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
  if (!profile && firebaseUser) {
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
