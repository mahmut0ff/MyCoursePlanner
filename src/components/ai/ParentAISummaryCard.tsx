import React, { useState } from 'react';
import { apiGetParentAISummary } from '../../lib/api';
import { Sparkles, Loader2, Lightbulb } from 'lucide-react';

/** Parent-facing AI progress summary, generated on demand from the portal token. */
const ParentAISummaryCard: React.FC<{ token: string }> = ({ token }) => {
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
        setError('Сводка пока недоступна. Попробуйте позже.');
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось получить сводку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-сводка об успехах</h2>
      </div>

      <div className="p-6">
        {!summary && (
          <div className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Получите краткий понятный обзор успехов ребёнка и рекомендации — на основе оценок, заданий и активности.
            </p>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Готовлю сводку…' : 'Показать AI-сводку'}
            </button>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>
        )}

        {summary && (
          <div className="space-y-4">
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{summary}</p>
            {recs.length > 0 && (
              <div className="space-y-2">
                {recs.map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 rounded-xl">
                    <Lightbulb className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
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
