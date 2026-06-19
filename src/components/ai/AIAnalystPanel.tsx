import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, Send, Loader2, BarChart3, TrendingUp } from 'lucide-react';
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

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">AI-аналитик</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Спросите что угодно о вашем центре — отвечаю по вашим данным</p>
        </div>
      </div>

      <div ref={scrollRef} className="px-5 py-4 space-y-4 max-h-[420px] overflow-y-auto min-h-[160px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">Примеры вопросов:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-left text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{m.content}</div>
            ) : (
              <div className="max-w-[90%] w-full">
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
                {m.highlights && m.highlights.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    {m.highlights.map((h, j) => (
                      <div key={j} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{h.label}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{h.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Анализирую данные…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="border-t border-slate-100 dark:border-slate-700 p-3 flex items-center gap-2"
      >
        <div className="flex-1 relative">
          <BarChart3 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Например: какой курс самый прибыльный?"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-10 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Спросить</span>
        </button>
      </form>

      <div className="px-5 pb-3 -mt-1">
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Ответы основаны только на ваших реальных данных за текущий период.
        </p>
      </div>
    </div>
  );
};

export default AIAnalystPanel;
