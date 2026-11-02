import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetAttempt, apiGenerateCertificate } from '../../lib/api';
import type { ExamAttempt } from '../../types';
import MistakeExplainer from '../../components/ai/MistakeExplainer';

import { ArrowLeft, Trophy, XCircle, Clock, Target, Brain, CheckCircle, HelpCircle, RefreshCw, Award, Loader2 } from 'lucide-react';

/**
 * Normalizes aiFeedback that may have been stored as a raw JSON string
 * (double-serialization from Gemini). Ensures it's always a parsed object.
 */
function normalizeAttempt(data: ExamAttempt | null): ExamAttempt | null {
  if (!data) return null;
  if (data.aiFeedback && typeof data.aiFeedback === 'string') {
    try {
      data.aiFeedback = JSON.parse(data.aiFeedback as unknown as string);
    } catch {
      // If parsing fails, wrap the raw string into a valid AIFeedback shape
      data.aiFeedback = {
        summary: data.aiFeedback as unknown as string,
        strengths: [],
        weakTopics: [],
        reviewSuggestions: [],
        generatedAt: '',
        modelUsed: 'unknown',
      };
    }
  }
  return data;
}

const ResultPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [certLoading, setCertLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (attemptId) {
      apiGetAttempt(attemptId).then((data) => {
        setAttempt(normalizeAttempt(data));
        // Start polling for AI feedback if not yet available
        if (data && !data.aiFeedback) {
          startPolling();
        }
      }).finally(() => setLoading(false));
    }
    return () => stopPolling();
  }, [attemptId]);

  const startPolling = () => {
    stopPolling();
    pollCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      // Stop after 6 attempts (30 seconds total)
      if (pollCountRef.current >= 6) {
        stopPolling();
        return;
      }
      if (attemptId) {
        const a = await apiGetAttempt(attemptId);
        if (a) {
          setAttempt(normalizeAttempt(a));
          if (a.aiFeedback) stopPolling();
        }
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Manual retry
  const retryFeedback = async () => {
    if (attemptId) {
      const a = await apiGetAttempt(attemptId);
      setAttempt(normalizeAttempt(a));
      if (a && !a.aiFeedback) {
        startPolling();
      }
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!attempt) return <div className="text-center py-20"><h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('results.notFound')}</h3></div>;

  const mins = Math.floor(attempt.timeSpentSeconds / 60);
  const secs = attempt.timeSpentSeconds % 60;
  const isPolling = pollingRef.current !== null;
  const isViewerStudent = profile?.uid === attempt.studentId;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <button onClick={() => navigate('/my-results')} className="btn-ghost inline-flex items-center gap-1.5 mb-4"><ArrowLeft className="w-3.5 h-3.5" />{t('results.allResults')}</button>

      {/* Score Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 sm:p-6 mb-4 flex flex-col items-center text-center relative overflow-hidden">
        {/* Subtle accent border at top instead of heavy full border */}
        <div className={`absolute top-0 left-0 right-0 h-0.5 w-full ${attempt.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
        
        <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-3 ${attempt.passed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
          {attempt.passed ? <Trophy className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
        </div>
        
        <p className="text-slate-500 dark:text-slate-400 mb-1 text-xs">{attempt.examTitle}</p>
        <h1 className="text-4xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mb-2">{attempt.percentage}%</h1>
        
        <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${attempt.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {attempt.passed ? t('results.passed') : t('results.failed')}
        </span>

        <div className="w-full grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <Target className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{attempt.score}/{attempt.totalPoints}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('results.score')}</p>
          </div>
          <div className="rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{mins}m {secs}s</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('results.timeSpent')}</p>
          </div>
          <div className="rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <CheckCircle className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {attempt.questionResults?.filter((r) => r.isCorrect).length || 0}/{attempt.questionResults?.length || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('results.correct')}</p>
          </div>
        </div>

        {/* Certificate Button */}
        {attempt.passed && (
          <button
            onClick={async () => {
              setCertLoading(true);
              try {
                const cert = await apiGenerateCertificate({ attemptId });
                navigate(`/certificate/${cert.id}`);
              } catch { setCertLoading(false); }
            }}
            disabled={certLoading}
            className="btn-primary mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
          >
            <Award className="w-3.5 h-3.5" />
            {certLoading ? '...' : t('certificate.getCertificate')}
          </button>
        )}
      </div>

      {/* Student-facing AI mistake explainer */}
      {isViewerStudent && attempt.questionResults && (
        <MistakeExplainer questionResults={attempt.questionResults} />
      )}

      {/* AI Feedback (Hidden for students) */}
      {!isViewerStudent && (
        <div className="card p-4 mb-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('results.aiFeedback', 'Анализ ИИ')}</h2>
          </div>
          {attempt.aiFeedback?.modelUsed && (
            <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-mono border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              {attempt.aiFeedback.modelUsed}
            </span>
          )}
        </div>
        {attempt.aiFeedback ? (
          <div className="space-y-3">
            {attempt.aiFeedback.summary && (
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-md p-3 border border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{attempt.aiFeedback.summary}</p>
              </div>
            )}
            
            {/* Category Scores */}
            {attempt.aiFeedback.categoryScores && Object.keys(attempt.aiFeedback.categoryScores).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(attempt.aiFeedback.categoryScores).map(([cat, score], i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                       <h4 className="font-medium text-slate-900 dark:text-slate-100 text-sm">{cat}</h4>
                       <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium
                         ${score.toLowerCase() === 'excellent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                           score.toLowerCase() === 'good' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                           score.toLowerCase() === 'average' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                           'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`
                       }>
                         {score}
                       </span>
                    </div>
                    {attempt.aiFeedback?.categoryInsights?.[cat] && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{attempt.aiFeedback?.categoryInsights?.[cat]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {attempt.aiFeedback.strengths?.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <span className="text-xs">💪</span>
                  {t('results.strengths', 'Сильные стороны')}
                </h3>
                <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 pl-1">
                  {attempt.aiFeedback.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.weakTopics?.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <span className="text-xs">📚</span>
                  {t('results.areasToImprove', 'Слабые места')}
                </h3>
                <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 pl-1">
                  {attempt.aiFeedback.weakTopics.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.reviewSuggestions?.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <span className="text-xs">📝</span>
                  {t('results.whatToReview', 'Что повторить')}
                </h3>
                <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 pl-1">
                  {attempt.aiFeedback.reviewSuggestions.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.teacherNotes && (
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
                  <span className="text-xs">👩‍🏫</span> {t('results.teacherNotes', 'Заметки для преподавателя')}
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{attempt.aiFeedback.teacherNotes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            {isPolling ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary-600 dark:text-primary-400 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('results.aiGenerating', 'ИИ анализирует ваши ответы...')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('results.aiWait', 'Обычно это занимает 10-20 секунд')}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center">
                  <Brain className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('results.aiNotReady', 'Отчёт ИИ ещё не готов')}</p>
                <button onClick={retryFeedback} className="btn-secondary inline-flex items-center gap-1.5 mx-auto">
                  <RefreshCw className="w-3.5 h-3.5" />{t('common.refresh', 'Обновить')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Question Results (Hidden for students) */}
      {!isViewerStudent && attempt.questionResults && attempt.questionResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{t('results.questionBreakdown', 'Разбор вопросов')}</h3>
          </div>
          <div className="p-3 space-y-2">
            {attempt.questionResults.map((qr, i) => (
              <div key={i} className={`relative overflow-hidden rounded-lg border p-3 transition-colors ${
                qr.status === 'correct' ? 'border-slate-200 dark:border-slate-700' :
                qr.status === 'incorrect' ? 'border-slate-200 dark:border-slate-700' :
                'border-slate-200 dark:border-slate-700'
              }`}>
                {/* Left Side Indicator */}
                <div className={`absolute top-0 bottom-0 left-0 w-0.5 ${
                  qr.status === 'correct' ? 'bg-emerald-500' :
                  qr.status === 'incorrect' ? 'bg-red-500' :
                  'bg-amber-500'
                }`} />
                
                <div className="flex items-start justify-between gap-3 pl-1">
                  <div className="flex-1">
                    <div className="flex items-start gap-2 mb-2">
                      {qr.status === 'correct' && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
                      {qr.status === 'incorrect' && <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
                      {qr.status === 'pending_review' && <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                      <span className="font-medium text-slate-900 dark:text-slate-100 text-sm leading-snug">Q{i + 1}: {qr.questionText}</span>
                    </div>
                    <div className="ml-5 text-sm space-y-1">
                      <p className="text-slate-600 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">{t('results.yourAnswer', 'Ваш ответ')}:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : qr.studentAnswer || `(${t('results.noAnswer', 'Нет ответа')})`}</span>
                      </p>
                      {qr.status !== 'correct' && qr.status !== 'pending_review' && (
                        <p className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-md inline-block">
                          <span className="opacity-80">{t('results.correctAnswer', 'Верный ответ')}:</span> <span className="font-semibold">{Array.isArray(qr.correctAnswer) ? qr.correctAnswer.join(', ') : qr.correctAnswer}</span>
                        </p>
                      )}
                      {qr.status === 'pending_review' && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('results.pendingReview', 'Ожидает проверки')}</span>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums shrink-0 ${
                     qr.status === 'correct' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                     qr.status === 'incorrect' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}>
                    {qr.pointsEarned}/{qr.pointsPossible}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultPage;
