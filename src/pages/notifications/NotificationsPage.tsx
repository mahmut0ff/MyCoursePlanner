import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: 'info' | 'success' | 'warning';
}

const NotificationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [notifications] = useState<Notification[]>([]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('notifications.subtitle')}</p>
        </div>
        {notifications.length > 0 && (
          <button className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1.5 transition-colors">
            <Check className="w-4 h-4" />{t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-slate-300 dark:text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t('notifications.emptyTitle')}</h2>
          <p className="text-sm text-slate-400">{t('notifications.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 transition-all hover:shadow-md ${!n.read ? 'ring-2 ring-primary-500/20' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.read ? 'bg-primary-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
