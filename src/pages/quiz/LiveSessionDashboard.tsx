import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToSession, subscribeToParticipants, subscribeToAllAnswers } from '../../services/quiz.service';
import {
  apiStartQuizSession, apiNextQuestion, apiPauseQuizSession,
  apiResumeQuizSession, apiEndQuizSession, apiKickParticipant,
  apiLockQuizSession, apiUnlockQuizSession, apiGetQuizSession,
  apiRestartQuizSession
} from '../../lib/api';
import type { QuizSession, SessionParticipant, SessionAnswer } from '../../types';
import {
  Play, Pause, SkipForward, Square, Copy, CheckCircle, Users,
  Lock, Unlock, UserMinus, Radio, BarChart3, ArrowLeft,
  Trophy, Zap, Clock, RefreshCw, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

const LiveSessionDashboard: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    // Fetch full session data (with current question)
    apiGetQuizSession(sessionId).then((data: any) => {
      setCurrentQuestion(data.currentQuestion);
    }).catch(() => {});

    // Real-time subscriptions
    const unsubSession = subscribeToSession(sessionId, setSession);
    const unsubParts = subscribeToParticipants(sessionId, setParticipants);
    const unsubAnswers = subscribeToAllAnswers(sessionId, setAnswers);

    return () => { unsubSession(); unsubParts(); unsubAnswers(); };
  }, [sessionId]);

  // Refetch current question when session.currentQuestionIndex changes
  useEffect(() => {
    if (sessionId && session && (session.status === 'in_progress' || session.status === 'paused')) {
      apiGetQuizSession(sessionId).then((data: any) => {
        setCurrentQuestion(data.currentQuestion);
      }).catch(() => {});
    }
  }, [session?.currentQuestionIndex]);

  const doAction = async (fn: () => Promise<any>, name: string) => {
    setActionLoading(name);
    try { await fn(); } catch (e: any) { toast.error(e.message || t('common.error')); }
    finally { setActionLoading(''); }
  };

  const handleCopy = () => {
    if (session?.code) {
      navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnd = () => {
    if (!confirm(t('quiz.endConfirm'))) return;
    doAction(() => apiEndQuizSession(sessionId!), 'end');
  };

  if (!session) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  const isLobby = session.status === 'lobby';
  const isPlaying = session.status === 'in_progress';
  const isPaused = session.status === 'paused';
  const isCompleted = session.status === 'completed';
  const currentQAnswers = answers.filter(a => currentQuestion && a.questionId === currentQuestion.id);
  const answeredCount = currentQAnswers.length;
  const correctCount = currentQAnswers.filter(a => a.isCorrect).length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/sessions')} className="btn-ghost p-2"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{session.quizTitle}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Radio className={`w-3 h-3 ${isPlaying ? 'text-emerald-500 animate-pulse' : isPaused ? 'text-amber-500' : isCompleted ? 'text-slate-400' : 'text-blue-500'}`} />
              <span className={`text-xs font-medium ${isPlaying ? 'text-emerald-600' : isPaused ? 'text-amber-600' : isCompleted ? 'text-slate-500' : 'text-blue-600'}`}>
                {session.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        {isCompleted && (
          <button onClick={() => navigate(`/quiz/analytics/${sessionId}`)} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />{t('quiz.viewAnalytics')}
          </button>
        )}
      </div>

      {/* Join Code Card */}
      {(isLobby || isPlaying || isPaused) && (
        <div className="card p-6 mb-4 text-center bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border-primary-200 dark:border-primary-800">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('quiz.joinCode')}</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-bold tracking-[0.3em] text-primary-600 dark:text-primary-400 font-mono">{session.code}</span>
            <button onClick={handleCopy} className="btn-ghost p-2">
              {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5 text-slate-400" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{t('quiz.shareCodeHint')}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isLobby && (
          <button onClick={() => doAction(() => apiStartQuizSession(sessionId!), 'start')} disabled={!!actionLoading || participants.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors">
            <Play className="w-4 h-4" />{t('quiz.startGame')}
          </button>
        )}
        {isPlaying && (
          <>
            <button onClick={() => doAction(() => apiNextQuestion(sessionId!), 'next')} disabled={!!actionLoading}
              className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
              <SkipForward className="w-4 h-4" />
              {session.currentQuestionIndex + 1 >= session.totalQuestions ? t('quiz.finish') : t('quiz.nextQuestion')}
            </button>
            <button onClick={() => doAction(() => apiPauseQuizSession(sessionId!), 'pause')} disabled={!!actionLoading}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
              <Pause className="w-4 h-4" />{t('quiz.pause')}
            </button>
          </>
        )}
        {isPaused && (
          <button onClick={() => doAction(() => apiResumeQuizSession(sessionId!), 'resume')} disabled={!!actionLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            <Play className="w-4 h-4" />{t('quiz.resume')}
          </button>
        )}
        {(isPlaying || isPaused) && (
          <button onClick={handleEnd} disabled={!!actionLoading}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            <Square className="w-4 h-4" />{t('quiz.endGame')}
          </button>
        )}
        {isCompleted && (
          <button onClick={() => doAction(() => apiRestartQuizSession(sessionId!), 'restart')} disabled={!!actionLoading}
            className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className="w-4 h-4" />{t('quiz.restart')}
          </button>
        )}
        {(isLobby || isPaused) && (
          <button onClick={() => doAction(() => (session as any).locked ? apiUnlockQuizSession(sessionId!) : apiLockQuizSession(sessionId!), 'lock')}
            className="btn-ghost text-xs flex items-center gap-1.5">
            {(session as any).locked ? <><Unlock className="w-3.5 h-3.5" />{t('quiz.unlock')}</> : <><Lock className="w-3.5 h-3.5" />{t('quiz.lock')}</>}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current Question + Stats */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress */}
          {(isPlaying || isPaused || isCompleted) && (
            <div className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-medium text-slate-500">{t('quiz.progress')}</p>
                <p className="text-xs text-slate-400">
                  {Math.min(session.currentQuestionIndex + 1, session.totalQuestions)} / {session.totalQuestions}
                </p>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div className="bg-primary-500 h-2 rounded-full transition-all duration-500" style={{ width: `${((session.currentQuestionIndex + 1) / session.totalQuestions) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Current Question Display */}
          {currentQuestion && (isPlaying || isPaused) && (
            <div className="card p-5">
              <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Q{session.currentQuestionIndex + 1} — {currentQuestion.type?.replace('_', ' ')}</p>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">{currentQuestion.text}</h2>
              {/* Answer stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-lg font-bold text-primary-600">{answeredCount}</p>
                  <p className="text-[10px] text-slate-400">{t('quiz.answered')}</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-lg font-bold text-emerald-600">{correctCount}</p>
                  <p className="text-[10px] text-slate-400">{t('quiz.correct')}</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-lg font-bold text-amber-600">{participants.length - answeredCount}</p>
                  <p className="text-[10px] text-slate-400">{t('quiz.waiting')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Final Results */}
          {isCompleted && participants.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />{t('quiz.finalResults')}</h3>
              </div>
              {/* Podium top 3 */}
              {participants.length >= 1 && (
                <div className="flex items-end justify-center gap-4 py-6 px-4">
                  {participants.length >= 2 && (
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg mb-1">🥈</div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px]">{participants[1]?.participantName}</p>
                      <p className="text-[10px] text-slate-400">{participants[1]?.score} pts</p>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="w-18 h-18 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl mb-1 ring-2 ring-amber-400" style={{ width: 72, height: 72 }}>🥇</div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[100px]">{participants[0]?.participantName}</p>
                    <p className="text-xs text-amber-600 font-semibold">{participants[0]?.score} pts</p>
                  </div>
                  {participants.length >= 3 && (
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-lg mb-1">🥉</div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px]">{participants[2]?.participantName}</p>
                      <p className="text-[10px] text-slate-400">{participants[2]?.score} pts</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />{t('quiz.participants')} ({participants.length})
            </h3>
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
            {participants.length === 0 ? (
              <div className="p-6 text-center">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">{t('quiz.noParticipantsYet')}</p>
              </div>
            ) : (
              participants.map((p, i) => (
                <div key={p.participantId} className="flex items-center gap-2 px-4 py-2">
                  <span className="text-[10px] font-bold text-slate-400 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{p.participantName}</p>
                    {(isPlaying || isPaused || isCompleted) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-primary-500 font-semibold">{p.score} pts</span>
                        {p.streakCurrent > 0 && (
                          <span className="text-[10px] text-orange-500 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{p.streakCurrent}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full ${p.isConnected ? 'bg-emerald-400' : 'bg-slate-300'}`} title={p.isConnected ? 'Connected' : 'Disconnected'} />
                  {!isCompleted && (
                    <button onClick={() => { if (confirm(t('quiz.kickConfirm'))) apiKickParticipant(sessionId!, p.participantId).then(() => toast.success('Kicked')); }}
                      className="text-slate-300 hover:text-red-500 p-0.5">
                      <UserMinus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveSessionDashboard;
