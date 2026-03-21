import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAttempt } from '../../services/attempts.service';
import type { ExamAttempt } from '../../types';

import { ArrowLeft, Trophy, XCircle, Clock, Target, Brain, CheckCircle, HelpCircle, RefreshCw } from 'lucide-react';

const ResultPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (attemptId) {
      getAttempt(attemptId).then(setAttempt).finally(() => setLoading(false));
    }
  }, [attemptId]);

  // Retry loading AI feedback if not available yet
  const retryFeedback = async () => {
    if (attemptId) {
      const a = await getAttempt(attemptId);
      setAttempt(a);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!attempt) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700">Result not found</h3></div>;

  const mins = Math.floor(attempt.timeSpentSeconds / 60);
  const secs = attempt.timeSpentSeconds % 60;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/results')} className="btn-ghost flex items-center gap-2 mb-6"><ArrowLeft className="w-4 h-4" />All Results</button>

      {/* Score Card */}
      <div className={`card p-8 mb-6 text-center ${attempt.passed ? 'border-emerald-200' : 'border-red-200'} border-2`}>
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${attempt.passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
          {attempt.passed ? <Trophy className="w-10 h-10 text-emerald-600" /> : <XCircle className="w-10 h-10 text-red-500" />}
        </div>
        <h1 className="text-4xl font-bold mb-1">{attempt.percentage}%</h1>
        <p className={`text-lg font-medium ${attempt.passed ? 'text-emerald-600' : 'text-red-600'}`}>
          {attempt.passed ? 'PASSED' : 'FAILED'}
        </p>
        <p className="text-slate-500 mt-1">{attempt.examTitle}</p>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div>
            <Target className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900">{attempt.score}/{attempt.totalPoints}</p>
            <p className="text-xs text-slate-500">Score</p>
          </div>
          <div>
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900">{mins}m {secs}s</p>
            <p className="text-xs text-slate-500">Time Spent</p>
          </div>
          <div>
            <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-slate-900">
              {attempt.questionResults?.filter((r) => r.isCorrect).length || 0}/{attempt.questionResults?.length || 0}
            </p>
            <p className="text-xs text-slate-500">Correct</p>
          </div>
        </div>
      </div>

      {/* AI Feedback */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-slate-900">AI Feedback</h2>
        </div>
        {attempt.aiFeedback ? (
          <div className="space-y-4">
            {attempt.aiFeedback.summary && (
              <p className="text-slate-700">{attempt.aiFeedback.summary}</p>
            )}
            {attempt.aiFeedback.strengths?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-emerald-700 mb-1">💪 Strengths</h3>
                <ul className="text-sm text-slate-600 space-y-1">{attempt.aiFeedback.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
              </div>
            )}
            {attempt.aiFeedback.weakTopics?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-amber-700 mb-1">📚 Areas to Improve</h3>
                <ul className="text-sm text-slate-600 space-y-1">{attempt.aiFeedback.weakTopics.map((w, i) => <li key={i}>• {w}</li>)}</ul>
              </div>
            )}
            {attempt.aiFeedback.reviewSuggestions?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-primary-700 mb-1">📝 What to Review</h3>
                <ul className="text-sm text-slate-600 space-y-1">{attempt.aiFeedback.reviewSuggestions.map((r, i) => <li key={i}>• {r}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-slate-500 text-sm mb-2">AI feedback is being generated...</p>
            <button onClick={retryFeedback} className="btn-ghost text-sm flex items-center gap-1 mx-auto">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </button>
          </div>
        )}
      </div>

      {/* Question Results */}
      {attempt.questionResults && attempt.questionResults.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Question Breakdown</h3></div>
          <div className="divide-y">
            {attempt.questionResults.map((qr, i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {qr.status === 'correct' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {qr.status === 'incorrect' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      {qr.status === 'pending_review' && <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className="font-medium text-slate-900 text-sm">Q{i + 1}: {qr.questionText}</span>
                    </div>
                    <div className="ml-6 text-sm space-y-1">
                      <p className="text-slate-600">Your answer: <span className="font-medium">{Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : qr.studentAnswer || '(no answer)'}</span></p>
                      {qr.status !== 'correct' && qr.status !== 'pending_review' && (
                        <p className="text-emerald-600">Correct: <span className="font-medium">{Array.isArray(qr.correctAnswer) ? qr.correctAnswer.join(', ') : qr.correctAnswer}</span></p>
                      )}
                      {qr.status === 'pending_review' && <span className="badge-yellow text-xs">Pending Review</span>}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-slate-500">{qr.pointsEarned}/{qr.pointsPossible}</span>
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
