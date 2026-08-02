import React, { useRef, useState, useEffect } from 'react';
import { Send, Loader2, ArrowUpRight, RotateCcw } from 'lucide-react';
import { apiAIInsightsAsk } from '../../lib/api';

interface Highlight { label: string; value: string }
interface Msg { role: 'user' | 'assistant'; content: string; highlights?: Highlight[] }

const SUGGESTIONS = [
  'Какой курс приносит больше всего дохода?',
  'Сколько новых учеников пришло в этом месяце?',
  'Как изменилась посещаемость и средний балл?',
  'У меня растут или падают доходы?',
  'Сколько денег мне должны и сколько просрочено?',
];

/** Owner-facing "talk to your data" analyst. Answers strictly from org metrics. */
const AIAnalystPanel: React.FC = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await apiAIInsightsAsk(question);
      const data = res?.data || {};
      setMessages((m) => [...m, { role: 'assistant', content: data.answer || 'Не удалось получить ответ.', highlights: Array.isArray(data.highlights) ? data.highlights : [] }]);
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: err?.message || 'Ошибка запроса. Попробуйте ещё раз.' }]);
    } finally {
      setLoading(false);
    }
  };

  const started = messages.length > 0;

  return (
    <section
      aria-labelledby="ai-analyst-heading"
      className="h-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 id="ai-analyst-heading" className="font-semibold text-slate-900 dark:text-white">AI-аналитик</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Спросите о центре обычными словами — отвечу по вашим цифрам за текущий период.
          </p>
        </div>
        {started && (
          <button
            onClick={() => setMessages([])}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Заново
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`px-5 py-4 space-y-5 overflow-y-auto flex-1 ${started ? 'max-h-[460px] min-h-[240px]' : ''}`}
      >
        {!started && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/70 -mx-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => ask(s)}
                  className="group w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{s}</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <p key={i} className="text-[15px] font-semibold text-slate-900 dark:text-white max-w-[65ch]">
              {m.content}
            </p>
          ) : (
            <div key={i} className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap max-w-[68ch]">
                {m.content}
              </p>
              {m.highlights && m.highlights.length > 0 && (
                <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  {m.highlights.map((h, j) => (
                    <div key={j} className="min-w-0">
                      <dt className="text-xs text-slate-500 dark:text-slate-400 truncate">{h.label}</dt>
                      <dd className="text-lg font-semibold text-slate-900 dark:text-white truncate tabular-nums">{h.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )
        ))}

        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> Считаю по вашим данным…
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="border-t border-slate-100 dark:border-slate-700 p-3 flex items-center gap-2"
      >
        <label htmlFor="ai-analyst-input" className="sr-only">Вопрос AI-аналитику</label>
        <input
          id="ai-analyst-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Например: какой курс самый прибыльный?"
          className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-10 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Спросить</span>
        </button>
      </form>
    </section>
  );
};

export default AIAnalystPanel;
