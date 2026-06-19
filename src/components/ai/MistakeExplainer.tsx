import React, { useState } from 'react';
import { useOrg } from '../../contexts/OrgContext';
import { apiAIExplainMistakes } from '../../lib/api';
import type { QuestionResult } from '../../types';
import { Sparkles, Loader2, Lightbulb, BookOpen } from 'lucide-react';

interface ExplainItem { question: string; why: string; tip: string }

/**
 * Student-facing "explain my mistakes" panel for an exam result.
 * Renders only when the org has AI and there are incorrect answers.
 */
const MistakeExplainer: React.FC<{ questionResults: QuestionResult[] }> = ({ questionResults }) => {
  const { orgData } = useOrg();
  const aiEnabled = orgData?.planId === 'professional' || orgData?.planId === 'enterprise';
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExplainItem[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const incorrect = (questionResults || []).filter((r) => !r.isCorrect);
  if (!aiEnabled || incorrect.length === 0) return null;

  const explain = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = incorrect.slice(0, 30).map((r) => ({
        question: r.questionText,
        studentAnswer: r.studentAnswer,
        correctAnswer: r.correctAnswer,
        isCorrect: r.isCorrect,
      }));
      const res = await apiAIExplainMistakes(payload);
      const d = res?.data || {};
      setSummary(d.summary || '');
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось разобрать ошибки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <h2 className="font-semibold text-slate-900 dark:text-white">Разбор ошибок с AI</h2>
      </div>

      {!items && (
        <div className="text-center py-2">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            AI объяснит {incorrect.length} {incorrect.length === 1 ? 'ошибку' : 'ошибок'} простыми словами и подскажет, как не ошибаться в следующий раз.
          </p>
          <button onClick={explain} disabled={loading} className="btn-primary inline-flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Разбираю…' : 'Разобрать мои ошибки'}
          </button>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>
      )}

      {items && (
        <div className="space-y-4">
          {summary && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 rounded-xl">
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 dark:text-slate-200">{summary}</p>
            </div>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-2">Отличная работа — серьёзных ошибок не найдено!</p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <p className="font-medium text-slate-900 dark:text-white mb-2">{it.question}</p>
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <span>{it.why}</span>
                </p>
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{it.tip}</span>
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MistakeExplainer;
