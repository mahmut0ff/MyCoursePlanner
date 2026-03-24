import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetAttempt, apiGenerateCertificate } from '../../lib/api';
import type { ExamAttempt } from '../../types';

import { ArrowLeft, Trophy, XCircle, Clock, Target, Brain, CheckCircle, HelpCircle, RefreshCw, Award } from 'lucide-react';

const ResultPage: React.FC = () => {
  const { t } = useTranslation();
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [certLoading, setCertLoading] = useState(false);

  useEffect(() => {
    if (attemptId) {
      apiGetAttempt(attemptId).then(setAttempt).finally(() => setLoading(false));
    }
  }, [attemptId]);

  // Retry loading AI feedback if not available yet
  const retryFeedback = async () => {
    if (attemptId) {
      const a = await apiGetAttempt(attemptId);
      setAttempt(a);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;
  if (!attempt) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('results.notFound')}</h3></div>;

  const mins = Math.floor(attempt.timeSpentSeconds / 60);
  const secs = attempt.timeSpentSeconds % 60;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/my-results')} className="btn-ghost flex items-center gap-2 mb-6"><ArrowLeft className="w-4 h-4" />{t('results.allResults')}</button>

      {/* Score Card */}
      <div className={`card p-8 mb-6 text-center ${attempt.passed ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'} border-2`}>
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${attempt.passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
          {attempt.passed ? <Trophy className="w-10 h-10 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-10 h-10 text-red-500 dark:text-red-400" />}
        </div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-1">{attempt.percentage}%</h1>
        <p className={`text-lg font-medium ${attempt.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {attempt.passed ? t('results.passed') : t('results.failed')}
        </p>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{attempt.examTitle}</p>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div>
            <Target className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{attempt.score}/{attempt.totalPoints}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('results.score')}</p>
          </div>
          <div>
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{mins}m {secs}s</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('results.timeSpent')}</p>
          </div>
          <div>
            <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {attempt.questionResults?.filter((r) => r.isCorrect).length || 0}/{attempt.questionResults?.length || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('results.correct')}</p>
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
            className="mt-5 inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Award className="w-5 h-5" />
            {certLoading ? '...' : t('certificate.getCertificate')}
          </button>
        )}
      </div>

      {/* AI Feedback */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('results.aiFeedback')}</h2>
        </div>
        {attempt.aiFeedback ? (
          <div className="space-y-4">
            {attempt.aiFeedback.summary && (
              <p className="text-slate-700 dark:text-slate-300">{attempt.aiFeedback.summary}</p>
            )}
            {attempt.aiFeedback.strengths?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">💪 {t('results.strengths')}</h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">{attempt.aiFeedback.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
              </div>
            )}
            {attempt.aiFeedback.weakTopics?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">📚 {t('results.areasToImprove')}</h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">{attempt.aiFeedback.weakTopics.map((w, i) => <li key={i}>• {w}</li>)}</ul>
              </div>
            )}
            {attempt.aiFeedback.reviewSuggestions?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-primary-700 dark:text-primary-400 mb-1">📝 {t('results.whatToReview')}</h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">{attempt.aiFeedback.reviewSuggestions.map((r, i) => <li key={i}>• {r}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">{t('results.aiGenerating')}</p>
            <button onClick={retryFeedback} className="btn-ghost text-sm flex items-center gap-1 mx-auto">
              <RefreshCw className="w-3.5 h-3.5" />{t('common.refresh')}
            </button>
          </div>
        )}
      </div>

      {/* Question Results */}
      {attempt.questionResults && attempt.questionResults.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50"><h3 className="font-semibold text-slate-900 dark:text-white">{t('results.questionBreakdown')}</h3></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {attempt.questionResults.map((qr, i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {qr.status === 'correct' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {qr.status === 'incorrect' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      {qr.status === 'pending_review' && <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className="font-medium text-slate-900 dark:text-white text-sm">Q{i + 1}: {qr.questionText}</span>
                    </div>
                    <div className="ml-6 text-sm space-y-1">
                      <p className="text-slate-600 dark:text-slate-400">{t('results.yourAnswer')}: <span className="font-medium">{Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : qr.studentAnswer || `(${t('results.noAnswer')})`}</span></p>
                      {qr.status !== 'correct' && qr.status !== 'pending_review' && (
                        <p className="text-emerald-600 dark:text-emerald-400">{t('results.correctAnswer')}: <span className="font-medium">{Array.isArray(qr.correctAnswer) ? qr.correctAnswer.join(', ') : qr.correctAnswer}</span></p>
                      )}
                      {qr.status === 'pending_review' && <span className="badge-yellow text-xs">{t('results.pendingReview')}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{qr.pointsEarned}/{qr.pointsPossible}</span>
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

