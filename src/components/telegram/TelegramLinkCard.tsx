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
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 animate-pulse">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-40" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <MessageCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              {t('telegram.title', 'Telegram-уведомления')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('telegram.subtitle', 'Оценки, ДЗ и оплата — прямо в Telegram')}
            </p>
          </div>
        </div>

        {/* LINKED STATE */}
        {status?.linked && (
          <div className="mt-3">
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                {t('telegram.linked', 'Telegram привязан. Уведомления включены.')}
              </p>
            </div>
            <button
              onClick={handleUnlink}
              className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 transition-colors"
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
            className="mt-3 w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading', 'Загрузка...')}</>
            ) : (
              <><Link2 className="w-4 h-4" /> {t('telegram.connect', 'Привязать Telegram')}</>
            )}
          </button>
        )}

        {/* LINKING IN PROGRESS — show deep link */}
        {!status?.linked && linkData && (
          <div className="mt-3 space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
                {t('telegram.instructions', 'Нажмите на ссылку ниже и отправьте /start боту:')}
              </p>
              {linkData.deepLink ? (
                <a
                  href={linkData.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('telegram.openBot', 'Открыть бот')} @{linkData.botUsername}
                </a>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <p>{t('telegram.manualCode', 'Отправьте этот код боту:')}</p>
                  <code className="mt-2 block bg-slate-100 dark:bg-slate-900 px-3 py-2 rounded-lg font-mono text-lg tracking-wider">
                    /start {linkData.code}
                  </code>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <p className="text-xs text-slate-500">
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
