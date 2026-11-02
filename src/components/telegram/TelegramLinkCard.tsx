/**
 * TelegramLinkCard — allows users to link their Telegram account for notifications.
 * 
 * Flow:
 * 1. User clicks "Link Telegram"
 * 2. System generates a 6-char code with 15-min TTL
 * 3. User is shown a deep link: t.me/BotName?start=CODE
 * 4. User opens link → sends /start CODE to bot → bot binds chat_id
 * 5. Component polls status and confirms linkage
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetTelegramStatus, apiGenerateTelegramLink, apiUnlinkTelegram } from '../../lib/api';
import { MessageCircle, Link2, Unlink, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';

const TelegramLinkCard: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ linked: boolean; telegramChatId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState<{ code: string; deepLink: string; botUsername: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await apiGenerateTelegramLink();
      setLinkData(data);

      // Start polling for link confirmation (every 3s for 15 min)
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(checkStatus, 3000);

      // Auto-stop after 15 min
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 15 * 60 * 1000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(t('telegram.confirmUnlink', 'Отвязать Telegram? Вы перестанете получать уведомления.'))) return;
    try {
      await apiUnlinkTelegram();
      setStatus({ linked: false });
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-40" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md bg-[#229ED9] text-white">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              {t('telegram.title', 'Telegram-уведомления')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('telegram.subtitle', 'Оценки, ДЗ и оплата — прямо в Telegram')}
            </p>
          </div>
        </div>

        {/* LINKED STATE */}
        {status?.linked && (
          <div className="mt-3">
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                {t('telegram.linked', 'Telegram привязан. Уведомления включены.')}
              </p>
            </div>
            <button
              onClick={handleUnlink}
              className="btn-ghost mt-2 -ml-3 inline-flex items-center gap-1.5 hover:text-red-600 dark:hover:text-red-400"
            >
              <Unlink className="w-3.5 h-3.5" />
              {t('telegram.unlink', 'Отвязать Telegram')}
            </button>
          </div>
        )}

        {/* UNLINKED STATE — show link button or deep link */}
        {!status?.linked && !linkData && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary mt-3 w-full inline-flex items-center justify-center gap-1.5"
          >
            {generating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading', 'Загрузка...')}</>
            ) : (
              <><Link2 className="w-3.5 h-3.5" /> {t('telegram.connect', 'Привязать Telegram')}</>
            )}
          </button>
        )}

        {/* LINKING IN PROGRESS — show deep link */}
        {!status?.linked && linkData && (
          <div className="mt-3 space-y-3">
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-md p-3">
              <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                {t('telegram.instructions', 'Нажмите на ссылку ниже и отправьте /start боту:')}
              </p>
              {linkData.deepLink ? (
                <a
                  href={linkData.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('telegram.openBot', 'Открыть бот')} @{linkData.botUsername}
                </a>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <p>{t('telegram.manualCode', 'Отправьте этот код боту:')}</p>
                  <code className="mt-2 block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-md font-mono text-sm">
                    /start {linkData.code}
                  </code>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('telegram.waiting', 'Ожидание привязки... Код действует 15 минут.')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramLinkCard;
