import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetParentAISummary } from '../../lib/api';
import { Sparkles, Loader2, Lightbulb } from 'lucide-react';

/** Parent-facing AI progress summary, generated on demand from the portal token. */
const ParentAISummaryCard: React.FC<{ token: string }> = ({ token }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiGetParentAISummary(token);
      if (res.summary) {
        setSummary(res.summary);
        setRecs(Array.isArray(res.recommendations) ? res.recommendations : []);
      } else {
        setError(t('ai.parentSummary.unavailable', 'Сводка пока недоступна. Попробуйте позже.'));
      }
    } catch (err: any) {
      setError(err?.message || t('ai.parentSummary.error', 'Не удалось получить сводку'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.parentSummary.title', 'AI-сводка об успехах')}</h2>
      </div>

      <div className="p-4">
        {!summary && (
          <div className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t('ai.parentSummary.intro', 'Получите краткий понятный обзор успехов ребёнка и рекомендации — на основе оценок, заданий и активности.')}
            </p>
            <button
              onClick={load}
              disabled={loading}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? t('ai.parentSummary.loading', 'Готовлю сводку…') : t('ai.parentSummary.cta', 'Показать AI-сводку')}
            </button>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{summary}</p>
            {recs.length > 0 && (
              <div className="space-y-2">
                {recs.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700 dark:text-slate-200">{r}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentAISummaryCard;
