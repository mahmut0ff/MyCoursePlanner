import React, { useEffect, useState } from 'react';
import { X, TrendingDown, Loader2, Phone, Lightbulb, Sparkles } from 'lucide-react';
import { apiAIChurn } from '../../lib/api';
import { useTranslation } from 'react-i18next';

interface ChurnStudent {
  studentId: string;
  studentName: string;
  churnProbability: number;
  reason: string;
  action: string;
}

const probColor = (p: number) =>
  p >= 70 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  : p >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';

const ChurnInsightsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [students, setStudents] = useState<ChurnStudent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setStudents([]);
    setSummary('');
    apiAIChurn()
      .then((res) => {
        const data = res?.data || {};
        setSummary(data.summary || '');
        setStudents(Array.isArray(data.students) ? data.students : []);
      })
      .catch((err) => setError(err?.message || t('ai.churn.loadError', 'Не удалось получить анализ')))
      .finally(() => setLoading(false));
  }, [open, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.churn.title', 'AI-анализ оттока')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('ai.churn.subtitle', 'Кто в зоне риска, почему и что делать')}</p>
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
              <p className="text-sm">{t('ai.churn.loading', 'AI анализирует поведение учеников…')}</p>
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
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{summary}</p>
                </div>
              )}

              {students.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">{t('ai.churn.empty', 'Учеников в зоне риска не обнаружено 🎉')}</div>
              ) : (
                <div className="space-y-3">
                  {students.map((s) => (
                    <div key={s.studentId} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{s.studentName}</h4>
                        <span className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums ${probColor(s.churnProbability)}`}>
                          {t('ai.churn.risk', 'риск {{pct}}%', { pct: s.churnProbability })}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span><span className="font-medium">{t('ai.churn.reason', 'Причина:')}</span> {s.reason}</span>
                        </p>
                        <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span><span className="font-medium">{t('ai.churn.action', 'Действие:')}</span> {s.action}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChurnInsightsModal;
