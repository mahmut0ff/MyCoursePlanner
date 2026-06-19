import React, { useEffect, useState } from 'react';
import { X, CalendarClock, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { apiAIScheduleReview } from '../../lib/api';

interface Issue { type: string; detail: string; suggestion: string }

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  conflict: { label: 'Накладка', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  overload: { label: 'Перегрузка', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  gap: { label: 'Окно', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  balance: { label: 'Баланс', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  other: { label: 'Прочее', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const ScheduleReviewModal: React.FC<{ open: boolean; onClose: () => void; events: any[] }> = ({ open, onClose, events }) => {
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
      .catch((err) => setError(err?.message || 'Не удалось проанализировать расписание'))
      .finally(() => setLoading(false));
  }, [open, events]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-анализ расписания</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Накладки, перегрузки и рекомендации</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">AI проверяет расписание…</p>
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>
          )}

          {!loading && !error && (
            <>
              {summary && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 rounded-xl">
                  <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700 dark:text-slate-200">{summary}</p>
                </div>
              )}
              {issues.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">Проблем не найдено — расписание выглядит сбалансированным 👍</div>
              ) : (
                <div className="space-y-3">
                  {issues.map((it, i) => {
                    const cfg = TYPE_CFG[it.type] || TYPE_CFG.other;
                    return (
                      <div key={i} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${cfg.cls}`}>{cfg.label}</span>
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
