import { useTranslation } from 'react-i18next';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMySupportThread } from '../../lib/useSupport';
import SupportChatPane from '../../components/support/SupportChatPane';

/**
 * The user side of the support desk: one persistent conversation, no ticket
 * form. The thread doc doesn't exist until the first message is sent, which is
 * why nothing here blocks on `thread` — the composer is live from the start and
 * `api-support` creates the thread on that first send.
 */
export default function SupportPage() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const { thread } = useMySupportThread();

  if (!firebaseUser) return null;

  const isClosed = thread?.status === 'closed';

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[28rem] flex flex-col">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <LifeBuoy className="w-6 h-6 text-primary-500" />
          {t('support.title', 'Поддержка')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {t('support.subtitle', 'Задайте вопрос команде SabakHub — можно приложить скриншот или видео.')}
        </p>
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200
        dark:border-slate-700 shadow-sm">
        <SupportChatPane
          threadId={firebaseUser.uid}
          uploadUserId={firebaseUser.uid}
          viewerSide="user"
          canDeleteAny={false}
          composerPlaceholder={t('support.placeholderUser', 'Опишите вопрос или проблему…')}
          header={
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200
              dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="p-2 rounded-full bg-primary-50 dark:bg-primary-900/40">
                <ShieldCheck className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('support.teamName', 'Поддержка SabakHub')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {isClosed
                    ? t('support.threadClosedHint', 'Обращение закрыто — напишите, чтобы открыть снова')
                    : t('support.responseTime', 'Обычно отвечаем в течение рабочего дня')}
                </div>
              </div>
            </div>
          }
          emptyState={
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="p-3.5 rounded-full bg-primary-50 dark:bg-primary-900/30">
                <LifeBuoy className="w-8 h-8 text-primary-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('support.emptyTitle', 'Чем можем помочь?')}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  {t('support.emptyBody', 'Опишите вопрос своими словами. Скриншот или короткое видео экрана помогут разобраться быстрее.')}
                </p>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
