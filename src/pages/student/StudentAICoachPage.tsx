import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../contexts/OrgContext';
import {
  apiAITutor, apiAIPractice, apiAIStudyPlan, apiAISpeaking,
} from '../../lib/api';
import {
  Sparkles, Send, Loader2, GraduationCap, Dumbbell, ListChecks, MessagesSquare,
  Lock, Lightbulb, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

type Tab = 'tutor' | 'practice' | 'plan' | 'speaking';
interface ChatMsg { role: 'user' | 'assistant'; content: string; followups?: string[]; translation?: string; correction?: string | null }

const aiEnabledFor = (planId?: string) => planId === 'professional' || planId === 'enterprise';

/* ─────────────── Tutor tab ─────────────── */
const TutorTab: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(m => [...m, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await apiAITutor(question, history);
      const d = res?.data || {};
      setMessages(m => [...m, { role: 'assistant', content: d.answer || t('student.aiCoach.noAnswer', 'Не удалось ответить.'), followups: Array.isArray(d.followups) ? d.followups : [] }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', content: err?.message || t('student.aiCoach.errorRetry', 'Ошибка. Попробуйте ещё раз.') }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <GraduationCap className="w-6 h-6 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{t('student.aiCoach.tutorEmptyTitle', 'Спросите что-нибудь по учёбе')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('student.aiCoach.tutorEmptyHint', 'Например: «объясни тему прошлого урока простыми словами»')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] bg-primary-600 text-white rounded-lg rounded-br-sm px-3 py-2 text-sm">{m.content}</div>
            ) : (
              <div className="max-w-[90%] w-full">
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-lg rounded-bl-sm px-3 py-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{m.content}</div>
                {m.followups && m.followups.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.followups.map((f, j) => (
                      <button key={j} onClick={() => ask(f)} className="text-xs h-6 px-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">{f}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('student.aiCoach.thinking', 'Думаю…')}</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="pt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('student.aiCoach.questionPlaceholder', 'Ваш вопрос…')} className="input flex-1" />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary inline-flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
};

/* ─────────────── Practice tab ─────────────── */
const PracticeTab: React.FC = () => {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const generate = async () => {
    if (!topic.trim()) { toast.error(t('student.aiCoach.topicRequired', 'Укажите тему')); return; }
    setLoading(true); setQuestions([]); setRevealed({});
    try {
      const res = await apiAIPractice(topic.trim(), count);
      setQuestions(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) { toast.error(err?.message || t('common.error', 'Ошибка')); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('student.aiCoach.topicPlaceholder', 'Тема для тренировки, напр. тема прошлого урока')} className="input flex-1" />
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="input sm:w-28">
          {[5, 8, 10].map(n => <option key={n} value={n}>{t('student.aiCoach.questionsShort', '{{n}} вопр.', { n })}</option>)}
        </select>
        <button onClick={generate} disabled={loading} className="btn-primary inline-flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {t('common.create', 'Создать')}
        </button>
      </div>

      {questions.map((q, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{i + 1}. {q.question}</p>
          {Array.isArray(q.options) && q.options.length > 0 && (
            <ul className="space-y-1 mb-2">
              {q.options.map((opt: string, oi: number) => {
                const correct = revealed[i] && Array.isArray(q.correctOptionIndices) && q.correctOptionIndices.includes(oi);
                return (
                  <li key={oi} className={`text-sm px-2.5 py-1 rounded-md border ${correct ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {opt}{correct && ' ✓'}
                  </li>
                );
              })}
            </ul>
          )}
          <button onClick={() => setRevealed(r => ({ ...r, [i]: !r[i] }))} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {revealed[i] ? t('student.aiCoach.hideAnswer', 'Скрыть ответ') : t('student.aiCoach.showAnswer', 'Показать ответ')}
          </button>
          {revealed[i] && (
            <div className="mt-2 text-sm bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 space-y-1">
              {q.answer && <p className="text-slate-700 dark:text-slate-200"><span className="font-medium">{t('student.aiCoach.answerLabel', 'Ответ:')}</span> {q.answer}</p>}
              {q.explanation && <p className="text-slate-500 dark:text-slate-400">{q.explanation}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ─────────────── Study plan tab ─────────────── */
const PlanTab: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ summary?: string; focusTopics?: string[]; steps?: { title: string; detail: string }[] } | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await apiAIStudyPlan();
      setPlan(res?.data || null);
    } catch (err: any) { toast.error(err?.message || t('common.error', 'Ошибка')); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={generate} disabled={loading} className="btn-primary inline-flex items-center gap-1.5">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {plan ? t('student.aiCoach.updatePlan', 'Обновить план') : t('student.aiCoach.makePlan', 'Составить план на неделю')}
      </button>

      {plan && (
        <div className="space-y-3">
          {plan.summary && (
            <div className="flex items-start gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 dark:text-slate-200">{plan.summary}</p>
            </div>
          )}
          {Array.isArray(plan.focusTopics) && plan.focusTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plan.focusTopics.map((tp, i) => (
                <span key={i} className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">{tp}</span>
              ))}
            </div>
          )}
          {Array.isArray(plan.steps) && (
            <div className="space-y-2">
              {plan.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-medium tabular-nums shrink-0">{i + 1}</div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─────────────── Speaking tab ─────────────── */
const SpeakingTab: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [level, setLevel] = useState('A2-B1');
  const [lang, setLang] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    if (!lang) { toast.error(t('student.aiCoach.chooseLangToast', 'Выберите язык для разговора')); return; }
    setInput('');
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await apiAISpeaking(next.map(m => ({ role: m.role, content: m.content })), { level, lang });
      const d = res?.data || {};
      setMessages(m => [...m, { role: 'assistant', content: d.reply || '...', translation: d.translation, correction: d.correction ?? null }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', content: err?.message || t('common.error', 'Ошибка') }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex gap-2 mb-3">
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="input w-auto">
          <option value="">{t('student.aiCoach.langPlaceholder', 'Язык…')}</option>
          {['English', 'Кыргызча', 'Русский', 'Türkçe', 'Deutsch'].map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-auto">
          {['A1', 'A2-B1', 'B2', 'C1'].map(l => <option key={l}>{l}</option>)}
        </select>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <MessagesSquare className="w-6 h-6 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{lang ? t('student.aiCoach.speakIn', 'Поговорите на {{lang}}', { lang }) : t('student.aiCoach.chooseLangToStart', 'Выберите язык, чтобы начать разговор')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('student.aiCoach.speakingHint', 'Напишите что угодно — партнёр ответит и мягко исправит ошибки')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] bg-primary-600 text-white rounded-lg rounded-br-sm px-3 py-2 text-sm">{m.content}</div>
            ) : (
              <div className="max-w-[90%] w-full space-y-1.5">
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-lg rounded-bl-sm px-3 py-2 text-sm text-slate-800 dark:text-slate-100">{m.content}</div>
                {m.translation && <p className="text-xs text-slate-400 px-1">{m.translation}</p>}
                {m.correction && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md px-2.5 py-1.5">
                    <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{m.correction}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> …</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="pt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={lang ? t('student.aiCoach.writeIn', 'Напишите на {{lang}}…', { lang }) : t('student.aiCoach.chooseLangFirst', 'Сначала выберите язык')} className="input flex-1" />
        <button type="submit" disabled={loading || !input.trim() || !lang} className="btn-primary inline-flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
};

/* ─────────────── Page ─────────────── */
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'tutor', label: 'Репетитор', icon: GraduationCap },
  { id: 'practice', label: 'Тренировка', icon: Dumbbell },
  { id: 'plan', label: 'План', icon: ListChecks },
  { id: 'speaking', label: 'Разговор', icon: MessagesSquare },
];

const StudentAICoachPage: React.FC = () => {
  const { t } = useTranslation();
  const { orgData, institutionType } = useOrg();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tutor');
  const aiEnabled = aiEnabledFor(orgData?.planId);
  // Conversation practice is inherently language-learning — surface it only for language schools.
  const isLanguageOrg = institutionType === 'language';
  const tabs = TABS.filter(tb => tb.id !== 'speaking' || isLanguageOrg);

  return (
    <div className="space-y-4">
      <div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" /> {t('student.aiCoach.title', 'AI-наставник')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">{isLanguageOrg ? t('student.aiCoach.subtitleLang', 'Личный репетитор, тренировки, план обучения и разговорная практика — на базе материалов вашего центра.') : t('student.aiCoach.subtitle', 'Личный репетитор, тренировки, план обучения — на базе материалов вашего центра.')}</p>
        </div>
      </div>

      {!aiEnabled ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-12 px-4 text-center">
          <div className="mx-auto text-slate-400 flex items-center justify-center mb-2"><Lock className="w-6 h-6" /></div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('student.aiCoach.lockedTitle', 'AI-наставник пока недоступен')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{t('student.aiCoach.lockedDesc', 'Эта функция включается вашим учебным центром. Обратитесь к администратору, чтобы получить доступ.')}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary mt-3 inline-flex items-center gap-1.5">{t('student.aiCoach.toHome', 'На главную')} <ArrowRight className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 h-8 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${tab === id ? 'border-primary-600 text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {t(`student.aiCoach.tabs.${id}`, label)}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            {tab === 'tutor' && <TutorTab />}
            {tab === 'practice' && <PracticeTab />}
            {tab === 'plan' && <PlanTab />}
            {tab === 'speaking' && <SpeakingTab />}
          </div>
        </>
      )}
    </div>
  );
};

export default StudentAICoachPage;
