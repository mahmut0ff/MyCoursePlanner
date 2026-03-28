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
  Trophy, Zap, RefreshCw, Award
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

  // Audio refs
  const gameMusicRef = useRef<HTMLAudioElement | null>(null);
  const victoryMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio elements
    gameMusicRef.current = new Audio('/music/game-music.mp3');
    gameMusicRef.current.loop = true;
    victoryMusicRef.current = new Audio('/music/victory.mp3');

    return () => {
      if (gameMusicRef.current) {
        gameMusicRef.current.pause();
        gameMusicRef.current = null;
      }
      if (victoryMusicRef.current) {
        victoryMusicRef.current.pause();
        victoryMusicRef.current = null;
      }
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
      apiGetQuizSession(sessionId).then((data: any) => {
        setCurrentQuestion(data.currentQuestion);
      }).catch(() => {});
    }
  }, [session?.currentQuestionIndex, session?.status]);

  // Handle audio playback based on session status
  useEffect(() => {
    if (!session) return;
    try {
      if (session.status === 'in_progress' || session.status === 'paused') {
        if (victoryMusicRef.current) {
          victoryMusicRef.current.pause();
          victoryMusicRef.current.currentTime = 0;
        }
        // Play game music if it's not already playing
        if (gameMusicRef.current && gameMusicRef.current.paused) {
          gameMusicRef.current.play().catch(() => console.warn('Audio auto-play prevented by browser'));
        }
      } else if (session.status === 'completed') {
        if (gameMusicRef.current) {
          gameMusicRef.current.pause();
          gameMusicRef.current.currentTime = 0;
        }
        if (victoryMusicRef.current && victoryMusicRef.current.paused) {
          victoryMusicRef.current.play().catch(() => console.warn('Audio auto-play prevented by browser'));
        }
      } else {
        // Lobby or other states
        if (gameMusicRef.current) gameMusicRef.current.pause();
        if (victoryMusicRef.current) victoryMusicRef.current.pause();
      }
    } catch (e) {
      console.warn('Audio playback error', e);
    }
  }, [session?.status]);

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

  if (!session) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );

  const isLobby = session.status === 'lobby';
  const isPlaying = session.status === 'in_progress';
  const isPaused = session.status === 'paused';
  const isCompleted = session.status === 'completed';

  // Metrics Logic: ensure we capture real-time updates appropriately
  const currentQAnswers = answers.filter(a => currentQuestion && a.questionId === currentQuestion.id);
  const answeredCount = isCompleted ? 0 : currentQAnswers.length;
  // Calculate correct answers by checking correctOptionIndex from the currentQuestion if a.isCorrect isn't strictly maintained
  const correctCount = isCompleted ? 0 : currentQAnswers.filter(a => a.isCorrect).length;
  const waitingCount = Math.max(0, participants.length - answeredCount);

  return (
    <div className="quiz-bg-image min-h-screen w-full p-4 sm:p-8 kahoot-font overflow-y-auto relative">
      <div className="max-w-7xl mx-auto relative z-10 drop-shadow-lg flex flex-col min-h-[calc(100vh-4rem)]">
        
        {/* Header - Lobby State vs Playing State */}
        {isLobby ? (
          <div className="flex items-center justify-between mb-5">
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            {/* Top Left: Mini PIN Display */}
            <div className="flex items-center gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
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
              {isPlaying && (
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
          <div className="flex flex-col items-center flex-1 mt-6">
            <div className="rounded-3xl p-10 mb-8 text-center text-white relative overflow-hidden w-full max-w-2xl shadow-2xl" style={{ background: 'linear-gradient(135deg, var(--kahoot-purple) 0%, #2f076b 100%)' }}>
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

            <div className="w-full flex flex-col sm:flex-row items-center justify-between mb-8 px-4 max-w-4xl gap-4">
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
            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-5xl px-4 pb-20">
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

        {/* GAMEPLAY INTERFACE */}
        {(isPlaying || isPaused) && currentQuestion && (
          <div className="flex flex-col flex-1 pb-10">
            {/* The Massive Question Text at the top */}
            <div className="w-full text-center px-4 mb-6">
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white leading-tight drop-shadow-sm">
                {currentQuestion.text}
              </h2>
            </div>

            {/* Main Content Area (For possible PDF/Images) */}
            <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col items-center justify-center relative">
               {/* Progress Bar Header */}
               <div className="w-full mb-6">
                  <div className="w-full bg-slate-200/80 dark:bg-slate-800/80 rounded-full h-2 shadow-inner overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 ease-out" 
                         style={{ width: `${((session.currentQuestionIndex + 1) / session.totalQuestions) * 100}%`, backgroundColor: 'var(--kahoot-purple)' }} />
                  </div>
                  <div className="flex justify-between items-center mt-2 px-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      {currentQuestion.type?.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-black text-slate-700 dark:text-slate-300">
                      {session.currentQuestionIndex + 1} of {session.totalQuestions}
                    </span>
                  </div>
               </div>

               {/* Stats Cards Row directly below center */}
               <div className="grid grid-cols-3 gap-4 w-full max-w-3xl mt-auto">
                  <div className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                    <p className="text-5xl font-black" style={{ color: 'var(--kahoot-blue)' }}>{answeredCount}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">{t('quiz.answered', 'Ответили')}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                    <p className="text-5xl font-black" style={{ color: 'var(--kahoot-green)' }}>{correctCount}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">{t('quiz.correct', 'Правильно')}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm transform transition-all hover:scale-105">
                     <p className="text-5xl font-black" style={{ color: 'var(--kahoot-yellow)' }}>{waitingCount}</p>
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">{t('quiz.waiting', 'Ожидают')}</p>
                  </div>
                </div>

                {/* Redesigned Mini-Cards for Participants Standings */}
                <div className="w-full mt-10">
                   <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-4 px-2 flex items-center gap-2">
                     <Award className="w-5 h-5" style={{ color: 'var(--kahoot-purple)' }} /> 
                     {t('quiz.leaderboard', 'Top Standings')}
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {participants.slice(0, 6).map((p, i) => (
                        <div key={p.participantId} className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-bottom duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                           <div className="flex items-center gap-3 truncate">
                              <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-black text-white ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-300' : i === 2 ? 'bg-orange-400' : 'bg-slate-800 dark:bg-slate-600'}`}>
                                {i + 1}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white truncate lg:max-w-[120px]">{p.participantName}</span>
                           </div>
                           <div className="flex flex-col items-end shrink-0">
                              <span className="text-sm font-black" style={{ color: 'var(--kahoot-purple)' }}>{p.score}</span>
                              {p.streakCurrent > 2 && (
                                <span className="text-[10px] font-bold text-orange-500 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{p.streakCurrent}</span>
                              )}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
            </div>
          </div>
        )}

        {/* RESULTS INTERFACE */}
        {isCompleted && participants.length > 0 && (
          <div className="flex flex-col items-center flex-1 mt-10 animate-fade-in pb-16">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-10 flex items-center gap-4">
               <Trophy className="w-10 h-10 text-yellow-500" /> {t('quiz.finalResults', 'Final Results')}
            </h2>
            
            <div className="kahoot-podium-container py-8 max-w-3xl w-full">
              {participants.length >= 2 && (
                <div className="kahoot-podium-block">
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{participants[1]?.participantName}</p>
                  <p className="text-sm text-slate-500 font-black mb-2">{participants[1]?.score} pts</p>
                  <div className="kahoot-podium-bar silver !rounded-t-3xl shadow-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-4xl mt-4">🥈</span>
                    <span className="font-extrabold text-2xl mt-2 text-slate-700">2</span>
                  </div>
                </div>
              )}
              <div className="kahoot-podium-block z-10">
                <p className="text-2xl font-black text-slate-900 dark:text-white truncate max-w-[150px] mb-2">{participants[0]?.participantName}</p>
                <p className="text-base text-yellow-600 dark:text-yellow-400 font-black mb-2">{participants[0]?.score} pts</p>
                <div className="kahoot-podium-bar gold !rounded-t-3xl shadow-xl border border-yellow-400">
                  <span className="text-5xl mt-4 drop-shadow-md">🥇</span>
                  <span className="font-extrabold text-4xl mt-2 text-yellow-900">1</span>
                </div>
              </div>
              {participants.length >= 3 && (
                <div className="kahoot-podium-block">
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[120px] mb-2">{participants[2]?.participantName}</p>
                  <p className="text-sm text-slate-500 font-black mb-2">{participants[2]?.score} pts</p>
                  <div className="kahoot-podium-bar bronze !rounded-t-3xl shadow-lg border border-orange-200">
                    <span className="text-4xl mt-4">🥉</span>
                    <span className="font-extrabold text-2xl mt-2 text-orange-900">3</span>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => doAction(() => apiRestartQuizSession(sessionId!), 'restart')} disabled={!!actionLoading}
              className="mt-12 flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-white text-xl transition-all shadow-xl active:scale-95"
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
