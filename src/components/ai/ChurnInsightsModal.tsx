import React, { useEffect, useState } from 'react';
import { X, TrendingDown, Loader2, Phone, Lightbulb, Sparkles } from 'lucide-react';
import { apiAIChurn } from '../../lib/api';

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
      .catch((err) => setError(err?.message || 'Не удалось получить анализ'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-анализ оттока</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Кто в зоне риска, почему и что делать</p>
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
              <p className="text-sm">AI анализирует поведение учеников…</p>
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
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{summary}</p>
                </div>
              )}

              {students.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">Учеников в зоне риска не обнаружено 🎉</div>
              ) : (
                <div className="space-y-3">
                  {students.map((s) => (
                    <div key={s.studentId} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="font-semibold text-slate-900 dark:text-white truncate">{s.studentName}</h4>
                        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${probColor(s.churnProbability)}`}>
                          риск {s.churnProbability}%
                        </span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span><span className="font-medium">Причина:</span> {s.reason}</span>
                        </p>
                        <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span><span className="font-medium">Действие:</span> {s.action}</span>
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
