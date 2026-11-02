import React, { useEffect, useState } from 'react';
import { X, CalendarClock, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { apiAIScheduleReview } from '../../lib/api';
import { useTranslation } from 'react-i18next';

interface Issue { type: string; detail: string; suggestion: string }

const TYPE_CFG: Record<string, { key: string; label: string; cls: string }> = {
  conflict: { key: 'ai.scheduleReview.typeConflict', label: 'Накладка', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  overload: { key: 'ai.scheduleReview.typeOverload', label: 'Перегрузка', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  gap: { key: 'ai.scheduleReview.typeGap', label: 'Окно', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  balance: { key: 'ai.scheduleReview.typeBalance', label: 'Баланс', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  other: { key: 'ai.scheduleReview.typeOther', label: 'Прочее', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

const ScheduleReviewModal: React.FC<{ open: boolean; onClose: () => void; events: any[] }> = ({ open, onClose, events }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setIssues([]);
    setSummary('');
    apiAIScheduleReview(events)
      .then((res) => {
        const d = res?.data || {};
        setSummary(d.summary || '');
        setIssues(Array.isArray(d.issues) ? d.issues : []);
      })
      .catch((err) => setError(err?.message || t('ai.scheduleReview.error', 'Не удалось проанализировать расписание')))
      .finally(() => setLoading(false));
  }, [open, events]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300 flex items-center justify-center">
              <CalendarClock className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.scheduleReview.title', 'AI-анализ расписания')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('ai.scheduleReview.subtitle', 'Накладки, перегрузки и рекомендации')}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close', 'Закрыть')} className="-mt-1 -mr-1 w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 pt-2 pb-4 overflow-y-auto space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">{t('ai.scheduleReview.loading', 'AI проверяет расписание…')}</p>
            </div>
          )}

          {!loading && error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-400">{error}</div>
          )}

          {!loading && !error && (
            <>
              {summary && (
                <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-md">
                  <Sparkles className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700 dark:text-slate-200">{summary}</p>
                </div>
              )}
              {issues.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">{t('ai.scheduleReview.empty', 'Проблем не найдено — расписание выглядит сбалансированным 👍')}</div>
              ) : (
                <div className="space-y-3">
                  {issues.map((it, i) => {
                    const cfg = TYPE_CFG[it.type] || TYPE_CFG.other;
                    return (
                      <div key={i} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${cfg.cls}`}>{t(cfg.key, cfg.label)}</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-200 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> {it.detail}
                        </p>
                        <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1.5 pl-5.5">→ {it.suggestion}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScheduleReviewModal;
