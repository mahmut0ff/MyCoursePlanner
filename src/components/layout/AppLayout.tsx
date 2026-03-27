import React, { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';
import Topbar from './Topbar.tsx';
import { PlanProvider, usePlanGate } from '../../contexts/PlanContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Clock, AlertTriangle } from 'lucide-react';

/** Trial countdown banner + expiry lockout inner wrapper */
const SubscriptionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { trialDaysLeft, isExpired, isGifted, subscriptionStatus, loading } = usePlanGate();
  const { isSuperAdmin, role } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  // Don't gate super admins, students, or while loading
  if (loading || isSuperAdmin || role === 'student') return <>{children}</>;

  // Gifted plans are permanent — never lockout
  if (isGifted) return <>{children}</>;

  // ─── LOCKOUT: expired trial/subscription → redirect to /billing ───
  const isOnBillingPage = location.pathname === '/billing' || location.pathname.startsWith('/payment');
  if (isExpired && !isOnBillingPage) {
    return <Navigate to="/billing" replace />;
  }

  return (
    <>
      {/* ─── Trial countdown banner ─── */}
      {subscriptionStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft > 0 && (
        <div className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-b ${
          trialDaysLeft <= 3
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800/30'
            : trialDaysLeft <= 7
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800/30'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800/30'
        }`}>
          {trialDaysLeft <= 3 ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
          <span>
            {t('billing.trialBanner', 'Пробный период')}: <strong>{trialDaysLeft} {trialDaysLeft === 1 ? t('billing.day', 'день') : trialDaysLeft < 5 ? t('billing.days2', 'дня') : t('billing.days5', 'дней')}</strong> {t('billing.remaining', 'осталось')}
          </span>
          <a href="/billing" className="ml-auto text-xs font-semibold underline underline-offset-2 hover:no-underline">
            {t('billing.upgradNow', 'Оплатить')}
          </a>
        </div>
      )}

      {/* ─── Expired banner on billing page ─── */}
      {isExpired && isOnBillingPage && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-b border-red-100 dark:border-red-800/30 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t('billing.expired', 'Ваш пробный период закончился. Выберите тариф для продолжения работы.')}</span>
        </div>
      )}

      {children}
    </>
  );
};

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <PlanProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
        {/* Sidebar — always dark navy */}
        <aside className="hidden lg:block w-60 shrink-0" />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex-1 flex flex-col h-screen min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <SubscriptionGuard>
            <main className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto relative">
                <div className="max-w-screen-xl mx-auto w-full h-full page-content">
                  <Outlet />
                </div>
              </div>
            </main>
          </SubscriptionGuard>
        </div>
      </div>
    </PlanProvider>
  );
};

export default AppLayout;
