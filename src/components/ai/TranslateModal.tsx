import React, { useState } from 'react';
import { X, Languages, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';

const LANGS = ['Русский', 'English', 'Кыргызча', 'Türkçe', 'Deutsch', 'Español'];

const TranslateModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('English');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const translate = async () => {
    if (!text.trim()) { toast.error('Введите текст'); return; }
    setLoading(true);
    setResult('');
    try {
      const res = await apiAIGenerate({ type: 'translate', prompt: `Целевой язык: ${lang}.\n\nТекст:\n${text.trim()}` });
      setResult(res?.data?.translation || '');
      if (!res?.data?.translation) toast.error('Не удалось перевести');
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка перевода');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success('Скопировано');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400 flex items-center justify-center">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-перевод</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Перевод материалов и объявлений</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input w-full min-h-[120px] resize-y"
            placeholder="Вставьте текст для перевода…"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="input w-auto">
              {LANGS.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={translate} disabled={loading} className="btn-primary flex items-center gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Перевести
            </button>
          </div>

          {result && (
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 relative">
              <button onClick={copy} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed pr-8">{result}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranslateModal;
