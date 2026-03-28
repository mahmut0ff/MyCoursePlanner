import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetRoom, apiGetExam, apiSaveAttempt, apiAwardXP } from '../../lib/api';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { shuffleArray, formatTime } from '../../utils/grading';
import type { ExamRoom, Exam, Question } from '../../types';
import { Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ExamTakePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [errorStr, setErrorStr] = useState('');

  const [room, setRoom] = useState<ExamRoom | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const startRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    loadData();
  }, [roomId]);

  const loadData = async () => {
    if (!roomId) return;
    try {
      const r = await apiGetRoom(roomId);
      if (!r) { setErrorStr('rooms.errors.notFound'); return; }
      if (profile?.organizationId && r.organizationId && r.organizationId !== profile.organizationId) {
        setErrorStr('rooms.errors.notFound');
        return;
      }
      setRoom(r);
      
      const e = await apiGetExam(r.examId);
      if (!e) { navigate('/join'); return; }
      setExam(e);

      let qs = e.questions || [];
      if (e.randomizeQuestions) qs = shuffleArray(qs);
      setQuestions(qs);
      setTimeLeft(e.durationMinutes * 60);
    } finally {
      setLoading(false);
    }
  };

  // Warn the student before they accidentally close the tab during the exam
  useEffect(() => {
    if (submitted || loading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitted, loading]);

  useEffect(() => {
    if (loading || submitted || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, submitted, timeLeft]);

  const setAnswer = useCallback((qId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }, []);


  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const startTime = new Date(startRef.current).getTime();
      const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);

      const result = await apiSaveAttempt({
        examId: exam!.id,
        examTitle: exam!.title,
        roomId: room!.id,
        roomCode: room!.code,
        answers,
        startedAt: startRef.current,
        timeSpentSeconds,
      });

      setSubmitted(true);

      try {
        const token = await auth.currentUser?.getIdToken();
        fetch('/.netlify/functions/ai-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ attemptId: result.id }),
        }).catch(() => {});
      } catch {}

      apiAwardXP({
        organizationId: room!.organizationId || '',
        examId: exam!.id,
        examPassed: result.passed,
        percentage: result.percentage,
        timeSpentSeconds,
      }).catch(() => {});

      navigate(`/results/${result.id}`);
    } catch (e) {
      console.error('Submit failed:', e);
      toast.error(t('rooms.submitFailed', 'Failed to submit exam.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div role="status" className="exam-bg flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>;
  if (errorStr) return <div className="exam-bg min-h-screen flex items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl text-center"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-900 dark:text-white">{t(errorStr, 'An error occurred')}</h3></div></div>;
  if (!exam || !questions.length) return <div className="exam-bg min-h-screen flex items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl text-center"><h3 className="text-xl font-semibold text-slate-900 dark:text-white">{t('rooms.examNotAvailable', 'Exam not available')}</h3></div></div>;

  const q = questions[currentQ];
  const isLow = timeLeft <= 60;
  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return v && (Array.isArray(v) ? v.length > 0 : v.trim() !== '');
  }).length;
  const progressPercent = (answeredCount / questions.length) * 100;

  return (
    <div className="exam-bg min-h-screen flex flex-col font-sans">
      
      {/* Sleek Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
        {/* Progress Bar Top Edge */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-slate-800 dark:bg-slate-300 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="max-w-[50%]">
            <h1 className="font-bold text-slate-900 dark:text-white truncate">{exam.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {answeredCount} / {questions.length} {t('rooms.answered', 'Answered')}
            </p>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isLow ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'} transition-colors`}>
              <Clock className={`w-4 h-4 ${isLow ? 'animate-pulse' : ''}`} />
              <span className="text-lg font-mono font-bold tracking-tight">{formatTime(timeLeft)}</span>
            </div>
            
            <button
              onClick={() => { if (confirm(t('rooms.submitConfirm', 'Are you sure you want to submit?'))) handleSubmit(); }}
              disabled={submitting}
              className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-5 py-2 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{submitting ? t('rooms.submitting', 'Submitting...') : t('rooms.submit', 'Submit Exam')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col md:flex-row gap-8">
        
        {/* Left Side: Question Navigator */}
        <div className="w-full md:w-64 shrink-0 order-2 md:order-1">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 sticky top-28 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">{t('rooms.questionsOverview', 'Question Navigator')}</h3>
            <div className="grid grid-cols-5 md:grid-cols-4 gap-2">
              {questions.map((_, i) => {
                const qId = questions[i].id;
                const answered = answers[qId] && (Array.isArray(answers[qId]) ? (answers[qId] as string[]).length > 0 : String(answers[qId]).trim() !== '');
                const isActive = i === currentQ;
                
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`h-10 rounded-xl text-sm font-semibold flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md transform scale-105 z-10'
                        : answered
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 exam-card-hover'
                        : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 exam-card-hover hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>{Math.round(progressPercent)}% {t('rooms.completed', 'Completed')}</span>
              <span>{questions.length - answeredCount} {t('rooms.remaining', 'Remaining')}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Active Question */}
        <div className="flex-1 order-1 md:order-2">
          {/* Use key to remount and trigger animation on question change */}
          <div key={q.id} className="exam-slide-up bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-lg p-6 sm:p-10">
            
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold tracking-wide">
                {t('rooms.question', 'Question')} {currentQ + 1} / {questions.length}
              </span>
              <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                {q.points} {q.points !== 1 ? t('rooms.points', 'pts') : t('rooms.point', 'pt')}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white leading-snug mb-8">{q.text}</h2>

            {/* Answer Options */}
            <div className="space-y-4">
              {q.type === 'multiple_choice' && q.options.map((opt, oi) => {
                const selected = answers[q.id] === opt;
                return (
                  <div
                    key={oi}
                    onClick={() => setAnswer(q.id, opt)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnswer(q.id, opt); } }}
                    className={`exam-card-hover flex items-center gap-4 p-5 sm:p-6 rounded-2xl border-2 cursor-pointer transition-all select-none ${
                      selected
                        ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/80 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? 'border-slate-900 dark:border-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <div className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white" />}
                    </div>
                    <span className={`text-lg sm:text-xl font-medium ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{opt}</span>
                  </div>
                );
              })}

              {q.type === 'true_false' && (['True', 'False']).map((opt, oi) => {
                const selected = answers[q.id] === opt;
                return (
                  <div
                    key={oi}
                    onClick={() => setAnswer(q.id, opt)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnswer(q.id, opt); } }}
                    className={`exam-card-hover flex items-center gap-4 p-5 sm:p-6 rounded-2xl border-2 cursor-pointer transition-all select-none ${
                      selected
                        ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/80 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? 'border-slate-900 dark:border-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <div className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white" />}
                    </div>
                    <span className={`text-lg sm:text-xl font-medium ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {opt === 'True' ? '✅ Верно (True)' : '❌ Неверно (False)'}
                    </span>
                  </div>
                );
              })}

              {q.type === 'multi_select' && q.options.map((opt, oi) => {
                const currentArr = (answers[q.id] as string[]) || [];
                const selected = currentArr.includes(opt);
                return (
                  <div
                    key={oi}
                    onClick={() => {
                      const updated = selected
                        ? currentArr.filter((a) => a !== opt)
                        : [...currentArr, opt];
                      setAnswer(q.id, updated);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const updated = selected
                          ? currentArr.filter((a) => a !== opt)
                          : [...currentArr, opt];
                        setAnswer(q.id, updated);
                      }
                    }}
                    className={`exam-card-hover flex items-center gap-4 p-5 sm:p-6 rounded-2xl border-2 cursor-pointer transition-all select-none ${
                      selected ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/80 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${selected ? 'bg-slate-900 border-slate-900 dark:bg-white dark:border-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <CheckCircle2 className="w-4 h-4 text-white dark:text-slate-900" />}
                    </div>
                    <span className={`text-lg sm:text-xl font-medium ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{opt}</span>
                  </div>
                );
              })}

              {q.type === 'short_answer' && (
                <textarea
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="w-full min-h-[160px] p-6 text-lg rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:border-slate-900 dark:focus:border-white focus:ring-0 outline-none transition-all resize-y"
                  placeholder={t('rooms.typeAnswerHere', 'Type your answer here...')}
                />
              )}
            </div>

            {/* In-Card Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                disabled={currentQ === 0}
                className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />{t('rooms.previous', 'Previous')}
              </button>
              
              {currentQ === questions.length - 1 ? (
                <button
                  onClick={() => { if (confirm(t('rooms.submitConfirm', 'Are you sure you want to submit?'))) handleSubmit(); }}
                  disabled={submitting}
                  className="bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md"
                >
                  {submitting ? t('rooms.submitting', 'Submitting...') : t('rooms.submit', 'Submit Exam')} <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-colors"
                >
                  {t('rooms.next', 'Next')} <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default ExamTakePage;
