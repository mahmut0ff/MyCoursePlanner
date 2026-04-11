import React, { useState, useEffect, Suspense } from 'react';
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

import { apiGetOrganization } from '../../lib/api';
import PWAInstallPrompt from '../pwa/PWAInstallPrompt';
import NetworkStatusBar from '../network/NetworkStatusBar';

const AppLayout: React.FC = () => {
  const { isSuperAdmin, organizationId } = useAuth();
  const [orgData, setOrgData] = useState<any>(null);

  useEffect(() => {
    if (!isSuperAdmin && organizationId && organizationId !== 'personal') {
      apiGetOrganization(organizationId).then(data => {
        setOrgData(data);

      }).catch(console.error);
    } else {
      setOrgData(null);
      const root = document.documentElement;
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].forEach(w => {
        root.style.removeProperty(`--color-primary-${w}`);
      });
    }
  }, [organizationId, isSuperAdmin]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('planula_sidebar_collapsed') === 'true';
  });

  const handleToggleCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('planula_sidebar_collapsed', String(newState));
  };

  return (
    <>
    <PlanProvider>
      <div className="h-full bg-slate-50 dark:bg-slate-900 flex" style={{ paddingTop: 'var(--safe-area-top)', paddingLeft: 'var(--safe-area-left)', paddingRight: 'var(--safe-area-right)' }}>
        {/* Sidebar wrapper */}
        <aside className={`hidden lg:block shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-[72px]' : 'w-60'}`} />
        <Sidebar 
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          orgData={orgData}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <SubscriptionGuard>
            <main className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto overflow-x-hidden relative" style={{ paddingBottom: 'max(2rem, calc(var(--safe-area-bottom) + 1rem))' }}>
                <div className="max-w-screen-xl mx-auto w-full min-h-full page-content">
                  <Suspense fallback={
                    <div className="flex items-center justify-center py-20">
                      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
                    </div>
                  }>
                    <Outlet />
                  </Suspense>
                </div>
              </div>
            </main>
          </SubscriptionGuard>
        </div>
      </div>
    </PlanProvider>
    <PWAInstallPrompt />
    <NetworkStatusBar />
    </>
  );
};

export default AppLayout;
