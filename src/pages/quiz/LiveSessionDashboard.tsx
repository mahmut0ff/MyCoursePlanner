import React, { useEffect, useState } from 'react';
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
  Trophy, Zap, RefreshCw, Gamepad2
} from 'lucide-react';
import toast from 'react-hot-toast';

const LiveSessionDashboard: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useAuth();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    apiGetQuizSession(sessionId).then((data: any) => {
      setCurrentQuestion(data.currentQuestion);
    }).catch(() => {});
    const unsubSession = subscribeToSession(sessionId, setSession);
    const unsubParts = subscribeToParticipants(sessionId, setParticipants);
    const unsubAnswers = subscribeToAllAnswers(sessionId, setAnswers);
    return () => { unsubSession(); unsubParts(); unsubAnswers(); };
  }, [sessionId]);

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

  if (!session) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );

  const isLobby = session.status === 'lobby';
  const isPlaying = session.status === 'in_progress';
  const isPaused = session.status === 'paused';
  const isCompleted = session.status === 'completed';
  const currentQAnswers = answers.filter(a => currentQuestion && a.questionId === currentQuestion.id);
  const answeredCount = currentQAnswers.length;
  const correctCount = currentQAnswers.filter(a => a.isCorrect).length;

  return (
    <div className="max-w-6xl mx-auto kahoot-font">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/sessions')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">{session.quizTitle}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Radio className={`w-3 h-3 ${isPlaying ? 'text-green-500 animate-pulse' : isPaused ? 'text-yellow-500' : isCompleted ? 'text-slate-400' : 'text-blue-500'}`} />
              <span className={`text-xs font-bold uppercase tracking-wide ${isPlaying ? 'text-green-600' : isPaused ? 'text-yellow-600' : isCompleted ? 'text-slate-500' : 'text-blue-600'}`}>
                {session.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
        {isCompleted && (
          <button onClick={() => navigate(`/quiz/analytics/${sessionId}`)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-white text-sm" style={{ backgroundColor: 'var(--kahoot-purple)' }}>
            <BarChart3 className="w-4 h-4" />{t('quiz.viewAnalytics')}
          </button>
        )}
      </div>

      {/* Lobby: Large PIN Card */}
      {(isLobby || isPlaying || isPaused) && (
        <div className="rounded-2xl p-8 mb-5 text-center text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--kahoot-purple) 0%, var(--kahoot-purple-dark) 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.15) 0%, transparent 50%)' }} />
          <div className="relative">
            <p className="text-sm font-semibold text-white/70 mb-2 uppercase tracking-wider">{t('quiz.joinCode')}</p>
            <div className="flex items-center justify-center gap-4 mb-2">
              <span className="kahoot-pin-display">{session.code}</span>
              <button onClick={handleCopy} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                {copied ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-white/80" />}
              </button>
            </div>
            <p className="text-xs text-white/50">{t('quiz.shareCodeHint')}</p>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {isLobby && (
          <button onClick={() => doAction(() => apiStartQuizSession(sessionId!), 'start')} disabled={!!actionLoading || participants.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm transition-all disabled:opacity-40 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 3px 10px rgba(38,137,12,0.25)' }}>
            <Play className="w-4 h-4" />{t('quiz.startGame')}
          </button>
        )}
        {isPlaying && (
          <>
            <button onClick={() => doAction(() => apiNextQuestion(sessionId!), 'next')} disabled={!!actionLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm disabled:opacity-40 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--kahoot-blue)' }}>
              <SkipForward className="w-4 h-4" />
              {session.currentQuestionIndex + 1 >= session.totalQuestions ? t('quiz.finish') : t('quiz.nextQuestion')}
            </button>
            <button onClick={() => doAction(() => apiPauseQuizSession(sessionId!), 'pause')} disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-white text-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--kahoot-yellow)' }}>
              <Pause className="w-4 h-4" />{t('quiz.pause')}
            </button>
          </>
        )}
        {isPaused && (
          <button onClick={() => doAction(() => apiResumeQuizSession(sessionId!), 'resume')} disabled={!!actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm disabled:opacity-40"
            style={{ backgroundColor: 'var(--kahoot-green)' }}>
            <Play className="w-4 h-4" />{t('quiz.resume')}
          </button>
        )}
        {(isPlaying || isPaused) && (
          <button onClick={handleEnd} disabled={!!actionLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-white text-sm disabled:opacity-40"
            style={{ backgroundColor: 'var(--kahoot-red)' }}>
            <Square className="w-4 h-4" />{t('quiz.endGame')}
          </button>
        )}
        {isCompleted && (
          <button onClick={() => doAction(() => apiRestartQuizSession(sessionId!), 'restart')} disabled={!!actionLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-white text-sm disabled:opacity-40"
            style={{ backgroundColor: 'var(--kahoot-purple)' }}>
            <RefreshCw className="w-4 h-4" />{t('quiz.restart')}
          </button>
        )}
        {(isLobby || isPaused) && (
          <button onClick={() => doAction(() => (session as any).locked ? apiUnlockQuizSession(sessionId!) : apiLockQuizSession(sessionId!), 'lock')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            {(session as any).locked ? <><Unlock className="w-3.5 h-3.5" />{t('quiz.unlock')}</> : <><Lock className="w-3.5 h-3.5" />{t('quiz.lock')}</>}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress */}
          {(isPlaying || isPaused || isCompleted) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('quiz.progress')}</p>
                <p className="text-xs font-bold" style={{ color: 'var(--kahoot-purple)' }}>
                  {Math.min(session.currentQuestionIndex + 1, session.totalQuestions)} / {session.totalQuestions}
                </p>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${((session.currentQuestionIndex + 1) / session.totalQuestions) * 100}%`, backgroundColor: 'var(--kahoot-purple)' }} />
              </div>
            </div>
          )}

          {/* Current Question */}
          {currentQuestion && (isPlaying || isPaused) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--kahoot-purple)' }}>
                Q{session.currentQuestionIndex + 1} — {currentQuestion.type?.replace('_', ' ')}
              </p>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">{currentQuestion.text}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(70,23,143,0.08)' }}>
                  <p className="text-2xl font-extrabold" style={{ color: 'var(--kahoot-blue)' }}>{answeredCount}</p>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">{t('quiz.answered')}</p>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(38,137,12,0.08)' }}>
                  <p className="text-2xl font-extrabold" style={{ color: 'var(--kahoot-green)' }}>{correctCount}</p>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">{t('quiz.correct')}</p>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(216,158,0,0.08)' }}>
                  <p className="text-2xl font-extrabold" style={{ color: 'var(--kahoot-yellow)' }}>{participants.length - answeredCount}</p>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">{t('quiz.waiting')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Final Results: Podium */}
          {isCompleted && participants.length > 0 && (
            <div className="rounded-2xl overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, var(--kahoot-purple) 0%, var(--kahoot-purple-dark) 100%)' }}>
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="font-extrabold flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" />{t('quiz.finalResults')}</h3>
              </div>
              <div className="kahoot-podium-container py-8">
                {participants.length >= 2 && (
                  <div className="kahoot-podium-block">
                    <p className="text-sm font-bold text-white truncate max-w-[90px] mb-2">{participants[1]?.participantName}</p>
                    <p className="text-xs text-white/60 mb-2">{participants[1]?.score} pts</p>
                    <div className="kahoot-podium-bar silver">
                      <span className="text-2xl">🥈</span>
                      <span className="font-extrabold text-lg mt-1">2</span>
                    </div>
                  </div>
                )}
                <div className="kahoot-podium-block">
                  <p className="text-base font-extrabold text-white truncate max-w-[100px] mb-2">{participants[0]?.participantName}</p>
                  <p className="text-sm text-yellow-300 font-bold mb-2">{participants[0]?.score} pts</p>
                  <div className="kahoot-podium-bar gold">
                    <span className="text-3xl">🥇</span>
                    <span className="font-extrabold text-xl mt-1">1</span>
                  </div>
                </div>
                {participants.length >= 3 && (
                  <div className="kahoot-podium-block">
                    <p className="text-sm font-bold text-white truncate max-w-[90px] mb-2">{participants[2]?.participantName}</p>
                    <p className="text-xs text-white/60 mb-2">{participants[2]?.score} pts</p>
                    <div className="kahoot-podium-bar bronze">
                      <span className="text-2xl">🥉</span>
                      <span className="font-extrabold text-lg mt-1">3</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ borderBottomColor: 'var(--kahoot-purple)', borderBottomWidth: '2px' }}>
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wide">
              <Users className="w-4 h-4" style={{ color: 'var(--kahoot-purple)' }} />{t('quiz.participants')} ({participants.length})
            </h3>
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
            {participants.length === 0 ? (
              <div className="p-8 text-center">
                <Gamepad2 className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--kahoot-purple)', opacity: 0.3 }} />
                <p className="text-xs text-slate-400 font-semibold">{t('quiz.noParticipantsYet')}</p>
              </div>
            ) : (
              participants.map((p, i) => (
                <div key={p.participantId} className="flex items-center gap-2 px-4 py-2.5">
                  <span className={`text-[10px] font-extrabold w-5 text-center ${
                    i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-500' : 'text-slate-300'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{p.participantName}</p>
                    {(isPlaying || isPaused || isCompleted) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold" style={{ color: 'var(--kahoot-purple)' }}>{p.score} pts</span>
                        {p.streakCurrent > 0 && (
                          <span className="text-[10px] font-bold text-orange-500 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{p.streakCurrent}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${p.isConnected ? 'bg-green-400' : 'bg-slate-300'}`} />
                  {!isCompleted && (
                    <button onClick={() => { if (confirm(t('quiz.kickConfirm'))) apiKickParticipant(sessionId!, p.participantId).then(() => toast.success(t('quiz.kicked', 'Участник удалён'))); }}
                      className="text-slate-300 hover:text-red-500 p-0.5 transition-colors">
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
