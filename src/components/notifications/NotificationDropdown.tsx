import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { apiMarkNotificationRead, apiMarkAllNotificationsRead } from '../../lib/api';
import {
  Bell, MailOpen, Briefcase, Users, UserCheck, UserX,
  Radio, Trophy, BookOpen, Building2, CheckCheck, X,
} from 'lucide-react';
import type { AppNotification, NotificationType } from '../../types';

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  invite_received:        { icon: <MailOpen className="w-4 h-4" />,   color: 'text-blue-500 bg-blue-500/10' },
  vacancy_app_reviewed:   { icon: <Briefcase className="w-4 h-4" />,  color: 'text-emerald-500 bg-emerald-500/10' },
  added_to_group:         { icon: <Users className="w-4 h-4" />,      color: 'text-violet-500 bg-violet-500/10' },
  new_vacancy_application:{ icon: <Briefcase className="w-4 h-4" />,  color: 'text-amber-500 bg-amber-500/10' },
  invite_accepted:        { icon: <UserCheck className="w-4 h-4" />,  color: 'text-emerald-500 bg-emerald-500/10' },
  invite_declined:        { icon: <UserX className="w-4 h-4" />,      color: 'text-red-500 bg-red-500/10' },
  exam_room_created:      { icon: <Radio className="w-4 h-4" />,      color: 'text-cyan-500 bg-cyan-500/10' },
  exam_result_ready:      { icon: <Trophy className="w-4 h-4" />,     color: 'text-amber-500 bg-amber-500/10' },
  new_lesson:             { icon: <BookOpen className="w-4 h-4" />,    color: 'text-primary-500 bg-primary-500/10' },
  new_org_registered:     { icon: <Building2 className="w-4 h-4" />,  color: 'text-indigo-500 bg-indigo-500/10' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'сейчас';
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} д`;
}

const NotificationDropdown: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Real-time Firestore listener
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', firebaseUser.uid),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 30);
      setNotifications(items);
    }, (err) => {
      console.warn('Notification listener error:', err);
    });
    return unsub;
  }, [firebaseUser?.uid]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = async (notif: AppNotification) => {
    if (!notif.read) {
      apiMarkNotificationRead(notif.id).catch(() => {});
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  const handleMarkAllRead = () => {
    apiMarkAllNotificationsRead().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-slate-900/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead}
                  className="text-[10px] text-primary-500 hover:text-primary-600 flex items-center gap-0.5 font-medium">
                  <CheckCheck className="w-3 h-3" />{t('notifications.markAllRead')}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-400">{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.invite_received;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-50 dark:border-slate-700/30 ${
                      !notif.read ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${!notif.read ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {notif.title}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{notif.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{timeAgo(notif.createdAt)}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
