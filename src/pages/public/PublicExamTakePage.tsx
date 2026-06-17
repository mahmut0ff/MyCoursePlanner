import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiGetPublicExam, apiSubmitPublicExam } from '../../lib/api';
import { Loader2, CheckCircle, Clock, Volume2, Mic, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { shuffleArray, formatTime } from '../../utils/grading';

interface PublicQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  points: number;
  order: number;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
  ttsText?: string | null;
}

export default function PublicExamTakePage() {
  const { examId } = useParams();

  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Contact Form State
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Exam State
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!examId) {
      setError('Экзамен не найден');
      setLoading(false);
      return;
    }

    apiGetPublicExam(examId)
      .then(data => {
        setExam(data);
        let qs: PublicQuestion[] = data.questions || [];
        if (data.randomizeQuestions) qs = shuffleArray(qs);
        setQuestions(qs);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Не удалось загрузить экзамен. Возможно, он закрыт или удален.');
        setLoading(false);
      });
  }, [examId]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || result) return;
    if (!auto && !window.confirm('Вы уверены, что хотите завершить тест?')) return;

    setSubmitting(true);
    try {
      const timeSpentSeconds = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
      const data = await apiSubmitPublicExam({
        examId,
        name,
        phone,
        answers,
        timeSpentSeconds,
      });
      setResult(data);
      toast.success('Тест успешно завершен!');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при отправке теста');
      setSubmitting(false);
    }
  }, [submitting, result, examId, name, phone, answers]);

  // Countdown timer (only if the exam has a duration limit)
  useEffect(() => {
    if (!started || result || timeLeft === null) return;
    if (timeLeft <= 0) {
      toast.error('Время вышло — тест отправлен автоматически');
      handleSubmit(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((prev) => (prev === null ? null : prev - 1)), 1000);
    return () => clearTimeout(t);
  }, [started, result, timeLeft, handleSubmit]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error('Пожалуйста, заполните имя и телефон');
      return;
    }
    startRef.current = Date.now();
    if (exam?.durationMinutes) setTimeLeft(exam.durationMinutes * 60);
    setStarted(true);
  };

  const speak = (text: string) => {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-md w-full">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Упс...</h2>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  // Stage 3: Result
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-xl max-w-md w-full text-center animate-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-3">Спасибо!</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] mx-auto leading-relaxed">
            Ваши результаты успешно отправлены. Наш менеджер скоро свяжется с вами.
          </p>

          {/* Level verdict (placement tests) */}
          {result.level && (
            <div className="bg-gradient-to-br from-primary-600 to-indigo-600 p-6 rounded-2xl mb-4 text-white">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2 text-primary-100">
                <Award className="w-4 h-4" /> Ваш уровень
              </div>
              <div className="text-4xl font-black mb-1">{result.level}</div>
              {result.levelDescription && (
                <p className="text-sm text-primary-100 leading-relaxed">{result.levelDescription}</p>
              )}
            </div>
          )}

          {result.showResultsImmediately && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Ваш результат</div>
              <div className="text-5xl font-black text-primary-600 dark:text-primary-400 mb-2">{result.percentage}%</div>
              <div className="text-sm font-medium text-slate-500">
                {result.score} из {result.totalPoints} баллов
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Stage 1: Welcome form
  if (!started) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="bg-gradient-to-br from-primary-600 to-indigo-600 p-10 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <CheckCircle className="w-32 h-32" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-3 relative z-10">{exam.title}</h1>
              {exam.description && <p className="text-primary-100 text-sm max-w-sm mx-auto relative z-10">{exam.description}</p>}
            </div>

            <form onSubmit={handleStart} className="p-8 space-y-6">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 p-4 rounded-2xl font-medium flex items-center gap-3 text-sm px-5 border border-indigo-100 dark:border-indigo-800/30">
                <Clock className="w-5 h-5 text-indigo-500 shrink-0" />
                <p>
                  Длительность: {exam.durationMinutes ? `${exam.durationMinutes} мин.` : 'Без ограничений'}.
                  <br />В тесте {questions.length} {questions.length === 1 ? 'вопрос' : 'вопросов'}.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
                    Ваше имя
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full bg-slate-50 dark:bg-slate-900/50 py-3.5"
                    placeholder="Иван Иванов"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
                    Номер телефона
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input w-full bg-slate-50 dark:bg-slate-900/50 py-3.5"
                    placeholder="+996 555 123 456"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-4 text-lg font-bold shadow-xl shadow-primary-500/20 mt-4 rounded-2xl"
              >
                Начать тестирование
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Stage 2: Taking Exam
  const isLow = timeLeft !== null && timeLeft <= 60;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="font-bold text-slate-900 dark:text-white truncate pr-2 flex-1 min-w-0">{exam.title}</div>
          {timeLeft !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm shrink-0 ${isLow ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}>
              <Clock className={`w-4 h-4 ${isLow ? 'animate-pulse' : ''}`} />
              {formatTime(timeLeft)}
            </div>
          )}
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="btn-primary py-2 px-5 rounded-xl text-sm font-bold shadow-md shadow-primary-500/20 shrink-0 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Завершить'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 pb-32">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </div>
              <div className="pt-2 flex-1 min-w-0">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4 leading-relaxed whitespace-pre-wrap">{q.text}</h3>

                {/* Media attachment */}
                {q.mediaUrl && (
                  <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-center p-3">
                    {q.mediaType === 'image' && <img src={q.mediaUrl} alt="Материал к вопросу" className="max-h-80 object-contain rounded-xl" />}
                    {q.mediaType === 'video' && <video src={q.mediaUrl} controls className="max-h-80 w-full rounded-xl" />}
                    {q.mediaType === 'audio' && <audio src={q.mediaUrl} controls className="w-full" />}
                  </div>
                )}

                {/* TTS listen button */}
                {q.ttsText && (
                  <button
                    type="button"
                    onClick={() => speak(q.ttsText!)}
                    className="mb-5 inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  >
                    <Volume2 className="w-4 h-4 text-indigo-500" /> Прослушать
                  </button>
                )}

                {q.type === 'multiple_choice' && (
                  <div className="space-y-3">
                    {q.options.map((opt, i) => (
                      <label key={i} className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${answers[q.id] === opt ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10' : 'border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          className="w-5 h-5 text-primary-600 focus:ring-primary-500 bg-white border-slate-300"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'multi_select' && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">Можно выбрать несколько вариантов</p>
                    {q.options.map((opt, i) => {
                      const arr: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const checked = arr.includes(opt);
                      return (
                        <label key={i} className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${checked ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10' : 'border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setAnswers(prev => {
                              const cur: string[] = Array.isArray(prev[q.id]) ? prev[q.id] : [];
                              const next = checked ? cur.filter(o => o !== opt) : [...cur, opt];
                              return { ...prev, [q.id]: next };
                            })}
                            className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 bg-white border-slate-300"
                          />
                          <span className="text-slate-700 dark:text-slate-300 font-medium">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-4">
                    {['True', 'False'].map(opt => (
                      <label key={opt} className={`flex justify-center p-4 rounded-2xl border-2 cursor-pointer transition-all ${answers[q.id] === opt ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10 text-primary-700' : 'border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                        <input type="radio" value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers(p => ({ ...p, [q.id]: opt }))} className="hidden" />
                        <span className="font-bold text-lg">{opt === 'True' ? 'Правда' : 'Ложь'}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <input
                    type="text"
                    className="input w-full py-3.5 bg-slate-50 dark:bg-slate-900/50"
                    placeholder="Введите ответ..."
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                )}

                {q.type === 'speaking' && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-200 dark:border-violet-800/30 font-medium mb-3">
                      <Mic className="w-4 h-4 shrink-0" /> Напишите развёрнутый ответ. Преподаватель оценит его вручную.
                    </div>
                    <textarea
                      className="input w-full py-3 min-h-[120px] resize-y bg-slate-50 dark:bg-slate-900/50"
                      placeholder="Ваш ответ..."
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="text-center pt-8">
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="btn-primary py-4 px-12 rounded-2xl text-lg font-bold shadow-xl shadow-primary-500/20 disabled:opacity-50"
          >
            {submitting ? 'Отправка...' : 'Завершить тестирование'}
          </button>
        </div>
      </main>
    </div>
  );
}
