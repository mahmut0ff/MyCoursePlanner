import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Trophy, Zap, RefreshCw, Award, Timer
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  playGameMusic, stopGameMusic, playCountdownTick, playDramaticTick,
  playVictoryFanfare, playQuestionTransition, cleanupAudio
} from '../../utils/quizSounds';

type DashboardPhase = 'lobby' | 'playing' | 'scoreboard' | 'completed';

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
  const autoAdvanceRef = useRef(false);

  // Timer state for live countdown on teacher screen
  const [displayTimeLeft, setDisplayTimeLeft] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(-1);

  // Scoreboard phase management
  const [phase, setPhase] = useState<DashboardPhase>('lobby');
  const prevQuestionIndex = useRef<number>(-1);

  // Sound state tracking
  const musicStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      cleanupAudio();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const loadQ = async () => {
      try {
        const data = await apiGetQuizSession(sessionId);
        setCurrentQuestion((data as any).currentQuestion);
      } catch (e) {}
    };
    loadQ();
    const unsubSession = subscribeToSession(sessionId, setSession);
    const unsubParts = subscribeToParticipants(sessionId, setParticipants);
    const unsubAnswers = subscribeToAllAnswers(sessionId, setAnswers);
    return () => { unsubSession(); unsubParts(); unsubAnswers(); };
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && session && (session.status === 'in_progress' || session.status === 'paused')) {
      if (session.currentQuestionIndex !== prevQuestionIndex.current) {
        prevQuestionIndex.current = session.currentQuestionIndex;
        autoAdvanceRef.current = false;
        setPhase('playing');
        playQuestionTransition();

        apiGetQuizSession(sessionId).then((data: any) => {
          setCurrentQuestion(data.currentQuestion);
          const timer = data.currentQuestion?.timerSeconds || 30;
          setDisplayTimeLeft(timer);
          lastTickRef.current = -1;
          // Start live timer
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setDisplayTimeLeft(prev => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }).catch(() => {});
      }
    }
  }, [session?.currentQuestionIndex, session?.status]);

  // Handle phases based on session status
  useEffect(() => {
    if (!session) return;
    if (session.status === 'lobby') {
      setPhase('lobby');
      stopGameMusic();
      musicStartedRef.current = false;
    } else if (session.status === 'in_progress' || session.status === 'paused') {
      if (!musicStartedRef.current) {
        playGameMusic();
        musicStartedRef.current = true;
      }
    } else if (session.status === 'completed') {
      setPhase('completed');
      stopGameMusic();
      musicStartedRef.current = false;
      playVictoryFanfare();
    }
  }, [session?.status]);

  // Countdown tick sounds when <= 5 seconds
  useEffect(() => {
    if (phase !== 'playing') return;
    if (displayTimeLeft > 0 && displayTimeLeft <= 5 && displayTimeLeft !== lastTickRef.current) {
      lastTickRef.current = displayTimeLeft;
      if (displayTimeLeft <= 3) {
        playDramaticTick(displayTimeLeft);
      } else {
        playCountdownTick();
      }
    }
  }, [displayTimeLeft, phase]);

  // ─── Derive currentQuestionId directly from session document ───
  const currentQuestionId = session?.status === 'in_progress' || session?.status === 'paused'
    ? session.questionOrder?.[session.currentQuestionIndex]
    : null;

  // Metrics
  const currentQAnswers = currentQuestionId
    ? answers.filter(a => a.questionId === currentQuestionId)
    : [];
  const isCompleted = session?.status === 'completed';
  const isPlaying = session?.status === 'in_progress';
  const isPaused = session?.status === 'paused';
  const isLobby = session?.status === 'lobby';

  const answeredCount = isCompleted ? 0 : currentQAnswers.length;
  const correctCount = isCompleted ? 0 : currentQAnswers.filter(a => a.isCorrect).length;
  const waitingCount = Math.max(0, participants.length - answeredCount);

  // ─── AUTO-ADVANCE: show scoreboard first, then move to next question ───
  const doAutoAdvance = useCallback(async () => {
    if (!sessionId || autoAdvanceRef.current) return;
    autoAdvanceRef.current = true;

    // Show scoreboard phase
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('scoreboard');

    // Wait 5 seconds for scoreboard display, then go to next
    setTimeout(async () => {
      try {
        await apiNextQuestion(sessionId);
      } catch (e: any) {
        console.warn('Auto-advance failed:', e.message);
      }
    }, 5000);
  }, [sessionId]);

  useEffect(() => {
    if (
      isPlaying &&
      phase === 'playing' &&
      participants.length > 0 &&
      answeredCount > 0 &&
      answeredCount >= participants.length &&
      !autoAdvanceRef.current
    ) {
      const timer = setTimeout(() => {
        doAutoAdvance();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, phase, participants.length, answeredCount, doAutoAdvance]);

  // Also transition to scoreboard when timer runs out
  useEffect(() => {
    if (phase === 'playing' && displayTimeLeft === 0 && currentQuestion && !autoAdvanceRef.current) {
      const timer = setTimeout(() => {
        doAutoAdvance();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [displayTimeLeft, phase, currentQuestion, doAutoAdvance]);

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
    if (!confirm(t('quiz.endConfirm', 'Are you sure you want to end?'))) return;
    doAction(() => apiEndQuizSession(sessionId!), 'end');
  };

  const handleSkipScoreboard = () => {
    if (!sessionId) return;
    doAction(() => apiNextQuestion(sessionId), 'next');
  };

  if (!session) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );

  // Sorted participants for scoreboard
  const sortedParticipants = [...participants].sort((a, b) => b.score - a.score);

  return (
    <div className="quiz-bg-image w-full h-screen kahoot-font overflow-hidden relative flex flex-col">
      <div className="max-w-7xl mx-auto relative z-10 drop-shadow-lg flex flex-col h-full w-full px-4 sm:px-6 py-3">
        
        {/* Header - Lobby State vs Playing/Scoreboard State */}
        {isLobby ? (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/quiz/sessions')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">{session.quizTitle}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Radio className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-bold uppercase tracking-wide text-blue-600">LOBBY</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 shrink-0">
            {/* Top Left: Mini PIN Display */}
            <div className="flex items-center gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-1.5 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
               <button onClick={() => navigate('/quiz/sessions')} className="p-1 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                 <ArrowLeft className="w-4 h-4 text-slate-500" />
               </button>
               <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('quiz.joinCode', 'PIN')}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-slate-900 dark:text-white tracking-widest leading-none">{session.code}</span>
                  </div>
               </div>
            </div>
            
            {/* Top Right: Game Controls */}
            <div className="flex items-center gap-2">
              {isPlaying && phase !== 'scoreboard' && (
                <>
                  <button onClick={() => doAction(() => apiPauseQuizSession(sessionId!), 'pause')} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white text-sm disabled:opacity-50 transition-transform active:scale-95"
                    style={{ backgroundColor: 'var(--kahoot-yellow)', boxShadow: '0 4px 0 rgba(0,0,0,0.2)' }}>
                    <Pause className="w-4 h-4" />{t('quiz.pause', 'Pause')}
                  </button>
                  <button onClick={() => doAction(() => apiNextQuestion(sessionId!), 'next')} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-6 py-2 rounded-xl font-extrabold text-white text-sm disabled:opacity-50 transition-transform active:scale-95"
                    style={{ backgroundColor: 'var(--kahoot-blue)', boxShadow: '0 4px 0 rgba(0,0,0,0.2)' }}>
                    {session.currentQuestionIndex + 1 >= session.totalQuestions ? t('quiz.finish', 'Finish') : t('quiz.nextQuestion', 'Next')}
                    <SkipForward className="w-4 h-4 ml-1" />
                  </button>
                </>
              )}
              {phase === 'scoreboard' && (
                <button onClick={handleSkipScoreboard} disabled={!!actionLoading}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl font-extrabold text-white text-sm disabled:opacity-50 transition-transform active:scale-95"
                  style={{ backgroundColor: 'var(--kahoot-blue)', boxShadow: '0 4px 0 rgba(0,0,0,0.2)' }}>
                  {session.currentQuestionIndex + 1 >= session.totalQuestions ? t('quiz.finish', 'Finish') : t('quiz.nextQuestion', 'Next')}
                  <SkipForward className="w-4 h-4 ml-1" />
                </button>
              )}
              {isPaused && (
                <button onClick={() => doAction(() => apiResumeQuizSession(sessionId!), 'resume')} disabled={!!actionLoading}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl font-extrabold text-white text-sm disabled:opacity-50 transition-transform active:scale-95"
                  style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 4px 0 rgba(0,0,0,0.2)' }}>
                  <Play className="w-4 h-4" />{t('quiz.resume', 'Resume')}
                </button>
              )}
              {(isPlaying || isPaused) && (
                <button onClick={handleEnd} disabled={!!actionLoading}
                  className="flex items-center justify-center p-2 rounded-xl font-bold text-white text-sm disabled:opacity-50 transition-transform hover:scale-105 active:scale-95 ml-2"
                  style={{ backgroundColor: 'transparent', border: '2px solid var(--kahoot-red)' }} title={t('quiz.endGame', 'End Game')}>
                  <Square className="w-4 h-4" style={{ color: 'var(--kahoot-red)' }} />
                </button>
              )}
              {isCompleted && (
                <button onClick={() => navigate(`/quiz/analytics/${sessionId}`)} className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white text-sm shadow-md transition-transform active:scale-95" style={{ backgroundColor: 'var(--kahoot-purple)' }}>
                  <BarChart3 className="w-4 h-4" />{t('quiz.viewAnalytics', 'Analytics')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* LOBBY INTERFACE */}
        {isLobby && (
          <div className="flex flex-col items-center flex-1 overflow-auto">
            <div className="rounded-3xl p-8 mb-6 text-center text-white relative overflow-hidden w-full max-w-2xl shadow-2xl" style={{ background: 'linear-gradient(135deg, var(--kahoot-purple) 0%, #2f076b 100%)' }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.15) 0%, transparent 50%)' }} />
              <div className="relative z-10">
                <p className="text-base font-bold text-white/70 mb-2 uppercase tracking-[0.2em]">{t('quiz.joinCode', 'Join at BIGSHOP with PIN:')}</p>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <span className="kahoot-pin-display !text-7xl !tracking-[0.1em]">{session.code}</span>
                  <button onClick={handleCopy} className="p-3 rounded-full bg-white/10 hover:bg-white/25 transition-all active:scale-95 border border-white/20">
                    {copied ? <CheckCircle className="w-8 h-8 text-green-400" /> : <Copy className="w-8 h-8 text-white" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col sm:flex-row items-center justify-between mb-6 px-4 max-w-4xl gap-4">
              <div className="flex items-center gap-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                <Users className="w-6 h-6 text-slate-800 dark:text-white" />
                <span className="text-2xl font-black text-slate-900 dark:text-white">{participants.length}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={() => doAction(() => (session as any).locked ? apiUnlockQuizSession(sessionId!) : apiLockQuizSession(sessionId!), 'lock')}
                  className="flex items-center justify-center p-3 rounded-2xl text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-50 transition-all shadow-sm w-12 h-12">
                  {(session as any).locked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </button>
                <button onClick={() => doAction(() => apiStartQuizSession(sessionId!), 'start')} disabled={!!actionLoading || participants.length === 0}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-black text-white text-xl transition-all disabled:opacity-50 disabled:grayscale active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 6px 0 #1b6308' }}>
                  {t('quiz.startGame', 'Start')}
                </button>
              </div>
            </div>

            {/* Scattered Participants */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-5xl px-4 pb-8">
              {participants.length === 0 ? (
                <div className="mt-10 animate-pulse">
                  <span className="text-2xl font-black text-slate-600/50 dark:text-slate-400/50 uppercase tracking-widest">
                    {t('quiz.waitingForPlayers', 'Ожидание игроков...')}
                  </span>
                </div>
              ) : (
                participants.map(p => (
                  <div key={p.participantId} 
                       className="group relative px-6 py-3 rounded-xl flex items-center gap-2 transform transition-transform hover:scale-110 animate-in fade-in zoom-in duration-300 shadow-md" 
                       style={{ backgroundColor: 'var(--kahoot-purple)' }}>
                    <span className="text-white font-black text-lg tracking-wide truncate max-w-[200px]">
                      {p.participantName}
                    </span>
                    <button onClick={() => { if (confirm(t('quiz.kickConfirm', 'Remove player?'))) apiKickParticipant(sessionId!, p.participantId) }}
                      className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity transform shadow-lg cursor-pointer">
                      <UserMinus className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* GAMEPLAY INTERFACE — fits viewport, no scroll */}
        {(isPlaying || isPaused) && phase === 'playing' && currentQuestion && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Question text — compact */}
            <div className="w-full text-center px-4 mb-3 shrink-0">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight drop-shadow-sm">
                {currentQuestion.text}
              </h2>
            </div>

            {/* Main Content Area with PLANULA branding + Timer */}
            <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col min-h-0">
              {/* Progress Bar */}
              <div className="w-full mb-3 shrink-0 px-2">
                <div className="w-full bg-slate-200/80 dark:bg-slate-800/80 rounded-full h-1.5 shadow-inner overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700 ease-out" 
                       style={{ width: `${((session.currentQuestionIndex + 1) / session.totalQuestions) * 100}%`, backgroundColor: 'var(--kahoot-purple)' }} />
                </div>
                <div className="flex justify-between items-center mt-1 px-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {currentQuestion.type?.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                    {session.currentQuestionIndex + 1} / {session.totalQuestions}
                  </span>
                </div>
              </div>

              {/* ═══════ CENTRAL AREA: Planula! branding + Big Timer ═══════ */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
                {/* Planula! Brand Logo */}
                <div className="planula-brand-container">
                  <h1 className="planula-brand-text">
                    Planula<span className="planula-exclamation">!</span>
                  </h1>
                  <div className="planula-brand-glow" />
                </div>

                {/* Big Timer Display */}
                <div className={`planula-timer-display ${displayTimeLeft <= 5 ? 'danger' : ''} ${displayTimeLeft <= 3 ? 'critical' : ''}`}>
                  <Timer className="w-8 h-8 opacity-60" />
                  <span className="planula-timer-number">{displayTimeLeft}</span>
                  <span className="planula-timer-label">сек</span>
                </div>
              </div>

              {/* Top Section: Participants Standings */}
              <div className="w-full mb-3 shrink-0 px-2">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4" style={{ color: 'var(--kahoot-purple)' }} /> 
                  {t('quiz.leaderboard', 'Top Standings')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {participants.slice(0, 6).map((p, i) => (
                    <div key={p.participantId} className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-bottom duration-500" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className="flex items-center gap-2 truncate">
                        <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black text-white shrink-0 ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-300' : i === 2 ? 'bg-orange-400' : 'bg-slate-800 dark:bg-slate-600'}`}>
                          {i + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{p.participantName}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-2">
                        <span className="text-xs font-black" style={{ color: 'var(--kahoot-purple)' }}>{p.score}</span>
                        {p.streakCurrent > 2 && (
                          <span className="text-[9px] font-bold text-orange-500 flex items-center gap-0.5"><Zap className="w-2 h-2" />{p.streakCurrent}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats Cards Row — compact, always visible */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-3xl mx-auto mt-auto mb-3 shrink-0">
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                  <p className="text-4xl font-black" style={{ color: 'var(--kahoot-blue)' }}>{answeredCount}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('quiz.answered', 'Ответили')}</p>
                </div>
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                  <p className="text-4xl font-black" style={{ color: 'var(--kahoot-green)' }}>{correctCount}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('quiz.correct', 'Правильно')}</p>
                </div>
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                  <p className="text-4xl font-black" style={{ color: 'var(--kahoot-yellow)' }}>{waitingCount}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('quiz.waiting', 'Ожидают')}</p>
                </div>
              </div>

              {/* Auto-advance indicator */}
              {isPlaying && participants.length > 0 && answeredCount >= participants.length && (
                <div className="text-center mb-2 shrink-0 animate-pulse">
                  <span className="text-sm font-bold text-white bg-green-500/80 px-4 py-1.5 rounded-full">
                    ✓ {t('quiz.allAnswered', 'Все ответили — переключение...')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ SCOREBOARD PHASE — After each question ═══════ */}
        {(isPlaying || isPaused) && phase === 'scoreboard' && (
          <div className="flex flex-col items-center flex-1 overflow-auto animate-fade-in py-4">
            <div className="text-center mb-6" style={{ animation: 'kahoot-slide-up 0.5s ease-out' }}>
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2 flex items-center justify-center gap-3">
                <Trophy className="w-8 h-8 text-yellow-500" />
                {t('quiz.scoreboard', 'Итоги раунда')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">
                {t('quiz.questionN', 'Вопрос')} {session.currentQuestionIndex + 1} / {session.totalQuestions}
              </p>
            </div>

            {/* Scoreboard podium for top 3 */}
            {sortedParticipants.length >= 1 && (
              <div className="kahoot-podium-container py-4 max-w-3xl w-full mb-4">
                {sortedParticipants.length >= 2 && (
                  <div className="kahoot-podium-block">
                    <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{sortedParticipants[1]?.participantName}</p>
                    <p className="text-sm text-slate-500 font-black mb-2">{sortedParticipants[1]?.score} pts</p>
                    <div className="kahoot-podium-bar silver !rounded-t-3xl shadow-lg border border-slate-200 dark:border-slate-700">
                      <span className="text-4xl mt-4">🥈</span>
                      <span className="font-extrabold text-2xl mt-2 text-slate-700">2</span>
                    </div>
                  </div>
                )}
                <div className="kahoot-podium-block z-10">
                  <p className="text-2xl font-black text-slate-900 dark:text-white truncate max-w-[150px] mb-2">{sortedParticipants[0]?.participantName}</p>
                  <p className="text-base text-yellow-600 dark:text-yellow-400 font-black mb-2">{sortedParticipants[0]?.score} pts</p>
                  <div className="kahoot-podium-bar gold !rounded-t-3xl shadow-xl border border-yellow-400">
                    <span className="text-5xl mt-4 drop-shadow-md">🥇</span>
                    <span className="font-extrabold text-4xl mt-2 text-yellow-900">1</span>
                  </div>
                </div>
                {sortedParticipants.length >= 3 && (
                  <div className="kahoot-podium-block">
                    <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{sortedParticipants[2]?.participantName}</p>
                    <p className="text-sm text-slate-500 font-black mb-2">{sortedParticipants[2]?.score} pts</p>
                    <div className="kahoot-podium-bar bronze !rounded-t-3xl shadow-lg border border-orange-200">
                      <span className="text-4xl mt-4">🥉</span>
                      <span className="font-extrabold text-2xl mt-2 text-orange-900">3</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Full scoreboard list */}
            <div className="w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden shadow-lg">
              <div className="px-5 py-3 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--kahoot-purple)' }} />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">{t('quiz.standings', 'Таблица лидеров')}</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {sortedParticipants.map((p, i) => (
                  <div key={p.participantId} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50"
                       style={{ animation: 'kahoot-slide-up 0.3s ease-out', animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
                    <span className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-black text-white shrink-0 ${
                      i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-orange-400' : 'bg-slate-600'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 font-bold text-slate-900 dark:text-white truncate">{p.participantName}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-green-600">{p.correctCount || 0} ✓</span>
                      {p.streakCurrent > 1 && <span className="text-xs font-bold text-orange-500 flex items-center gap-0.5"><Zap className="w-3 h-3" />{p.streakCurrent}</span>}
                      <span className="font-black text-lg" style={{ color: 'var(--kahoot-purple)' }}>{p.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Next question countdown */}
            <div className="mt-4 text-center animate-pulse">
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                ⏳ {t('quiz.nextQuestionSoon', 'Следующий вопрос через несколько секунд...')}
              </span>
            </div>
          </div>
        )}

        {/* RESULTS INTERFACE */}
        {isCompleted && participants.length > 0 && (
          <div className="flex flex-col items-center flex-1 overflow-auto animate-fade-in py-4">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-4">
               <Trophy className="w-8 h-8 text-yellow-500" /> {t('quiz.finalResults', 'Final Results')}
            </h2>
            
            <div className="kahoot-podium-container py-6 max-w-3xl w-full">
              {sortedParticipants.length >= 2 && (
                <div className="kahoot-podium-block">
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{sortedParticipants[1]?.participantName}</p>
                  <p className="text-sm text-slate-500 font-black mb-2">{sortedParticipants[1]?.score} pts</p>
                  <div className="kahoot-podium-bar silver !rounded-t-3xl shadow-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-4xl mt-4">🥈</span>
                    <span className="font-extrabold text-2xl mt-2 text-slate-700">2</span>
                  </div>
                </div>
              )}
              <div className="kahoot-podium-block z-10">
                <p className="text-2xl font-black text-slate-900 dark:text-white truncate max-w-[150px] mb-2">{sortedParticipants[0]?.participantName}</p>
                <p className="text-base text-yellow-600 dark:text-yellow-400 font-black mb-2">{sortedParticipants[0]?.score} pts</p>
                <div className="kahoot-podium-bar gold !rounded-t-3xl shadow-xl border border-yellow-400">
                  <span className="text-5xl mt-4 drop-shadow-md">🥇</span>
                  <span className="font-extrabold text-4xl mt-2 text-yellow-900">1</span>
                </div>
              </div>
              {sortedParticipants.length >= 3 && (
                <div className="kahoot-podium-block">
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{sortedParticipants[2]?.participantName}</p>
                  <p className="text-sm text-slate-500 font-black mb-2">{sortedParticipants[2]?.score} pts</p>
                  <div className="kahoot-podium-bar bronze !rounded-t-3xl shadow-lg border border-orange-200">
                    <span className="text-4xl mt-4">🥉</span>
                    <span className="font-extrabold text-2xl mt-2 text-orange-900">3</span>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => doAction(() => apiRestartQuizSession(sessionId!), 'restart')} disabled={!!actionLoading}
              className="mt-8 flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-white text-xl transition-all shadow-xl active:scale-95"
              style={{ backgroundColor: 'var(--kahoot-purple)' }}>
              <RefreshCw className="w-6 h-6" /> {t('quiz.restart', 'Play Again')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default LiveSessionDashboard;
