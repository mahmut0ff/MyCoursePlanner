import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetRoom, apiGetExam, apiSaveAttempt, apiAwardXP } from '../../lib/api';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { shuffleArray, formatTime } from '../../utils/grading';
import { showGamificationToasts } from '../../components/gamification/GamificationToasts';
import { uploadFile } from '../../services/storage.service';
import { StudentAudioRecorder } from '../../components/shared/StudentAudioRecorder';
import type { ExamRoom, Exam, Question } from '../../types';
import { Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, CheckCircle2, Volume2, ShieldCheck, Users } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
//  LOCAL BACKUP SYSTEM — Protects answers against network loss,
//  tab crash, and accidental browser close during exam.
// ═══════════════════════════════════════════════════════════════

const BACKUP_PREFIX = 'planula_exam_backup_';

interface ExamBackup {
  roomId: string;
  examId: string;
  answers: Record<string, string | string[]>;
  currentQ: number;
  startedAt: string;
  savedAt: string;
}

function getBackupKey(roomId: string): string {
  return `${BACKUP_PREFIX}${roomId}`;
}

function saveBackup(roomId: string, examId: string, answers: Record<string, string | string[]>, currentQ: number, startedAt: string): void {
  try {
    const backup: ExamBackup = {
      roomId,
      examId,
      answers,
      currentQ,
      startedAt,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getBackupKey(roomId), JSON.stringify(backup));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

function loadBackup(roomId: string): ExamBackup | null {
  try {
    const raw = localStorage.getItem(getBackupKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as ExamBackup;
  } catch {
    return null;
  }
}

function clearBackup(roomId: string): void {
  try {
    localStorage.removeItem(getBackupKey(roomId));
  } catch { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════

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
  const [recovered, setRecovered] = useState(false);
  const startRef = useRef<string>(new Date().toISOString());
  const cheatAttemptsRef = useRef<number>(0);

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

      // ── RECOVERY: Restore answers from localStorage backup ──
      const backup = loadBackup(roomId);
      if (backup && backup.examId === e.id && Object.keys(backup.answers).length > 0) {
        setAnswers(backup.answers);
        setCurrentQ(backup.currentQ || 0);
        startRef.current = backup.startedAt;
        setRecovered(true);
        // Calculate remaining time from backup
        const elapsedSec = Math.floor((Date.now() - new Date(backup.startedAt).getTime()) / 1000);
        const remaining = Math.max(0, e.durationMinutes * 60 - elapsedSec);
        setTimeLeft(remaining);
      }
    } catch {
      // Экзамен комнаты удалён (404) или комната недоступна — экран «не найдено», а не необработанная ошибка.
      setErrorStr('rooms.errors.notFound');
    } finally {
      setLoading(false);
    }
  };

  // ── AUTO-SAVE: backup answers on every change ──
  useEffect(() => {
    if (!roomId || !exam || submitted) return;
    saveBackup(roomId, exam.id, answers, currentQ, startRef.current);
  }, [answers, currentQ, roomId, exam, submitted]);

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

  // ── WAITING POLL: Check if teacher started the exam ──
  useEffect(() => {
    if (room?.status !== 'waiting') return;
    const interval = setInterval(async () => {
      try {
        const r = await apiGetRoom(room.id);
        if (r && r.status === 'active') {
          setRoom(r);
          startRef.current = new Date().toISOString(); 
          if (exam) setTimeLeft(exam.durationMinutes * 60);
          toast.success(t('rooms.examStarted', 'Экзамен начался! Удачи!'), { duration: 4000, icon: '🚀' });
        } else if (r && r.status === 'closed') {
          navigate('/dashboard');
          toast.error(t('rooms.examClosed', 'Экзамен был закрыт.'));
        }
      } catch (e) {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [room?.status, room?.id, exam, navigate, t]);

  // ── ANTI-CHEAT: Track tab/window switches ──
  useEffect(() => {
    if (submitted || loading || room?.status === 'waiting') return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cheatAttemptsRef.current += 1;
        toast.error(t('rooms.antiCheatWarning', 'Внимание! Вы свернули вкладку или переключились на другое приложение. Эта попытка была зафиксирована и будет отправлена преподавателю.'), {
          duration: 6000,
          position: 'top-center',
          icon: '🚨',
          style: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #F87171' }
        });
      }
    };
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Standard way to trigger the browser's unsaved changes dialog
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [submitted, loading, room?.status, t]);

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

  // ── SUBMIT with retry logic ──
  const handleSubmit = async (retryCount = 0) => {
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
        cheatAttempts: cheatAttemptsRef.current,
      });

      // ✅ Success — clear backup
      if (roomId) clearBackup(roomId);
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
      }).then((res: any) => {
        showGamificationToasts(res.newBadges, res.leveledUp);
      }).catch(() => {});

      navigate(`/results/${result.id}`);
    } catch (e) {
      console.error('Submit failed:', e);

      // ── RETRY with exponential backoff (max 3 retries) ──
      if (retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        toast.error(
          t('rooms.submitRetrying', 'Ошибка сети. Повтор через {{seconds}} с... (попытка {{attempt}}/4)', { seconds: delayMs / 1000, attempt: retryCount + 2 }),
          { duration: delayMs }
        );
        setSubmitting(false);
        setTimeout(() => handleSubmit(retryCount + 1), delayMs);
        return;
      }

      // All retries exhausted — answers are still safe in localStorage
      toast.error(
        t('rooms.submitFailedSafe', 'Не удалось отправить. Ваши ответы сохранены локально. Попробуйте обновить страницу.'),
        { duration: 10000 }
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div role="status" className="bg-slate-50 dark:bg-slate-950 flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>;
  if (errorStr) return <div className="bg-slate-50 dark:bg-slate-950 min-h-screen flex items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 text-center"><AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" /><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(errorStr, 'An error occurred')}</h3></div></div>;
  if (!exam || !questions.length) return <div className="bg-slate-50 dark:bg-slate-950 min-h-screen flex items-center justify-center p-4"><div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 text-center"><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('rooms.examNotAvailable', 'Exam not available')}</h3></div></div>;

  if (room?.status === 'waiting') {
    return (
      <div className="bg-slate-50 dark:bg-slate-950 min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl text-center max-w-md w-full border border-slate-200 dark:border-slate-700 exam-slide-up">
          <div className="w-10 h-10 bg-primary-50 dark:bg-primary-950 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400 animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">{t('rooms.waitingTitle', 'Ожидание преподавателя')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('rooms.waitingDesc', 'Пожалуйста, не закрывайте эту вкладку. Экзамен начнется автоматически, как только преподаватель нажмет кнопку старта.')}</p>
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2 text-sm text-primary-700 dark:text-primary-300 font-medium bg-primary-50 dark:bg-primary-950 py-2 px-4 rounded-md w-full">
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {t('rooms.waitingSync', 'Синхронизация...')}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1 py-1.5 px-3
">
              <Users className="w-3.5 h-3.5" />
              <span>{t('rooms.inWaitingRoom', 'В зале ожидания: {{count}}', { count: (room.participants?.length || 0) + 1 })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  const isLow = timeLeft <= 60;
  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return v && (Array.isArray(v) ? v.length > 0 : v.trim() !== '');
  }).length;
  const progressPercent = (answeredCount / questions.length) * 100;

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen flex flex-col font-sans">
      
      {/* Recovery Banner */}
      {recovered && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t('rooms.recoveredAnswers', 'Ваши ответы были восстановлены из автосохранения')}
          <button onClick={() => setRecovered(false)} className="ml-3 text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 underline text-xs">OK</button>
        </div>
      )}

      {/* Sleek Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        {/* Progress Bar Top Edge */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-primary-600 dark:bg-primary-500 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="max-w-[50%]">
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{exam.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {answeredCount} / {questions.length} {t('rooms.answered', 'Answered')}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border ${isLow ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-400' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'} transition-colors`}>
              <Clock className={`w-3.5 h-3.5 ${isLow ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-mono font-semibold tabular-nums">{formatTime(timeLeft)}</span>
            </div>
            
            <button
              onClick={() => { if (confirm(t('rooms.submitConfirm', 'Are you sure you want to submit?'))) handleSubmit(); }}
              disabled={submitting}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{submitting ? t('rooms.submitting', 'Submitting...') : t('rooms.submit', 'Submit Exam')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-4">
        
        {/* Top Side: Question Navigator */}
        <div className="w-full order-1">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.questionsOverview', 'Навигация по вопросам')}</h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>{t('rooms.remainingCount', 'Осталось: {{count}}', { count: questions.length - answeredCount })}</span>
              </div>
            </div>
            
            <div className="flex flex-nowrap overflow-x-auto gap-1.5 pb-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {questions.map((_, i) => {
                const qId = questions[i].id;
                const answered = answers[qId] && (Array.isArray(answers[qId]) ? (answers[qId] as string[]).length > 0 : String(answers[qId]).trim() !== '');
                const isActive = i === currentQ;
                
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`shrink-0 w-9 h-8 rounded-md text-sm font-medium tabular-nums flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white border border-primary-600'
                        : answered
                        ? 'bg-primary-50 dark:bg-primary-950 text-slate-900 dark:text-slate-100 border border-primary-200 dark:border-primary-900'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Side: Active Question */}
        <div className="flex-1 order-2 w-full">
          {/* Use key to remount and trigger animation on question change */}
          <div key={q.id} className="exam-slide-up bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 sm:p-8">
            
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium tabular-nums">
                {t('rooms.question', 'Question')} {currentQ + 1} / {questions.length}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {t('rooms.pointsCount', { count: q.points, defaultValue: '{{count}} баллов' })}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-snug mb-6">{q.text}</h2>

            {/* Media Block */}
            {q.mediaUrl && (
              <div className="mb-6 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center p-4 min-h-[200px]">
                {q.mediaType === 'image' && <img src={q.mediaUrl} alt={t('rooms.questionMediaAlt', 'Иллюстрация к вопросу')} className="max-h-[400px] object-contain rounded-md" />}
                {q.mediaType === 'video' && <video src={q.mediaUrl} controls className="max-h-[400px] w-full max-w-2xl rounded-md" />}
                {q.mediaType === 'audio' && <audio src={q.mediaUrl} controls className="w-full max-w-md mx-auto" />}
              </div>
            )}

            {/* AI Synthesized Text (TTS) Block */}
            {q.ttsText && (
              <div className="mb-6 flex justify-end">
                <button
                  onClick={() => {
                    const u = new SpeechSynthesisUtterance(q.ttsText!);
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                  className="btn-secondary inline-flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                  {t('rooms.listenQuestion', 'Прослушать вопрос')}
                </button>
              </div>
            )}

            {/* Answer Options */}
            <div className="space-y-2.5">
              {q.type === 'speaking' && (
                <div className="mb-6">
                  <StudentAudioRecorder 
                    onRecordingComplete={async (blob) => {
                       toast.loading(t('rooms.uploadingRecording', 'Загрузка записи...'), { id: 'upload-audio' });
                       try {
                         const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
                         const url = await uploadFile(`assessments/audio/${room?.id}/${q.id}/${profile?.uid}.${ext}`, blob);
                         setAnswer(q.id, url);
                         toast.success(t('rooms.audioUploaded', 'Аудио загружено'), { id: 'upload-audio' });
                       } catch (e) {
                         toast.error(t('rooms.audioUploadFailed', 'Не удалось загрузить аудио'), { id: 'upload-audio' });
                       }
                    }} 
                  />
                  {answers[q.id] && (
                    <div className="mt-3 flex items-center justify-center text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 py-2 rounded-md">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {t('rooms.audioSaved', 'Аудиоответ сохранён!')}
                    </div>
                  )}
                </div>
              )}
              {q.type === 'multiple_choice' && q.options.map((opt, oi) => {
                const selected = answers[q.id] === opt;
                return (
                  <div
                    key={oi}
                    onClick={() => setAnswer(q.id, opt)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnswer(q.id, opt); } }}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border cursor-pointer transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      selected
                        ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-950'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-colors ${selected ? 'border-primary-600 dark:border-primary-400' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-primary-600 dark:bg-primary-400" />}
                    </div>
                    <span className={`text-base ${selected ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>{opt}</span>
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
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border cursor-pointer transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      selected
                        ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-950'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-colors ${selected ? 'border-primary-600 dark:border-primary-400' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-primary-600 dark:bg-primary-400" />}
                    </div>
                    <span className={`text-base ${selected ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                      {opt === 'True' ? `✅ ${t('exams.trueOption', 'Верно')}` : `❌ ${t('exams.falseOption', 'Неверно')}`}
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
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border cursor-pointer transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      selected ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-950' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`shrink-0 w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors ${selected ? 'bg-primary-600 border-primary-600 dark:bg-primary-500 dark:border-primary-500' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-base ${selected ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>{opt}</span>
                  </div>
                );
              })}

              {q.type === 'short_answer' && (
                <textarea
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="w-full min-h-[160px] p-4 text-base rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 hover:border-slate-400 dark:hover:border-slate-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 outline-none transition-colors resize-y"
                  placeholder={t('rooms.typeAnswerHere', 'Type your answer here...')}
                />
              )}
            </div>

            {/* In-Card Navigation */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                disabled={currentQ === 0}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />{t('rooms.previous', 'Previous')}
              </button>
              
              {currentQ === questions.length - 1 ? (
                <button
                  onClick={() => { if (confirm(t('rooms.submitConfirm', 'Are you sure you want to submit?'))) handleSubmit(); }}
                  disabled={submitting}
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  {submitting ? t('rooms.submitting', 'Submitting...') : t('rooms.submit', 'Submit Exam')} <Send className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  {t('rooms.next', 'Next')} <ChevronRight className="w-3.5 h-3.5" />
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
