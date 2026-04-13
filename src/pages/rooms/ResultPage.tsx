import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetAttempt, apiGenerateCertificate } from '../../lib/api';
import type { ExamAttempt } from '../../types';

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;
  if (!attempt) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('results.notFound')}</h3></div>;

  const mins = Math.floor(attempt.timeSpentSeconds / 60);
  const secs = attempt.timeSpentSeconds % 60;
  const isPolling = pollingRef.current !== null;
  const isViewerStudent = profile?.uid === attempt.studentId;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <button onClick={() => navigate('/my-results')} className="btn-ghost flex items-center gap-2 mb-6"><ArrowLeft className="w-4 h-4" />{t('results.allResults')}</button>

      {/* Score Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-10 mb-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
        {/* Subtle accent border at top instead of heavy full border */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 w-full ${attempt.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
        
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5 ${attempt.passed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'}`}>
          {attempt.passed ? <Trophy className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
        </div>
        
        <p className="text-slate-500 dark:text-slate-400 font-medium mb-1 uppercase tracking-wider text-xs">{attempt.examTitle}</p>
        <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">{attempt.percentage}%</h1>
        
        <span className={`px-4 py-1.5 rounded-full text-sm font-bold tracking-wide uppercase ${attempt.passed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {attempt.passed ? t('results.passed') : t('results.failed')}
        </span>

        <div className="w-full grid grid-cols-3 gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/60">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/30">
            <Target className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
            <p className="text-xl font-bold text-slate-900 dark:text-white">{attempt.score}/{attempt.totalPoints}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mt-0.5">{t('results.score')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/30">
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-2" />
            <p className="text-xl font-bold text-slate-900 dark:text-white">{mins}m {secs}s</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mt-0.5">{t('results.timeSpent')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/30">
            <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {attempt.questionResults?.filter((r) => r.isCorrect).length || 0}/{attempt.questionResults?.length || 0}
            </p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mt-0.5">{t('results.correct')}</p>
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
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Award className="w-5 h-5" />
            {certLoading ? '...' : t('certificate.getCertificate')}
          </button>
        )}
      </div>

      {/* AI Feedback (Hidden for students) */}
      {!isViewerStudent && (
        <div className="card p-6 mb-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('results.aiFeedback', 'Анализ ИИ')}</h2>
          </div>
          {attempt.aiFeedback?.modelUsed && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {attempt.aiFeedback.modelUsed}
            </span>
          )}
        </div>
        {attempt.aiFeedback ? (
          <div className="space-y-5">
            {attempt.aiFeedback.summary && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{attempt.aiFeedback.summary}</p>
              </div>
            )}
            
            {/* Category Scores */}
            {attempt.aiFeedback.categoryScores && Object.keys(attempt.aiFeedback.categoryScores).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(attempt.aiFeedback.categoryScores).map(([cat, score], i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                       <h4 className="font-bold text-slate-900 dark:text-white text-sm">{cat}</h4>
                       <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide
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
              <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-xs shadow-sm">💪</span>
                  {t('results.strengths', 'Сильные стороны')}
                </h3>
                <ul className="text-sm text-emerald-900/80 dark:text-emerald-200/80 space-y-2 pl-1">
                  {attempt.aiFeedback.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.weakTopics?.length > 0 && (
              <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-xs shadow-sm">📚</span>
                  {t('results.areasToImprove', 'Слабые места')}
                </h3>
                <ul className="text-sm text-amber-900/80 dark:text-amber-200/80 space-y-2 pl-1">
                  {attempt.aiFeedback.weakTopics.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.reviewSuggestions?.length > 0 && (
              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs shadow-sm">📝</span>
                  {t('results.whatToReview', 'Что повторить')}
                </h3>
                <ul className="text-sm text-indigo-900/80 dark:text-indigo-200/80 space-y-2 pl-1">
                  {attempt.aiFeedback.reviewSuggestions.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {attempt.aiFeedback.teacherNotes && (
              <div className="mt-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200/50 dark:border-indigo-800/50">
                <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-1 flex items-center gap-1.5">
                  <span className="text-xs">👩‍🏫</span> {t('results.teacherNotes', 'Заметки для преподавателя')}
                </h3>
                <p className="text-sm text-indigo-600 dark:text-indigo-300">{attempt.aiFeedback.teacherNotes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            {isPolling ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-violet-600 dark:text-violet-400 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('results.aiGenerating', 'ИИ анализирует ваши ответы...')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('results.aiWait', 'Обычно это занимает 10-20 секунд')}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('results.aiNotReady', 'Отчёт ИИ ещё не готов')}</p>
                <button onClick={retryFeedback} className="btn-ghost text-sm flex items-center gap-1.5 mx-auto">
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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
            <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wide text-sm">{t('results.questionBreakdown', 'Разбор вопросов')}</h3>
          </div>
          <div className="p-4 sm:p-6 space-y-4 bg-slate-50/30 dark:bg-slate-900/20">
            {attempt.questionResults.map((qr, i) => (
              <div key={i} className={`relative overflow-hidden rounded-xl border p-4 sm:p-5 transition-colors ${
                qr.status === 'correct' ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/40' :
                qr.status === 'incorrect' ? 'bg-red-50/50 border-red-100 dark:bg-red-900/20 dark:border-red-800/40' :
                'bg-amber-50/50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/40'
              }`}>
                {/* Left Side Indicator */}
                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                  qr.status === 'correct' ? 'bg-emerald-500' :
                  qr.status === 'incorrect' ? 'bg-red-500' :
                  'bg-amber-500'
                }`} />
                
                <div className="flex items-start justify-between gap-4 pl-2">
                  <div className="flex-1">
                    <div className="flex items-start gap-2 mb-3">
                      {qr.status === 'correct' && <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
                      {qr.status === 'incorrect' && <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
                      {qr.status === 'pending_review' && <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                      <span className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">Q{i + 1}: {qr.questionText}</span>
                    </div>
                    <div className="ml-7 text-sm space-y-1.5 opacity-90">
                      <p className="text-slate-600 dark:text-slate-300">
                        <span className="opacity-75">{t('results.yourAnswer', 'Ваш ответ')}:</span> <span className="font-semibold text-slate-900 dark:text-white">{Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : qr.studentAnswer || `(${t('results.noAnswer', 'Нет ответа')})`}</span>
                      </p>
                      {qr.status !== 'correct' && qr.status !== 'pending_review' && (
                        <p className="text-emerald-700 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/30 px-2.5 py-1.5 rounded-lg inline-block mt-1">
                          <span className="opacity-80">{t('results.correctAnswer', 'Верный ответ')}:</span> <span className="font-semibold">{Array.isArray(qr.correctAnswer) ? qr.correctAnswer.join(', ') : qr.correctAnswer}</span>
                        </p>
                      )}
                      {qr.status === 'pending_review' && <span className="inline-block mt-1 px-2.5 py-1 text-xs font-bold bg-amber-200 text-amber-800 rounded-lg">{t('results.pendingReview', 'Ожидает проверки')}</span>}
                    </div>
                  </div>
                  <span className={`text-sm sm:text-base font-bold shrink-0 px-3 py-1 rounded-lg ${
                     qr.status === 'correct' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300' :
                     qr.status === 'incorrect' ? 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300' :
                     'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300'
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
