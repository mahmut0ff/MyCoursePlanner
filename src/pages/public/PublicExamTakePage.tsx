import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiGetPublicExam, apiSubmitPublicExam } from '../../lib/api';
import { Loader2, CheckCircle, Clock, Volume2, Mic, Award, Globe } from 'lucide-react';
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

// ── Interface translations for the public page (does NOT translate exam content) ──
type Lang = 'ru' | 'uz' | 'en' | 'kg';

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'kg', label: 'Кыргызча', flag: '🇰🇬' },
];

const STR: Record<Lang, Record<string, string>> = {
  ru: {
    examNotFound: 'Экзамен не найден',
    loadError: 'Не удалось загрузить экзамен. Возможно, он закрыт или удален.',
    oops: 'Упс...',
    duration: 'Длительность',
    minutes: 'мин.',
    noLimit: 'Без ограничений',
    questionsLabel: 'Вопросов в тесте',
    yourName: 'Ваше имя',
    namePlaceholder: 'Иван Иванов',
    phone: 'Номер телефона',
    phonePlaceholder: '+996 555 123 456',
    start: 'Начать тестирование',
    finish: 'Завершить',
    finishFull: 'Завершить тестирование',
    sending: 'Отправка...',
    confirmFinish: 'Вы уверены, что хотите завершить тест?',
    timeUp: 'Время вышло — тест отправлен автоматически',
    multiHint: 'Можно выбрать несколько вариантов',
    yes: 'Правда',
    no: 'Ложь',
    answerPlaceholder: 'Введите ответ...',
    speakingNote: 'Напишите развёрнутый ответ — его оценит ИИ, а преподаватель сможет скорректировать балл.',
    yourAnswer: 'Ваш ответ...',
    listen: 'Прослушать',
    thanks: 'Спасибо!',
    resultsSent: 'Ваши результаты успешно отправлены. Наш менеджер скоро свяжется с вами.',
    yourLevel: 'Ваш уровень',
    yourResult: 'Ваш результат',
    points: 'баллов',
    toastDone: 'Тест успешно завершен!',
    toastError: 'Ошибка при отправке теста',
    fillNamePhone: 'Пожалуйста, заполните имя и телефон',
  },
  uz: {
    examNotFound: 'Imtihon topilmadi',
    loadError: "Imtihonni yuklab bo'lmadi. U yopilgan yoki o'chirilgan bo'lishi mumkin.",
    oops: 'Voy...',
    duration: 'Davomiyligi',
    minutes: 'daq.',
    noLimit: 'Cheklovsiz',
    questionsLabel: 'Testdagi savollar',
    yourName: 'Ismingiz',
    namePlaceholder: 'Ali Valiyev',
    phone: 'Telefon raqami',
    phonePlaceholder: '+998 90 123 45 67',
    start: 'Testni boshlash',
    finish: 'Yakunlash',
    finishFull: 'Testni yakunlash',
    sending: 'Yuborilmoqda...',
    confirmFinish: 'Testni yakunlamoqchimisiz?',
    timeUp: 'Vaqt tugadi — test avtomatik yuborildi',
    multiHint: 'Bir nechta variantni tanlash mumkin',
    yes: "To'g'ri",
    no: "Noto'g'ri",
    answerPlaceholder: 'Javobni kiriting...',
    speakingNote: "Batafsil javob yozing — uni sun'iy intellekt baholaydi, o'qituvchi esa ballni to'g'rilashi mumkin.",
    yourAnswer: 'Javobingiz...',
    listen: 'Tinglash',
    thanks: 'Rahmat!',
    resultsSent: 'Natijalaringiz muvaffaqiyatli yuborildi. Menejerimiz tez orada siz bilan bogʻlanadi.',
    yourLevel: 'Sizning darajangiz',
    yourResult: 'Natijangiz',
    points: 'ball',
    toastDone: 'Test muvaffaqiyatli yakunlandi!',
    toastError: 'Testni yuborishda xatolik',
    fillNamePhone: 'Iltimos, ism va telefon raqamini kiriting',
  },
  en: {
    examNotFound: 'Exam not found',
    loadError: 'Could not load the exam. It may be closed or deleted.',
    oops: 'Oops...',
    duration: 'Duration',
    minutes: 'min.',
    noLimit: 'No limit',
    questionsLabel: 'Questions in the test',
    yourName: 'Your name',
    namePlaceholder: 'John Smith',
    phone: 'Phone number',
    phonePlaceholder: '+996 555 123 456',
    start: 'Start the test',
    finish: 'Finish',
    finishFull: 'Finish the test',
    sending: 'Sending...',
    confirmFinish: 'Are you sure you want to finish the test?',
    timeUp: 'Time is up — the test was submitted automatically',
    multiHint: 'You can select multiple options',
    yes: 'True',
    no: 'False',
    answerPlaceholder: 'Type your answer...',
    speakingNote: 'Write a detailed answer — it will be evaluated by AI, and the teacher can adjust the score.',
    yourAnswer: 'Your answer...',
    listen: 'Listen',
    thanks: 'Thank you!',
    resultsSent: 'Your results have been submitted successfully. Our manager will contact you soon.',
    yourLevel: 'Your level',
    yourResult: 'Your result',
    points: 'points',
    toastDone: 'Test completed successfully!',
    toastError: 'Error submitting the test',
    fillNamePhone: 'Please fill in your name and phone',
  },
  kg: {
    examNotFound: 'Экзамен табылган жок',
    loadError: 'Экзаменди жүктөө мүмкүн болбоду. Балким ал жабылган же өчүрүлгөн.',
    oops: 'Ой...',
    duration: 'Узактыгы',
    minutes: 'мүн.',
    noLimit: 'Чексиз',
    questionsLabel: 'Тесттеги суроолор',
    yourName: 'Атыңыз',
    namePlaceholder: 'Айбек Асанов',
    phone: 'Телефон номери',
    phonePlaceholder: '+996 555 123 456',
    start: 'Тестти баштоо',
    finish: 'Аяктоо',
    finishFull: 'Тестти аяктоо',
    sending: 'Жөнөтүлүүдө...',
    confirmFinish: 'Тестти аяктагыңыз келеби?',
    timeUp: 'Убакыт бүттү — тест автоматтык түрдө жөнөтүлдү',
    multiHint: 'Бир нече вариантты тандай аласыз',
    yes: 'Туура',
    no: 'Туура эмес',
    answerPlaceholder: 'Жоопту жазыңыз...',
    speakingNote: 'Толук жооп жазыңыз — аны жасалма интеллект баалайт, мугалим баллды оңдой алат.',
    yourAnswer: 'Жообуңуз...',
    listen: 'Угуу',
    thanks: 'Рахмат!',
    resultsSent: 'Натыйжаларыңыз ийгиликтүү жөнөтүлдү. Менеджерибиз жакында сиз менен байланышат.',
    yourLevel: 'Сиздин деңгээлиңиз',
    yourResult: 'Натыйжаңыз',
    points: 'балл',
    toastDone: 'Тест ийгиликтүү аякталды!',
    toastError: 'Тестти жөнөтүүдө ката',
    fillNamePhone: 'Сураныч, атыңызды жана телефонуңузду жазыңыз',
  },
};

// Compact language dropdown for the public page
const LangPicker: React.FC<{ lang: Lang; onChange: (l: Lang) => void; className?: string }> = ({ lang, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find(l => l.code === lang) || LANGS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-colors"
      >
        <span className="text-base">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <Globe className="w-3.5 h-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-[150px] z-50">
          {LANGS.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => { onChange(l.code); setOpen(false); }}
              className={`flex items-center gap-3 px-4 py-2.5 w-full text-sm transition-colors ${l.code === lang ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function PublicExamTakePage() {
  const { examId } = useParams();

  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI language (interface only — not exam content)
  const [lang, setLang] = useState<Lang>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('publicExamLang')) as Lang | null;
    return saved && STR[saved] ? saved : 'ru';
  });
  const tr = STR[lang];
  const changeLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem('publicExamLang', l); } catch { /* ignore */ }
  };

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
      setError(STR[lang].examNotFound);
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
        setError(STR[lang].loadError);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || result) return;
    if (!auto && !window.confirm(STR[lang].confirmFinish)) return;

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
      toast.success(STR[lang].toastDone);
    } catch (err) {
      console.error(err);
      toast.error(STR[lang].toastError);
      setSubmitting(false);
    }
  }, [submitting, result, examId, name, phone, answers, lang]);

  // Countdown timer (only if the exam has a duration limit)
  useEffect(() => {
    if (!started || result || timeLeft === null) return;
    if (timeLeft <= 0) {
      toast.error(STR[lang].timeUp);
      handleSubmit(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((prev) => (prev === null ? null : prev - 1)), 1000);
    return () => clearTimeout(t);
  }, [started, result, timeLeft, handleSubmit, lang]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error(tr.fillNamePhone);
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
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">{tr.oops}</h2>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  // Stage 3: Result
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 relative">
        <LangPicker lang={lang} onChange={changeLang} className="absolute top-4 right-4" />
        <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-xl max-w-md w-full text-center animate-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-3">{tr.thanks}</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] mx-auto leading-relaxed">
            {tr.resultsSent}
          </p>

          {/* Level verdict (placement tests) */}
          {result.level && (
            <div className="bg-gradient-to-br from-primary-600 to-indigo-600 p-6 rounded-2xl mb-4 text-white">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2 text-primary-100">
                <Award className="w-4 h-4" /> {tr.yourLevel}
              </div>
              <div className="text-4xl font-black mb-1">{result.level}</div>
              {result.levelDescription && (
                <p className="text-sm text-primary-100 leading-relaxed">{result.levelDescription}</p>
              )}
            </div>
          )}

          {result.showResultsImmediately && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{tr.yourResult}</div>
              <div className="text-5xl font-black text-primary-600 dark:text-primary-400 mb-2">{result.percentage}%</div>
              <div className="text-sm font-medium text-slate-500">
                {result.score} / {result.totalPoints} {tr.points}
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
        <div className="flex justify-end p-4">
          <LangPicker lang={lang} onChange={changeLang} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 pt-0">
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
                  {tr.duration}: {exam.durationMinutes ? `${exam.durationMinutes} ${tr.minutes}` : tr.noLimit}.
                  <br />{tr.questionsLabel}: {questions.length}.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
                    {tr.yourName}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full bg-slate-50 dark:bg-slate-900/50 py-3.5"
                    placeholder={tr.namePlaceholder}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
                    {tr.phone}
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input w-full bg-slate-50 dark:bg-slate-900/50 py-3.5"
                    placeholder={tr.phonePlaceholder}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-4 text-lg font-bold shadow-xl shadow-primary-500/20 mt-4 rounded-2xl"
              >
                {tr.start}
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
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="font-bold text-slate-900 dark:text-white truncate pr-1 flex-1 min-w-0">{exam.title}</div>
          <LangPicker lang={lang} onChange={changeLang} />
          {timeLeft !== null && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono font-bold text-sm shrink-0 ${isLow ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}>
              <Clock className={`w-4 h-4 ${isLow ? 'animate-pulse' : ''}`} />
              {formatTime(timeLeft)}
            </div>
          )}
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="btn-primary py-2 px-4 rounded-xl text-sm font-bold shadow-md shadow-primary-500/20 shrink-0 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : tr.finish}
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
                    <Volume2 className="w-4 h-4 text-indigo-500" /> {tr.listen}
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
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">{tr.multiHint}</p>
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
                        <span className="font-bold text-lg">{opt === 'True' ? tr.yes : tr.no}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <input
                    type="text"
                    className="input w-full py-3.5 bg-slate-50 dark:bg-slate-900/50"
                    placeholder={tr.answerPlaceholder}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                )}

                {q.type === 'speaking' && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-200 dark:border-violet-800/30 font-medium mb-3">
                      <Mic className="w-4 h-4 shrink-0" /> {tr.speakingNote}
                    </div>
                    <textarea
                      className="input w-full py-3 min-h-[120px] resize-y bg-slate-50 dark:bg-slate-900/50"
                      placeholder={tr.yourAnswer}
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
            {submitting ? tr.sending : tr.finishFull}
          </button>
        </div>
      </main>
    </div>
  );
}
