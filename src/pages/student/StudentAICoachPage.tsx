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

type Tab = 'tutor' | 'practice' | 'plan' | 'speaking';
interface ChatMsg { role: 'user' | 'assistant'; content: string; followups?: string[]; translation?: string; correction?: string | null }

const aiEnabledFor = (planId?: string) => planId === 'professional' || planId === 'enterprise';

/* ─────────────── Tutor tab ─────────────── */
const TutorTab: React.FC = () => {
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
      setMessages(m => [...m, { role: 'assistant', content: d.answer || 'Не удалось ответить.', followups: Array.isArray(d.followups) ? d.followups : [] }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', content: err?.message || 'Ошибка. Попробуйте ещё раз.' }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <GraduationCap className="w-10 h-10 mx-auto text-violet-400 mb-3" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">Спросите что-нибудь по учёбе</p>
            <p className="text-sm text-slate-400 mt-1">Например: «объясни тему прошлого урока простыми словами»</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{m.content}</div>
            ) : (
              <div className="max-w-[90%] w-full">
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{m.content}</div>
                {m.followups && m.followups.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.followups.map((f, j) => (
                      <button key={j} onClick={() => ask(f)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 transition-colors">{f}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Думаю…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="pt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ваш вопрос…" className="input flex-1" />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};

/* ─────────────── Practice tab ─────────────── */
const PracticeTab: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const generate = async () => {
    if (!topic.trim()) { toast.error('Укажите тему'); return; }
    setLoading(true); setQuestions([]); setRevealed({});
    try {
      const res = await apiAIPractice(topic.trim(), count);
      setQuestions(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) { toast.error(err?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Тема для тренировки, напр. тема прошлого урока" className="input flex-1" />
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="input sm:w-28">
          {[5, 8, 10].map(n => <option key={n} value={n}>{n} вопр.</option>)}
        </select>
        <button onClick={generate} disabled={loading} className="btn-primary flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Создать
        </button>
      </div>

      {questions.map((q, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="font-medium text-slate-900 dark:text-white mb-2">{i + 1}. {q.question}</p>
          {Array.isArray(q.options) && q.options.length > 0 && (
            <ul className="space-y-1 mb-2">
              {q.options.map((opt: string, oi: number) => {
                const correct = revealed[i] && Array.isArray(q.correctOptionIndices) && q.correctOptionIndices.includes(oi);
                return (
                  <li key={oi} className={`text-sm px-3 py-1.5 rounded-lg border ${correct ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {opt}{correct && ' ✓'}
                  </li>
                );
              })}
            </ul>
          )}
          <button onClick={() => setRevealed(r => ({ ...r, [i]: !r[i] }))} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
            {revealed[i] ? 'Скрыть ответ' : 'Показать ответ'}
          </button>
          {revealed[i] && (
            <div className="mt-2 text-sm bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 space-y-1">
              {q.answer && <p className="text-slate-700 dark:text-slate-200"><span className="font-semibold">Ответ:</span> {q.answer}</p>}
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
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ summary?: string; focusTopics?: string[]; steps?: { title: string; detail: string }[] } | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await apiAIStudyPlan();
      setPlan(res?.data || null);
    } catch (err: any) { toast.error(err?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={generate} disabled={loading} className="btn-primary flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {plan ? 'Обновить план' : 'Составить план на неделю'}
      </button>

      {plan && (
        <div className="space-y-4">
          {plan.summary && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 rounded-xl">
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 dark:text-slate-200">{plan.summary}</p>
            </div>
          )}
          {Array.isArray(plan.focusTopics) && plan.focusTopics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {plan.focusTopics.map((tp, i) => (
                <span key={i} className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">{tp}</span>
              ))}
            </div>
          )}
          {Array.isArray(plan.steps) && (
            <div className="space-y-2">
              {plan.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{s.detail}</p>
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
    if (!lang) { toast.error('Выберите язык для разговора'); return; }
    setInput('');
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await apiAISpeaking(next.map(m => ({ role: m.role, content: m.content })), { level, lang });
      const d = res?.data || {};
      setMessages(m => [...m, { role: 'assistant', content: d.reply || '...', translation: d.translation, correction: d.correction ?? null }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', content: err?.message || 'Ошибка' }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex gap-2 mb-3">
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="input w-auto text-sm">
          <option value="">Язык…</option>
          {['English', 'Кыргызча', 'Русский', 'Türkçe', 'Deutsch'].map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-auto text-sm">
          {['A1', 'A2-B1', 'B2', 'C1'].map(l => <option key={l}>{l}</option>)}
        </select>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <MessagesSquare className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">{lang ? `Поговорите на ${lang}` : 'Выберите язык, чтобы начать разговор'}</p>
            <p className="text-sm text-slate-400 mt-1">Напишите что угодно — партнёр ответит и мягко исправит ошибки</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{m.content}</div>
            ) : (
              <div className="max-w-[90%] w-full space-y-1.5">
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100">{m.content}</div>
                {m.translation && <p className="text-xs text-slate-400 px-1">{m.translation}</p>}
                {m.correction && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-lg px-3 py-1.5">
                    <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{m.correction}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> …</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="pt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={lang ? `Напишите на ${lang}…` : 'Сначала выберите язык'} className="input flex-1" />
        <button type="submit" disabled={loading || !input.trim() || !lang} className="btn-primary flex items-center gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
  const { orgData, institutionType } = useOrg();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tutor');
  const aiEnabled = aiEnabledFor(orgData?.planId);
  // Conversation practice is inherently language-learning — surface it only for language schools.
  const isLanguageOrg = institutionType === 'language';
  const tabs = TABS.filter(t => t.id !== 'speaking' || isLanguageOrg);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white p-6 sm:p-7">
        <div className="absolute -right-6 -top-6 opacity-10"><Sparkles className="w-36 h-36" /></div>
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5"><Sparkles className="w-6 h-6" /> AI-наставник</h1>
          <p className="text-sm text-white/80 mt-1.5 max-w-xl">Личный репетитор, тренировки, план обучения{isLanguageOrg ? ' и разговорная практика' : ''} — на базе материалов вашего центра.</p>
        </div>
      </div>

      {!aiEnabled ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 mx-auto bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-4"><Lock className="w-6 h-6" /></div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">AI-наставник пока недоступен</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">Эта функция включается вашим учебным центром. Обратитесь к администратору, чтобы получить доступ.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary mt-5 inline-flex items-center gap-1.5">На главную <ArrowRight className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${tab === id ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5">
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
