import React, { useState } from 'react';
import { apiAIRoster } from '../../lib/api';
import { Sparkles, Loader2, Send, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface RosterRow { name: string; phone: string; role: string; group?: string | null; status: string; link?: string; error?: string }

const EXAMPLES = [
  'Добавь Айгуль Сатарову +996700112233 в группу Англ-A2',
  'Новый преподаватель Бекзат, телефон 0555445566',
];

const QuickAddBox: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [results, setResults] = useState<RosterRow[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const submit = async (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setReply('');
    setResults([]);
    try {
      const res = await apiAIRoster(v);
      setReply(res?.data?.reply || '');
      setResults(Array.isArray(res?.data?.results) ? res.data.results : []);
      setText('');
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const copy = (link: string, i: number) => {
    navigator.clipboard.writeText(link);
    setCopied(i);
    toast.success('Скопировано');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Быстрое добавление</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Напишите словами — AI создаст аккаунт и ссылку</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Добавь Айгуль +996700… в группу A2" className="input flex-1" />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary flex items-center gap-1.5 shrink-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {results.length === 0 && !reply && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => submit(ex)} className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary-600 hover:border-primary-300 transition-colors">{ex}</button>
          ))}
        </div>
      )}

      {reply && <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">{reply}</p>}

      {results.length > 0 && (
        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700/60">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {r.name}{r.role === 'teacher' ? ' · преподаватель' : ''}{r.group ? ` · ${r.group}` : ''}
                </p>
                {r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate block">{r.link}</a> : <span className="text-xs text-red-500">{r.error || 'ошибка'}</span>}
              </div>
              {r.link && (
                <button onClick={() => copy(r.link!, i)} className="p-1.5 text-slate-400 hover:text-primary-600 shrink-0">
                  {copied === i ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuickAddBox;
