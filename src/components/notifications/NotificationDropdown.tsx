import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { apiMarkNotificationRead, apiMarkAllNotificationsRead } from '../../lib/api';
import { toast } from 'react-hot-toast';
import {
  Bell, MailOpen, Users, UserCheck, UserX,
  Radio, Trophy, BookOpen, Building2, CheckCheck, X,
  UserPlus, ArrowLeftRight, FileCheck, GraduationCap, Clock, AlertTriangle, Gift,
} from 'lucide-react';
import type { AppNotification } from '../../types';

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  invite_received:        { icon: <MailOpen className="w-3.5 h-3.5" />,      color: 'text-blue-600 dark:text-blue-400' },
  added_to_group:         { icon: <Users className="w-3.5 h-3.5" />,         color: 'text-slate-500 dark:text-slate-400' },
  invite_accepted:        { icon: <UserCheck className="w-3.5 h-3.5" />,     color: 'text-emerald-600 dark:text-emerald-400' },
  invite_declined:        { icon: <UserX className="w-3.5 h-3.5" />,         color: 'text-red-600 dark:text-red-400' },
  exam_room_created:      { icon: <Radio className="w-3.5 h-3.5" />,         color: 'text-blue-600 dark:text-blue-400' },
  exam_result_ready:      { icon: <Trophy className="w-3.5 h-3.5" />,        color: 'text-amber-600 dark:text-amber-400' },
  new_lesson:             { icon: <BookOpen className="w-3.5 h-3.5" />,       color: 'text-primary-600 dark:text-primary-400' },
  new_org_registered:     { icon: <Building2 className="w-3.5 h-3.5" />,     color: 'text-slate-500 dark:text-slate-400' },
  new_vacancy_application:{ icon: <UserPlus className="w-3.5 h-3.5" />,      color: 'text-slate-500 dark:text-slate-400' },
  transfer_request:       { icon: <ArrowLeftRight className="w-3.5 h-3.5" />,color: 'text-slate-500 dark:text-slate-400' },
  homework_submitted:     { icon: <FileCheck className="w-3.5 h-3.5" />,     color: 'text-blue-600 dark:text-blue-400' },
  homework_graded:        { icon: <GraduationCap className="w-3.5 h-3.5" />, color: 'text-emerald-600 dark:text-emerald-400' },
  trial_reminder:         { icon: <Clock className="w-3.5 h-3.5" />,         color: 'text-amber-600 dark:text-amber-400' },
  trial_expired:          { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-600 dark:text-red-400' },
  plan_gifted:            { icon: <Gift className="w-3.5 h-3.5" />,          color: 'text-primary-600 dark:text-primary-400' },
};

function timeAgo(dateStr: string, t: TFunction): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.ago.now', 'сейчас');
  if (mins < 60) return t('notifications.ago.minutes', '{{count}} мин', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.ago.hours', '{{count}} ч', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notifications.ago.days', '{{count}} д', { count: days });
}

const NotificationDropdown: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Auto-read notifications if we are already on their link page
  useEffect(() => {
    if (notifications.length === 0) return;
    const unreadHere = notifications.filter(n => !n.read && n.link && n.link === location.pathname);
    unreadHere.forEach(n => {
      apiMarkNotificationRead(n.id).catch(() => {});
    });
  }, [location.pathname, notifications]);

  // Real-time Firestore listener
  const initialLoadRef = useRef(true);
  // Track which notification IDs we've already shown toasts for to prevent duplicates
  const shownToastIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    // Reset on user change
    initialLoadRef.current = true;
    shownToastIdsRef.current.clear();

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppNotification))
        .slice(0, 30);
      setNotifications(items);

      // Skip toast on initial load
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        // Seed the shown set with all existing IDs so we don't re-toast them later
        items.forEach(item => shownToastIdsRef.current.add(item.id));
        return;
      }

      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const notif = change.doc.data() as AppNotification;

          // Guard: skip if we already showed a toast for this notification
          if (shownToastIdsRef.current.has(docId)) return;
          shownToastIdsRef.current.add(docId);

          // Only toast for recent, unread notifications (within 30s)
          if (!notif.read && (Date.now() - new Date(notif.createdAt).getTime() < 30000)) {
            toast(
              (t) => (
                <div 
                  className="flex flex-col gap-1 cursor-pointer w-full"
                  onClick={() => {
                    toast.dismiss(t.id);
                    if (notif.link) navigate(notif.link);
                  }}
                >
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{notif.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{notif.message}</p>
                </div>
              ),
              { duration: 5000, position: 'top-right', id: `notif-${docId}` }
            );
          }
        }
      });
    }, (err) => {
      console.warn('Notification listener error:', err);
    });
    return unsub;
  }, [firebaseUser?.uid, navigate]);

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
        className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-600 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center rounded px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-pop z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between h-11 px-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('notifications.title')}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead}
                  className="h-7 px-2 rounded-md text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/50 inline-flex items-center gap-1 font-medium transition-colors">
                  <CheckCheck className="w-3 h-3" />{t('notifications.markAllRead')}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.invite_received;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-200 dark:border-slate-700 last:border-b-0 ${
                      !notif.read ? 'bg-slate-50/60 dark:bg-slate-700/20' : ''
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center shrink-0 ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notif.read ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{notif.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5 tabular-nums">{timeAgo(notif.createdAt, t)}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-1.5 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
              className="w-full h-8 text-sm font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-md transition-colors text-center"
            >
              {t('notifications.showAll', 'Показать все уведомления')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
