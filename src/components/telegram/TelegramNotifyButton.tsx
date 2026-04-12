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
import { useAuth } from '../../contexts/AuthContext';
import { apiGetTelegramStatus, apiGenerateTelegramLink, apiUnlinkTelegram } from '../../lib/api';
import { CheckCircle2, Loader2, ExternalLink, X, Unlink, Bell } from 'lucide-react';

/* ─── Inline Telegram SVG icon ─── */
const TelegramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

/* Notification descriptions per role */
const getRoleNotifications = (role: string) => {
  switch (role) {
    case 'student':
      return [
        { icon: '📝', text: 'Новые оценки в журнале' },
        { icon: '📅', text: 'Пропуски занятий' },
        { icon: '✅', text: 'Оценка домашних заданий' },
        { icon: '📊', text: 'Результаты экзаменов' },
        { icon: '🎯', text: 'Открытие экзаменов' },
        { icon: '📖', text: 'Новые уроки' },
        { icon: '💰', text: 'Подтверждение оплаты' },
        { icon: '📚', text: 'Добавление в группу' },
      ];
    case 'teacher':
      return [
        { icon: '📝', text: 'Студент сдал домашнее задание' },
        { icon: '📊', text: 'Студент завершил экзамен' },
        { icon: '📩', text: 'Новые заявки студентов' },
      ];
    case 'admin':
    case 'owner':
    case 'manager':
      return [
        { icon: '💰', text: 'Получение оплаты' },
        { icon: '👋', text: 'Новые студенты' },
        { icon: '📩', text: 'Заявки на вступление' },
        { icon: '📚', text: 'Записи в группы' },
        { icon: '📝', text: 'Сдача домашних заданий' },
        { icon: '⏰', text: 'Напоминания о триале' },
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
    if (!confirm('Отвязать Telegram? Уведомления перестанут приходить.')) return;
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
            flex items-center w-full rounded-lg transition-all duration-200
            bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15
            ${isCollapsed
              ? 'gap-3 px-3 py-2 lg:justify-center lg:px-0 lg:w-12 lg:mx-auto'
              : 'gap-2.5 px-3 py-2'
            }
          `}
          title="Telegram подключён"
        >
          <div className="relative shrink-0">
            <TelegramIcon className="w-4 h-4" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full" />
          </div>
          <span className={`text-[12px] font-medium truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
            Подключено
          </span>
        </button>
      ) : (
        /* ─── Not connected: glowing Telegram-blue CTA ─── */
        <button
          onClick={openModal}
          className={`
            group flex items-center w-full rounded-xl transition-all duration-300
            bg-[#229ED9] hover:bg-[#1e8ec4] text-white
            shadow-[0_0_15px_rgba(34,158,217,0.4)] hover:shadow-[0_0_25px_rgba(34,158,217,0.6)]
            telegram-glow-btn
            ${isCollapsed
              ? 'gap-3 px-3 py-2.5 lg:justify-center lg:px-0 lg:w-12 lg:mx-auto'
              : 'gap-2.5 px-3 py-2.5'
            }
          `}
          title="Подключить Telegram-уведомления"
        >
          <TelegramIcon className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
          <span className={`text-[12px] font-semibold truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
            Уведомления
          </span>
          <Bell className={`w-3 h-3 ml-auto opacity-60 group-hover:opacity-100 transition-opacity ${isCollapsed ? 'lg:hidden' : ''}`} />
        </button>
      )}

      {/* ═══ Modal Overlay ═══ */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="bg-gradient-to-br from-[#229ED9] to-[#1a7fb8] px-6 py-5 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8" />

              <button
                onClick={() => setModalOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 relative z-10">
                <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
                  <TelegramIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Telegram-уведомления</h2>
                  <p className="text-sm text-white/70">Мгновенные уведомления в Telegram</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Status badge */}
              {isLinked && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Telegram подключён — уведомления активны
                  </p>
                </div>
              )}

              {/* Notification list */}
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                {isLinked ? 'Вы получаете:' : 'Вы будете получать:'}
              </p>
              <div className="space-y-1.5 mb-5">
                {notifications.map((n, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <span className="text-base shrink-0">{n.icon}</span>
                    <span className="text-[13px] text-slate-700 dark:text-slate-300">{n.text}</span>
                  </div>
                ))}
              </div>

              {/* Recommendation */}
              {!isLinked && !linkData && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 mb-5">
                  <p className="text-[13px] text-blue-700 dark:text-blue-400">
                    💡 <strong>Рекомендуем включить</strong> — вы не пропустите важные события и сможете реагировать мгновенно.
                  </p>
                </div>
              )}

              {/* ─── Action area ─── */}
              {!isLinked && !linkData && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full bg-[#229ED9] hover:bg-[#1e8ec4] disabled:opacity-50 text-white px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#229ED9]/25"
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Генерация кода...</>
                  ) : (
                    <><TelegramIcon className="w-4 h-4" /> Подключить Telegram</>
                  )}
                </button>
              )}

              {/* Linking in progress */}
              {!isLinked && linkData && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Нажмите кнопку ниже и отправьте <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">/start</code> боту:
                  </p>
                  <a
                    href={linkData.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-[#229ED9] hover:bg-[#1e8ec4] text-white px-4 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-[#229ED9]/25"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Открыть @{linkData.botUsername}
                  </a>
                  <div className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#229ED9]" />
                    <p className="text-xs text-slate-500">Ожидание привязки… Код действует 15 мин.</p>
                  </div>
                </div>
              )}

              {/* Unlink button */}
              {isLinked && (
                <button
                  onClick={handleUnlink}
                  className="flex items-center justify-center gap-1.5 w-full text-sm text-slate-400 hover:text-rose-500 py-2 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Отвязать Telegram
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
