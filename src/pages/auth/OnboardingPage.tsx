import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { auth } from '../../lib/firebase';

/**
 * Self-service registration/onboarding was removed. Accounts are provisioned
 * top-down: admins add teachers and students, super-admins provision owners.
 *
 * This page is the destination `ProtectedRoute` sends an authenticated user
 * to when no Firestore profile exists for them (an account that was never
 * fully provisioned). Instead of letting them create a profile, we explain
 * that their account isn't set up and offer to sign out.
 */
const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser, profile, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('common.loading', 'Загрузка...')}</p>
        </div>
      </div>
    );
  }

  // Not signed in → nothing to do here.
  if (!firebaseUser) return <Navigate to="/login" replace />;

  // Profile already exists → send them into the app.
  if (profile) return <Navigate to="/dashboard" replace />;

  const handleSignOut = async () => {
    await auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 relative">
      <div className="absolute top-4 right-4"><LanguageSwitcher /></div>

      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-5">
          <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {t('auth.accountNotSetUpTitle', 'Аккаунт не настроен')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-1">
          {t('auth.accountNotSetUpBody', 'Для вашего входа ещё не создан профиль. Аккаунты заводит администратор учебного центра, а владельцам центров аккаунт создаёт наша команда после демо.')}
        </p>

        {firebaseUser.email && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            {t('auth.signedInAs', 'Вы вошли как')} <span className="font-medium text-slate-600 dark:text-slate-300">{firebaseUser.email}</span>
          </p>
        )}

        <button
          onClick={handleSignOut}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 btn-secondary !py-3 !rounded-xl"
        >
          <LogOut className="w-4 h-4" />
          {t('auth.useDifferentAccount', 'Войти под другим аккаунтом')}
        </button>
      </div>
    </div>
  );
};

export default OnboardingPage;
