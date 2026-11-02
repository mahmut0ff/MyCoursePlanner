import React, { useState } from 'react';
import { X, Languages, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const LANGS = ['Русский', 'English', 'Кыргызча', 'Türkçe', 'Deutsch', 'Español'];

const TranslateModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [lang, setLang] = useState('English');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const translate = async () => {
    if (!text.trim()) { toast.error(t('ai.translate.enterText', 'Введите текст')); return; }
    setLoading(true);
    setResult('');
    try {
      const res = await apiAIGenerate({ type: 'translate', prompt: `Целевой язык: ${lang}.\n\nТекст:\n${text.trim()}` });
      setResult(res?.data?.translation || '');
      if (!res?.data?.translation) toast.error(t('ai.translate.failed', 'Не удалось перевести'));
    } catch (err: any) {
      toast.error(err?.message || t('ai.translate.error', 'Ошибка перевода'));
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success(t('support.copied', 'Скопировано'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Languages className="w-3.5 h-3.5 mt-0.5 text-slate-500 dark:text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.translate.title', 'AI-перевод')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('ai.translate.subtitle', 'Перевод материалов и объявлений')}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close', 'Закрыть')} className="-mt-1 -mr-1 w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 pt-2 pb-4 space-y-3 overflow-y-auto">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input w-full min-h-[120px] resize-y"
            placeholder={t('ai.translate.textPh', 'Вставьте текст для перевода…')}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select aria-label={t('ai.translate.targetLang', 'Язык перевода')} value={lang} onChange={(e) => setLang(e.target.value)} className="input w-auto">
              {LANGS.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={translate} disabled={loading} className="btn-primary inline-flex items-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {t('ai.translate.cta', 'Перевести')}
            </button>
          </div>

          {result && (
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3 relative">
              <button onClick={copy} aria-label={t('common.copy', 'Копировать')} className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-white dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
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
