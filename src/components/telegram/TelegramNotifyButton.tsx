/**
 * TelegramNotifyButton — Sidebar CTA for Telegram notification subscription.
 *
 * States:
 * 1. Not linked → Glowing Telegram-blue button "Уведомления"
 * 2. Link in progress → Modal with description + deep link
 * 3. Linked → Subtle green "Подключено" badge
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetTelegramStatus, apiGenerateTelegramLink, apiUnlinkTelegram } from '../../lib/api';
import {
  CheckCircle2, Loader2, ExternalLink, X, Unlink, Bell,
  ClipboardList, CalendarX2, FileCheck2, GraduationCap, DoorOpen, BookOpen,
  Receipt, Wallet, Users, CalendarClock, CalendarSync,
  UserPlus, PhoneCall, AlertTriangle, TimerReset, Sunrise, BarChart3, UserMinus, Lightbulb,
  type LucideIcon,
} from 'lucide-react';

import TelegramIcon from './TelegramIcon';

interface NotificationItem {
  Icon: LucideIcon;
  /** i18n key under telegram.notify.* */
  key: string;
  text: string;
  /** Tailwind text colour for the icon — keeps the list as scannable as the old emoji did. */
  tone: string;
}

/**
 * What each role actually receives, mirroring the backend dispatch sites in
 * netlify/functions/utils/notifications.ts and its callers. Keep in sync when
 * adding a new NotificationType.
 */
const getRoleNotifications = (role: string): NotificationItem[] => {
  switch (role) {
    case 'student':
      return [
        { Icon: ClipboardList, key: 'grades', text: 'Новые оценки в журнале', tone: 'text-blue-500' },
        { Icon: CalendarX2, key: 'absences', text: 'Пропуски занятий', tone: 'text-rose-500' },
        { Icon: FileCheck2, key: 'hwChecked', text: 'Проверка домашних заданий', tone: 'text-emerald-500' },
        { Icon: GraduationCap, key: 'examResults', text: 'Результаты экзаменов', tone: 'text-violet-500' },
        { Icon: DoorOpen, key: 'examOpened', text: 'Открытие экзаменов', tone: 'text-amber-500' },
        { Icon: BookOpen, key: 'newLessons', text: 'Новые уроки', tone: 'text-sky-500' },
        { Icon: Users, key: 'addedToGroup', text: 'Добавление в группу', tone: 'text-indigo-500' },
        { Icon: CalendarClock, key: 'tomorrowReminder', text: 'Напоминание о занятиях на завтра', tone: 'text-cyan-500' },
        { Icon: CalendarSync, key: 'scheduleChanges', text: 'Изменения и отмены в расписании', tone: 'text-orange-500' },
        { Icon: Receipt, key: 'invoices', text: 'Счета и напоминания об оплате', tone: 'text-amber-600' },
        { Icon: Wallet, key: 'paymentConfirmed', text: 'Подтверждение оплаты', tone: 'text-emerald-600' },
      ];
    case 'teacher':
      return [
        { Icon: FileCheck2, key: 'hwSubmitted', text: 'Сдача домашних заданий', tone: 'text-emerald-500' },
        { Icon: GraduationCap, key: 'studentFinishedExam', text: 'Студент завершил экзамен', tone: 'text-violet-500' },
        { Icon: CalendarClock, key: 'tomorrowReminder', text: 'Напоминание о занятиях на завтра', tone: 'text-cyan-500' },
        { Icon: CalendarSync, key: 'scheduleChanges', text: 'Изменения и отмены в расписании', tone: 'text-orange-500' },
      ];
    case 'admin':
    case 'owner':
    case 'manager':
      return [
        { Icon: Wallet, key: 'paymentReceived', text: 'Получение оплаты', tone: 'text-emerald-600' },
        { Icon: AlertTriangle, key: 'overdue', text: 'Просроченные платежи и должники', tone: 'text-rose-500' },
        { Icon: UserPlus, key: 'newStudents', text: 'Новые студенты', tone: 'text-indigo-500' },
        { Icon: Users, key: 'groupEnrollments', text: 'Записи в группы', tone: 'text-sky-500' },
        { Icon: FileCheck2, key: 'hwSubmitted', text: 'Сдача домашних заданий', tone: 'text-emerald-500' },
        { Icon: PhoneCall, key: 'newLeads', text: 'Новые заявки и лиды', tone: 'text-fuchsia-500' },
        { Icon: Sunrise, key: 'morningDigest', text: 'Утренняя сводка по школе', tone: 'text-amber-500' },
        { Icon: BarChart3, key: 'weeklyDigest', text: 'Сводка за неделю', tone: 'text-violet-500' },
        { Icon: AlertTriangle, key: 'atRisk', text: 'Студенты в зоне риска', tone: 'text-orange-500' },
        { Icon: UserMinus, key: 'teamChanges', text: 'Изменения в команде', tone: 'text-slate-500' },
        { Icon: TimerReset, key: 'trialReminders', text: 'Напоминания о триале', tone: 'text-cyan-500' },
      ];
    default:
      return [];
  }
};

interface Props {
  isCollapsed?: boolean;
  onClose?: () => void;
}

const TelegramNotifyButton: React.FC<Props> = ({ isCollapsed, onClose }) => {
  const { t } = useTranslation();
  const { role, organizationId } = useAuth();
  const [status, setStatus] = useState<{ linked: boolean } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [linkData, setLinkData] = useState<{ code: string; deepLink: string; botUsername: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Don't show for super admin or users with no org
  const isSuperAdmin = role === 'super_admin';
  if (isSuperAdmin || !organizationId) return null;

  const checkStatus = async () => {
    try {
      const s = await apiGetTelegramStatus();
      setStatus(s);
      if (s.linked && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLinkData(null);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await apiGenerateTelegramLink();
      setLinkData(data);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(checkStatus, 3000);
      setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }, 15 * 60 * 1000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(t('telegram.confirmUnlinkShort', 'Отвязать Telegram? Уведомления перестанут приходить.'))) return;
    try {
      await apiUnlinkTelegram();
      setStatus({ linked: false });
      setLinkData(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openModal = () => {
    setModalOpen(true);
    if (window.innerWidth < 1024) onClose?.();
  };

  if (loading) return null;

  const isLinked = status?.linked;
  const notifications = getRoleNotifications(role || '');

  return (
    <>
      {/* ═══ Sidebar Button ═══ */}
      {isLinked ? (
        /* ─── Connected state: subtle, non-intrusive ─── */
        <button
          onClick={openModal}
          className={`
            flex items-center w-full h-8 rounded-md transition-colors
            text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50
            ${isCollapsed
              ? 'gap-2 px-1.5 lg:justify-center lg:px-0 lg:w-8 lg:mx-auto'
              : 'gap-2 px-1.5'
            }
          `}
          title={t('telegram.connectedTitle', 'Telegram подключён')}
        >
          {/* Brand colour lives only in the icon square, as with Dolboor's channel rows. */}
          <span className="relative flex items-center justify-center w-5 h-5 shrink-0 rounded-md bg-[#229ED9] text-white">
            <TelegramIcon className="w-3 h-3" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-slate-50 dark:ring-slate-800" />
          </span>
          <span className={`text-xs font-medium truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
            {t('telegram.connectedBadge', 'Подключено')}
          </span>
        </button>
      ) : (
        /* ─── Not connected: a bordered row so it still reads as an invitation ─── */
        <button
          onClick={openModal}
          className={`
            group flex items-center w-full h-8 rounded-md transition-colors
            border border-slate-200 bg-white text-slate-900 hover:bg-slate-100
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700/50
            ${isCollapsed
              ? 'gap-2 px-1.5 lg:justify-center lg:px-0 lg:w-8 lg:mx-auto'
              : 'gap-2 px-1.5'
            }
          `}
          title={t('telegram.connectNotifications', 'Подключить Telegram-уведомления')}
        >
          <span className="flex items-center justify-center w-5 h-5 shrink-0 rounded-md bg-[#229ED9] text-white">
            <TelegramIcon className="w-3 h-3" />
          </span>
          <span className={`text-xs font-medium truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
            {t('telegram.notificationsShort', 'Уведомления')}
          </span>
          <Bell className={`w-3 h-3 ml-auto text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors ${isCollapsed ? 'lg:hidden' : ''}`} />
        </button>
      )}

      {/* ═══ Modal Overlay ═══ */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Modal */}
          <div
            className="relative w-full max-w-[480px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="px-4 pt-4 pb-2 pr-12 relative">
              <button
                onClick={() => setModalOpen(false)}
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                aria-label={t('common.close', 'Закрыть')}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md bg-[#229ED9] text-white">
                  <TelegramIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('telegram.title', 'Telegram-уведомления')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('telegram.instantSubtitle', 'Мгновенные уведомления в Telegram')}</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 pt-2 pb-4">
              {/* Status badge */}
              {isLinked && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2 mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {t('telegram.connectedActive', 'Telegram подключён — уведомления активны')}
                  </p>
                </div>
              )}

              {/* Notification list */}
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {isLinked ? t('telegram.youReceive', 'Вы получаете:') : t('telegram.youWillReceive', 'Вы будете получать:')}
              </p>
              <div className="mb-4 max-h-[42vh] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
                {notifications.map((n, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 min-h-[36px] py-1.5">
                    <n.Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="text-[13px] text-slate-700 dark:text-slate-300">{t(`telegram.notify.${n.key}`, n.text)}</span>
                  </div>
                ))}
              </div>

              {/* Recommendation */}
              {!isLinked && !linkData && (
                <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 mb-4">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <p className="text-[13px] text-slate-600 dark:text-slate-300">
                    <strong>{t('telegram.recommendTitle', 'Рекомендуем включить')}</strong> — {t('telegram.recommendText', 'вы не пропустите важные события и сможете реагировать мгновенно.')}
                  </p>
                </div>
              )}

              {/* ─── Action area ─── */}
              {!isLinked && !linkData && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
                >
                  {generating ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('telegram.generatingCode', 'Генерация кода...')}</>
                  ) : (
                    <><TelegramIcon className="w-3.5 h-3.5" /> {t('telegram.connectAction', 'Подключить Telegram')}</>
                  )}
                </button>
              )}

              {/* Linking in progress */}
              {!isLinked && linkData && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t('telegram.pressButtonBefore', 'Нажмите кнопку ниже и отправьте')} <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">/start</code> {t('telegram.pressButtonAfter', 'боту:')}
                  </p>
                  <a
                    href={linkData.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('telegram.openBotUser', 'Открыть @{{bot}}', { bot: linkData.botUsername })}
                  </a>
                  <div className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('telegram.waiting', 'Ожидание привязки... Код действует 15 минут.')}</p>
                  </div>
                </div>
              )}

              {/* Unlink button */}
              {isLinked && (
                <button
                  onClick={handleUnlink}
                  className="btn-ghost w-full inline-flex items-center justify-center gap-1.5 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  {t('telegram.unlink', 'Отвязать Telegram')}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TelegramNotifyButton;
