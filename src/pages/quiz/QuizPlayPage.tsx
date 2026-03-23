import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToSession, subscribeToParticipants } from '../../services/quiz.service';
import { apiGetQuizSession, apiSubmitQuizAnswer, apiJoinQuizSession } from '../../lib/api';
import type { QuizSession, SessionParticipant } from '../../types';
import {
  Trophy, Users, Zap, CheckCircle, XCircle, Clock, Star,
  Loader2, Gamepad2, ArrowLeft
} from 'lucide-react';


type GamePhase = 'lobby' | 'question' | 'answer_feedback' | 'leaderboard' | 'results';

// Color palette for answer options
const OPTION_COLORS = [
  'bg-red-500 hover:bg-red-600',
  'bg-blue-500 hover:bg-blue-600',
  'bg-amber-500 hover:bg-amber-600',
  'bg-emerald-500 hover:bg-emerald-600',
  'bg-purple-500 hover:bg-purple-600',
  'bg-pink-500 hover:bg-pink-600',
  'bg-cyan-500 hover:bg-cyan-600',
  'bg-orange-500 hover:bg-orange-600',
];

const OPTION_SHAPES = ['◆', '▲', '●', '■', '★', '♦', '♥', '♠'];

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

  // Subscribe to real-time session updates
  useEffect(() => {
    if (!sessionId) return;

    // Ensure joined
    apiJoinQuizSession({ sessionId }).catch(() => {});

    const unsubSession = subscribeToSession(sessionId, (s) => {
      setSession(s);

      // Detect phase changes
      if (s.status === 'lobby') setPhase('lobby');
      else if (s.status === 'completed') setPhase('results');
      else if (s.status === 'in_progress' || s.status === 'paused') {
        // New question detected?
        if (s.currentQuestionIndex !== prevQuestionIndex.current) {
          prevQuestionIndex.current = s.currentQuestionIndex;
          setSelectedAnswer(null);
          setSubmitted(false);
          setAnswerResult(null);
          setPhase('question');
          // Fetch current question
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

  // Timer countdown
  useEffect(() => {
    if (phase !== 'question' || submitted) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Auto-submit with no answer if time runs out
          if (!submitted) {
            handleSubmit(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentQuestion, submitted]);

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
    } catch (e: any) {
      // Double-submit or other error — show feedback anyway
      setPhase('answer_feedback');
    } finally {
      setSubmitting(false);
    }
  }, [submitted, submitting, sessionId, currentQuestion, selectedAnswer, startTime]);

  const handleSelectOption = (optId: string) => {
    if (submitted) return;
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
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary-400 to-purple-500 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{session?.quizTitle || t('quiz.waitingTitle')}</h2>
          <p className="text-sm text-slate-500 mb-6">{t('quiz.waitingForHost')}</p>

          <div className="card p-4 mb-4">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Users className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{participants.length} {t('quiz.players')}</span>
            </div>
            <div className="flex flex-wrap gap-1 justify-center max-h-32 overflow-y-auto">
              {participants.map(p => (
                <span key={p.participantId} className={`text-[10px] px-2 py-0.5 rounded-full ${p.participantId === profile?.uid ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 font-semibold' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {p.participantName}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
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

    return (
      <div className="max-w-2xl mx-auto">
        {/* Timer & Progress */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">Q{(session?.currentQuestionIndex || 0) + 1} / {session?.totalQuestions}</span>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-sm ${timeLeft <= 5 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
            <Clock className="w-3.5 h-3.5" />{timeLeft}s
          </div>
        </div>

        {/* Timer bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-5">
          <div className={`h-1.5 rounded-full transition-all duration-1000 ${timeLeft <= 5 ? 'bg-red-500' : 'bg-primary-500'}`}
            style={{ width: `${(timeLeft / (currentQuestion.timerSeconds || 30)) * 100}%` }} />
        </div>

        {/* Question */}
        <div className="card p-5 mb-4">
          {currentQuestion.mediaUrl && currentQuestion.mediaType === 'image' && (
            <img src={currentQuestion.mediaUrl} alt="" className="w-full max-h-48 object-contain rounded-lg mb-3" />
          )}
          {currentQuestion.mediaUrl && currentQuestion.mediaType === 'audio' && (
            <audio src={currentQuestion.mediaUrl} controls className="w-full mb-3" />
          )}
          {currentQuestion.passageText && (
            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg mb-3 text-xs text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto">
              {currentQuestion.passageText}
            </div>
          )}
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{currentQuestion.text}</h2>
          {currentQuestion.helpText && (
            <p className="text-xs text-slate-400 mt-1">{currentQuestion.helpText}</p>
          )}
        </div>

        {/* Short text answer */}
        {isShortText ? (
          <div className="mb-4">
            <input
              value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              placeholder={t('quiz.typeAnswer')}
              className="input text-sm w-full py-3"
              disabled={submitted}
              autoFocus
            />
          </div>
        ) : (
          /* Option buttons */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {currentQuestion.options?.map((opt: any, i: number) => {
              const isSelected = Array.isArray(selectedAnswer) ? selectedAnswer.includes(opt.id) : selectedAnswer === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  disabled={submitted}
                  className={`relative p-4 rounded-xl text-white font-medium text-sm text-left transition-all ${OPTION_COLORS[i % OPTION_COLORS.length]} ${isSelected ? 'ring-4 ring-white/50 scale-[1.02] shadow-lg' : 'opacity-90 hover:opacity-100 hover:scale-[1.01]'} disabled:cursor-not-allowed`}
                >
                  <span className="text-lg mr-2 opacity-60">{OPTION_SHAPES[i % OPTION_SHAPES.length]}</span>
                  {opt.text}
                  {opt.imageUrl && <img src={opt.imageUrl} alt="" className="mt-2 max-h-20 rounded" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Submit button */}
        {!submitted && (
          <button
            onClick={() => handleSubmit()}
            disabled={submitting || (!selectedAnswer && !isShortText && !isPoll)}
            className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 hover:opacity-90"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isMultiSelect ? t('quiz.submitAnswers') : t('quiz.submit'))}
          </button>
        )}

        {/* Waiting after submit */}
        {submitted && !answerResult && (
          <div className="text-center py-4">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500 mb-2" />
            <p className="text-xs text-slate-400">{t('quiz.submitting')}</p>
          </div>
        )}
      </div>
    );
  }

  // ─── ANSWER FEEDBACK PHASE ───
  if (phase === 'answer_feedback') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          {answerResult?.isCorrect ? (
            <>
              <div className="w-20 h-20 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">{t('quiz.correct')}! 🎉</h2>
            </>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">{answerResult ? t('quiz.incorrect') : t('quiz.timeUp')} 😔</h2>
            </>
          )}

          {answerResult && (
            <div className="card p-4 mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t('quiz.points')}</span>
                <span className="font-bold text-primary-600">+{answerResult.pointsEarned || 0}</span>
              </div>
              {answerResult.speedBonusEarned > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1"><Zap className="w-3 h-3" />{t('quiz.speedBonus')}</span>
                  <span className="text-amber-500">+{answerResult.speedBonusEarned}</span>
                </div>
              )}
              {answerResult.streakBonusEarned > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1"><Star className="w-3 h-3" />{t('quiz.streakBonus')}</span>
                  <span className="text-orange-500">+{answerResult.streakBonusEarned}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">{t('quiz.totalScore')}</span>
                <span className="font-bold text-slate-900 dark:text-white">{answerResult.totalScore}</span>
              </div>
              {answerResult.answerExplanation && (
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">
                  💡 {answerResult.answerExplanation}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
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
      <div className="max-w-lg mx-auto text-center py-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('quiz.gameOver')}! 🏆</h1>
        <p className="text-sm text-slate-500 mb-6">{session?.quizTitle}</p>

        {/* Podium */}
        {top3.length >= 1 && (
          <div className="flex items-end justify-center gap-4 mb-6">
            {top3.length >= 2 && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl mb-1 mx-auto">🥈</div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px] mx-auto">{top3[1]?.participantName}</p>
                <p className="text-xs text-slate-400">{top3[1]?.score} pts</p>
              </div>
            )}
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-3xl mb-1 mx-auto ring-2 ring-amber-400">🥇</div>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[100px] mx-auto">{top3[0]?.participantName}</p>
              <p className="text-xs text-amber-600 font-semibold">{top3[0]?.score} pts</p>
            </div>
            {top3.length >= 3 && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-2xl mb-1 mx-auto">🥉</div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px] mx-auto">{top3[2]?.participantName}</p>
                <p className="text-xs text-slate-400">{top3[2]?.score} pts</p>
              </div>
            )}
          </div>
        )}

        {/* My result */}
        {myParticipant && (
          <div className="card p-5 mb-6 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border-primary-200 dark:border-primary-800">
            <p className="text-xs text-slate-500 mb-1">{t('quiz.yourResult')}</p>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mb-1">{myParticipant.score} pts</p>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />#{myRank} {t('quiz.place')}</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />{myParticipant.correctCount} {t('quiz.correct')}</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-orange-500" />{myParticipant.streakBest} {t('quiz.bestStreak')}</span>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="card overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t('quiz.leaderboard')}</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-64 overflow-y-auto">
            {participants.map((p, i) => (
              <div key={p.participantId} className={`flex items-center gap-3 px-4 py-2.5 ${p.participantId === profile?.uid ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>{i + 1}</span>
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{p.participantName}</span>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => navigate('/dashboard')} className="mt-6 text-sm text-primary-600 hover:underline flex items-center gap-1 mx-auto">
          <ArrowLeft className="w-4 h-4" />{t('quiz.backToDashboard')}
        </button>
      </div>
    );
  }

  // Loading fallback
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" />
    </div>
  );
};

export default QuizPlayPage;
