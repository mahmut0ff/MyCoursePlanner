import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToSession, subscribeToParticipants } from '../../services/quiz.service';
import { apiGetQuizSession, apiSubmitQuizAnswer, apiJoinQuizSession } from '../../lib/api';
import type { QuizSession, SessionParticipant } from '../../types';
import {
  Trophy, Users, Zap, CheckCircle, XCircle, Star,
  Loader2, Gamepad2, ArrowLeft
} from 'lucide-react';
import { playCountdownTick, playDramaticTick, playTimesUpBuzzer, cleanupAudio } from '../../utils/quizSounds';

type GamePhase = 'lobby' | 'question' | 'answer_feedback' | 'leaderboard' | 'results';

// Reusable Background Component
const QuizBackground = () => (
  <div className="fixed inset-0 z-[-2] bg-slate-50 dark:bg-slate-900 transition-colors" />
);

const OPTION_COLORS = ['kahoot-option-red', 'kahoot-option-blue', 'kahoot-option-yellow', 'kahoot-option-green', 'kahoot-option-red', 'kahoot-option-blue', 'kahoot-option-yellow', 'kahoot-option-green'];
const OPTION_SHAPES = ['▲', '◆', '●', '■', '▲', '◆', '●', '■'];

const QuizPlayPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [session, setSession] = useState<QuizSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [selectedAnswer, setSelectedAnswer] = useState<string | string[] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answerResult, setAnswerResult] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevQuestionIndex = useRef<number>(-2);
  
  // Audio
  const plopAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTickRef = useRef<number>(-1);

  useEffect(() => {
    plopAudioRef.current = new Audio('/sounds/plop.mp3');
    return () => { cleanupAudio(); };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    apiJoinQuizSession({ sessionId }).catch(() => {});
    const unsubSession = subscribeToSession(sessionId, (s) => {
      setSession(s);
      if (s.status === 'lobby') setPhase('lobby');
      else if (s.status === 'completed') setPhase('results');
      else if (s.status === 'in_progress' || s.status === 'paused') {
        if (s.currentQuestionIndex !== prevQuestionIndex.current) {
          prevQuestionIndex.current = s.currentQuestionIndex;
          setSelectedAnswer(null);
          setSubmitted(false);
          setAnswerResult(null);
          setPhase('question');
          apiGetQuizSession(sessionId).then((data: any) => {
            setCurrentQuestion(data.currentQuestion);
            const timer = data.currentQuestion?.timerSeconds || 30;
            setTimeLeft(timer);
            setStartTime(Date.now());
          });
        }
      }
    });
    const unsubParts = subscribeToParticipants(sessionId, setParticipants);
    return () => { unsubSession(); unsubParts(); };
  }, [sessionId]);

  useEffect(() => {
    if (phase !== 'question' || submitted) return;
    lastTickRef.current = -1;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          playTimesUpBuzzer();
          if (!submitted) handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentQuestion, submitted]);

  // Countdown tick sounds for last 5 seconds
  useEffect(() => {
    if (phase !== 'question' || submitted) return;
    if (timeLeft > 0 && timeLeft <= 5 && timeLeft !== lastTickRef.current) {
      lastTickRef.current = timeLeft;
      if (timeLeft <= 3) {
        playDramaticTick(timeLeft);
      } else {
        playCountdownTick();
      }
    }
  }, [timeLeft, phase, submitted]);

  const handleSubmit = useCallback(async (timedOut = false) => {
    if (submitted || submitting || !sessionId || !currentQuestion) return;
    setSubmitting(true);
    setSubmitted(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const responseTimeMs = Date.now() - startTime;
      const answer = timedOut ? '' : (selectedAnswer || '');
      const result = await apiSubmitQuizAnswer({
        sessionId,
        questionId: currentQuestion.id,
        answer,
        responseTimeMs,
      });
      setAnswerResult(result);
      setPhase('answer_feedback');
    } catch {
      setPhase('answer_feedback');
    } finally {
      setSubmitting(false);
    }
  }, [submitted, submitting, sessionId, currentQuestion, selectedAnswer, startTime]);

  const handleSelectOption = (optId: string) => {
    if (submitted) return;
    
    // Play interaction sound
    if (plopAudioRef.current) {
      plopAudioRef.current.currentTime = 0;
      plopAudioRef.current.play().catch(() => {});
    }

    const q = currentQuestion;
    if (!q) return;
    if (['multiple_choice', 'multi_select'].includes(q.type)) {
      const current = Array.isArray(selectedAnswer) ? selectedAnswer : [];
      const next = current.includes(optId) ? current.filter((a: string) => a !== optId) : [...current, optId];
      setSelectedAnswer(next);
    } else {
      setSelectedAnswer(optId);
    }
  };

  const myParticipant = participants.find(p => p.participantId === profile?.uid);
  const myRank = participants.findIndex(p => p.participantId === profile?.uid) + 1;

  // ─── LOBBY PHASE ───
  if (phase === 'lobby') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 overflow-auto">
        <QuizBackground />
        <div className="text-center max-w-lg px-4 relative z-10" style={{ animation: 'kahoot-slide-up 0.5s ease-out' }}>
          <div className="mb-6" style={{ animation: 'kahoot-lobby-float 3s ease-in-out infinite' }}>
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
              <Gamepad2 className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="kahoot-font text-2xl font-extrabold text-white mb-2">{session?.quizTitle || t('quiz.waitingTitle')}</h2>
          <p className="text-white/60 text-sm mb-8 kahoot-font">{t('quiz.waitingForHost')}</p>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 mb-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="w-5 h-5 text-white/80" />
              <span className="kahoot-font text-lg font-bold text-white">{participants.length} {t('quiz.players')}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-h-40 overflow-y-auto">
              {participants.map(p => (
                <span
                  key={p.participantId}
                  className={`kahoot-player-chip ${p.participantId === profile?.uid ? '!bg-white/30 ring-2 ring-white/50' : ''}`}
                >
                  {p.participantName}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-white/50 text-sm kahoot-font">
            <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
            {t('quiz.connected')}
          </div>
        </div>
      </div>
    );
  }

  // ─── QUESTION PHASE ───
  if (phase === 'question' && currentQuestion) {
    const isMultiSelect = ['multiple_choice', 'multi_select'].includes(currentQuestion.type);
    const isShortText = currentQuestion.type === 'short_text';
    const isPoll = ['poll', 'discussion', 'info_slide'].includes(currentQuestion.type);
    const timerPercent = (timeLeft / (currentQuestion.timerSeconds || 30)) * 100;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-auto" style={{ animation: 'kahoot-fade-in 0.3s ease-out' }}>
        <QuizBackground />
        
        {/* Top bar: progress + timer */}
        <div className="sticky top-0 z-10 px-4 pt-3 pb-2 bg-transparent">
          <div className="flex items-center justify-between mb-2">
            <span className="kahoot-font text-sm font-semibold text-white/70">
              {(session?.currentQuestionIndex || 0) + 1} / {session?.totalQuestions}
            </span>
            <div className={`kahoot-timer-circle ${timeLeft <= 5 ? 'danger' : ''}`}>
              {timeLeft}
            </div>
          </div>
          <div className="kahoot-timer-bar">
            <div
              className={`kahoot-timer-bar-fill ${timeLeft <= 5 ? 'danger' : ''}`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="px-4 py-4 relative z-10">
          <div className="kahoot-question-card max-w-3xl mx-auto shadow-2xl border border-white/10 bg-white/95 backdrop-blur-sm">
            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'image' && (
              <img src={currentQuestion.mediaUrl} alt="" className="max-h-56 object-contain rounded-lg mb-4 mx-auto" />
            )}
            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'audio' && (
              <audio src={currentQuestion.mediaUrl} controls className="w-full mb-3" />
            )}
            {currentQuestion.passageText && (
              <div className="bg-gray-50/80 p-3 rounded-lg mb-3 text-sm text-gray-700 max-h-32 overflow-y-auto w-full border border-gray-200">
                {currentQuestion.passageText}
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 leading-tight">{currentQuestion.text}</h2>
            {currentQuestion.helpText && (
              <p className="text-sm text-slate-500 mt-2 font-medium">{currentQuestion.helpText}</p>
            )}
          </div>
        </div>

        {/* Answer Options */}
        <div className="px-4 pb-6 relative z-10 flex-1" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          {isShortText ? (
            <div className="max-w-xl mx-auto w-full mb-4">
              <input
                value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                placeholder={t('quiz.typeAnswer')}
                className="w-full text-center text-xl font-bold py-4 px-4 rounded-lg bg-white text-gray-900 placeholder-gray-300 outline-none kahoot-font"
                disabled={submitted}
                autoFocus
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto w-full">
              {currentQuestion.options?.map((opt: any, i: number) => {
                const isSelected = Array.isArray(selectedAnswer) ? selectedAnswer.includes(opt.id) : selectedAnswer === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(opt.id)}
                    disabled={submitted}
                    className={`kahoot-option ${OPTION_COLORS[i % OPTION_COLORS.length]} ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="kahoot-shape">{OPTION_SHAPES[i % OPTION_SHAPES.length]}</span>
                    <span className="flex-1">{opt.text}</span>
                    {opt.imageUrl && <img src={opt.imageUrl} alt="" className="h-12 rounded" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Submit */}
          {!submitted && (
            <div className="max-w-3xl mx-auto w-full mt-3">
              <button
                onClick={() => handleSubmit()}
                disabled={submitting || (!selectedAnswer && !isShortText && !isPoll)}
                className="w-full py-4 rounded-lg font-bold text-white text-lg kahoot-font transition-all disabled:opacity-40 active:scale-[0.98]"
                style={{ backgroundColor: '#333' }}
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isMultiSelect ? t('quiz.submitAnswers') : t('quiz.submit'))}
              </button>
            </div>
          )}

          {submitted && !answerResult && (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-white mb-2" />
              <p className="text-sm text-white/60 kahoot-font">{t('quiz.submitting')}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── ANSWER FEEDBACK PHASE ───
  if (phase === 'answer_feedback') {
    const isCorrect = answerResult?.isCorrect;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          background: isCorrect ? '#66bf39' : '#e21b3c',
          animation: isCorrect ? 'kahoot-correct 0.5s ease' : 'kahoot-shake 0.5s ease',
        }}
      >
        <div className="text-center max-w-sm px-4" style={{ animation: 'kahoot-slide-up 0.4s ease-out' }}>
          {isCorrect ? (
            <>
              <div className="w-24 h-24 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-14 h-14 text-white" />
              </div>
              <h2 className="kahoot-font text-3xl font-extrabold text-white mb-2">{t('quiz.correct')}! 🎉</h2>
            </>
          ) : (
            <>
              <div className="w-24 h-24 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-14 h-14 text-white" />
              </div>
              <h2 className="kahoot-font text-3xl font-extrabold text-white mb-2">
                {answerResult ? t('quiz.incorrect') : t('quiz.timeUp')} 😔
              </h2>
            </>
          )}

          {answerResult && (
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-5 mt-6 text-white border border-white/10">
              <div className="flex justify-between items-center text-base mb-2">
                <span className="text-white/80 kahoot-font">{t('quiz.points')}</span>
                <span className="kahoot-font font-extrabold text-2xl">+{answerResult.pointsEarned || 0}</span>
              </div>
              {answerResult.speedBonusEarned > 0 && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60 flex items-center gap-1"><Zap className="w-3 h-3" />{t('quiz.speedBonus')}</span>
                  <span className="font-bold">+{answerResult.speedBonusEarned}</span>
                </div>
              )}
              {answerResult.streakBonusEarned > 0 && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60 flex items-center gap-1"><Star className="w-3 h-3" />{t('quiz.streakBonus')}</span>
                  <span className="font-bold">+{answerResult.streakBonusEarned}</span>
                </div>
              )}
              <div className="flex justify-between text-base pt-3 border-t border-white/20 mt-2">
                <span className="text-white/80 kahoot-font">{t('quiz.totalScore')}</span>
                <span className="kahoot-font font-extrabold">{answerResult.totalScore}</span>
              </div>
              {answerResult.answerExplanation && (
                <p className="text-sm text-white/70 pt-3 border-t border-white/20 mt-2">
                  💡 {answerResult.answerExplanation}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-white/60 mt-6 flex items-center justify-center gap-1 kahoot-font">
            <Loader2 className="w-3 h-3 animate-spin" />{t('quiz.waitingNextQuestion')}
          </p>
        </div>
      </div>
    );
  }

  // ─── RESULTS PHASE ───
  if (phase === 'results') {
    const top3 = participants.slice(0, 3);

    return (
      <div className="fixed inset-0 z-50 overflow-auto">
        <QuizBackground />
        
        <div className="max-w-xl mx-auto py-10 px-4 relative z-10" style={{ animation: 'kahoot-slide-up 0.5s ease-out' }}>
          <h1 className="kahoot-font text-4xl font-black text-white text-center mb-2 drop-shadow-lg">{t('quiz.gameOver')}! 🏆</h1>
          <p className="text-white/80 text-center text-sm kahoot-font mb-10 drop-shadow-md">{session?.quizTitle}</p>

          {/* Podium */}
          {top3.length >= 1 && (
            <div className="kahoot-podium-container mb-8">
              {/* 2nd place */}
              {top3.length >= 2 && (
                <div className="kahoot-podium-block">
                  <p className="kahoot-font text-sm font-bold text-white truncate max-w-[100px] mb-2">{top3[1]?.participantName}</p>
                  <p className="text-white/60 text-xs kahoot-font mb-2">{top3[1]?.score} pts</p>
                  <div className="kahoot-podium-bar silver">
                    <span className="text-3xl">🥈</span>
                    <span className="kahoot-font font-extrabold text-white text-lg mt-1">2</span>
                  </div>
                </div>
              )}
              {/* 1st place */}
              <div className="kahoot-podium-block">
                <p className="kahoot-font text-base font-extrabold text-white truncate max-w-[120px] mb-2">{top3[0]?.participantName}</p>
                <p className="text-yellow-300 text-sm kahoot-font font-bold mb-2">{top3[0]?.score} pts</p>
                <div className="kahoot-podium-bar gold">
                  <span className="text-4xl">🥇</span>
                  <span className="kahoot-font font-extrabold text-white text-xl mt-1">1</span>
                </div>
              </div>
              {/* 3rd place */}
              {top3.length >= 3 && (
                <div className="kahoot-podium-block">
                  <p className="kahoot-font text-sm font-bold text-white truncate max-w-[100px] mb-2">{top3[2]?.participantName}</p>
                  <p className="text-white/60 text-xs kahoot-font mb-2">{top3[2]?.score} pts</p>
                  <div className="kahoot-podium-bar bronze">
                    <span className="text-3xl">🥉</span>
                    <span className="kahoot-font font-extrabold text-white text-lg mt-1">3</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* My Result */}
          {myParticipant && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10 text-center"
                 style={{ animation: 'kahoot-slide-up 0.6s ease-out' }}>
              <p className="text-white/60 text-xs kahoot-font mb-1">{t('quiz.yourResult')}</p>
              <p className="kahoot-font text-4xl font-extrabold text-white mb-2">{myParticipant.score} pts</p>
              <div className="flex items-center justify-center gap-5 text-sm text-white/70 kahoot-font">
                <span className="flex items-center gap-1"><Trophy className="w-4 h-4 text-yellow-400" />#{myRank} {t('quiz.place')}</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-400" />{myParticipant.correctCount} {t('quiz.correct')}</span>
                <span className="flex items-center gap-1"><Zap className="w-4 h-4 text-orange-400" />{myParticipant.streakBest} {t('quiz.bestStreak')}</span>
              </div>
            </div>
          )}

          {/* Full Leaderboard */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="kahoot-font text-sm font-bold text-white">{t('quiz.leaderboard')}</h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {participants.map((p, i) => (
                <div
                  key={p.participantId}
                  className={`kahoot-leaderboard-row ${p.participantId === profile?.uid ? 'me' : ''}`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold kahoot-font ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-400 text-orange-900' : 'bg-white/10 text-white/60'
                  }`}>{i + 1}</span>
                  <span className="flex-1 text-sm text-white kahoot-font truncate">{p.participantName}</span>
                  <span className="kahoot-font font-bold text-white">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => navigate('/dashboard')} className="mt-6 text-sm text-white/60 hover:text-white flex items-center gap-1 mx-auto kahoot-font transition-colors">
            <ArrowLeft className="w-4 h-4" />{t('quiz.backToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  // Loading fallback
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <QuizBackground />
      <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin relative z-10 shadow-lg" />
    </div>
  );
};

export default QuizPlayPage;
