import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead, apiTransferResolve } from '../../lib/api';
import { Bell, Check, ExternalLink, ShieldCheck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  metadata?: any;
}

const NotificationsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiGetNotifications()
      .then((data: any) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleMarkRead = async (id: string) => {
    await apiMarkNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllRead = async () => {
    await apiMarkAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleResolve = async (e: React.MouseEvent, n: AppNotification, decision: 'approve' | 'reject') => {
    e.stopPropagation();
    try {
      await apiTransferResolve({ notificationId: n.id, decision });
      toast.success(decision === 'approve' ? 'Запрос одобрен' : 'Запрос отклонен');
      // Оптимистичное обновление
      setNotifications(prev => prev.map(item => 
         item.id === n.id ? { ...item, metadata: { ...item.metadata, status: decision === 'approve' ? 'approved' : 'rejected' } } : item
      ));
    } catch (err: any) {
      toast.error(err.message || 'Ошибка обработки запроса');
    }
  };

  const handleClick = (n: AppNotification) => {
    if (!n.read) handleMarkRead(n.id);
    if (n.link) navigate(n.link);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} ${t('notifications.unread')}` : t('notifications.subtitle')}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1.5 transition-colors">
            <Check className="w-4 h-4" />{t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        </div>
      ) : notifications.length === 0 ? (
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
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 transition-all hover:shadow-md cursor-pointer ${!n.read ? 'ring-2 ring-primary-500/20' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.read ? 'bg-primary-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                    {n.link && <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  
                  {n.type === 'transfer_request' && n.metadata?.status === 'pending' && (
                    <div className="mt-3 flex items-center gap-2">
                      <button 
                        onClick={(e) => handleResolve(e, n, 'approve')}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Одобрить
                      </button>
                      <button 
                        onClick={(e) => handleResolve(e, n, 'reject')}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-500 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Отклонить
                      </button>
                    </div>
                  )}
                  {n.type === 'transfer_request' && n.metadata?.status !== 'pending' && (
                    <div className="mt-2 inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500">
                      {n.metadata?.status === 'approved' ? 'Одобрено' : 'Отклонено'}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString()}</p>
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
