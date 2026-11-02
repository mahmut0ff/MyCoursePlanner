import React, { useState } from 'react';
import { X, Megaphone, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface Variant { caption: string; hashtags: string[] }

const PLATFORMS = ['Instagram', 'Telegram', 'WhatsApp', 'Facebook'];
const TONES = [
  { id: 'friendly', labelKey: 'ai.marketing.toneFriendly', label: 'Дружелюбный' },
  { id: 'selling', labelKey: 'ai.marketing.toneSelling', label: 'Продающий' },
  { id: 'official', labelKey: 'ai.marketing.toneOfficial', label: 'Официальный' },
  { id: 'fun', labelKey: 'ai.marketing.toneFun', label: 'Молодёжный' },
];

const MarketingGeneratorModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('friendly');
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  if (!open) return null;

  const generate = async () => {
    if (!topic.trim()) { toast.error(t('ai.marketing.describeTopic', 'Опишите, о чём пост')); return; }
    setLoading(true);
    setVariants([]);
    try {
      const toneLabel = TONES.find(x => x.id === tone)?.label || tone;
      const prompt = `Платформа: ${platform}. Тон: ${toneLabel}. Тема/предложение: ${topic.trim()}`;
      const res = await apiAIGenerate({ type: 'marketing_post', prompt });
      const v = res?.data?.variants;
      setVariants(Array.isArray(v) ? v : []);
      if (!Array.isArray(v) || v.length === 0) toast.error(t('ai.generateFailedRetry', 'Не удалось сгенерировать. Попробуйте ещё раз.'));
    } catch (err: any) {
      toast.error(err?.message || t('ai.generateError', 'Ошибка генерации'));
    } finally {
      setLoading(false);
    }
  };

  const copy = (v: Variant, i: number) => {
    const text = `${v.caption}\n\n${(v.hashtags || []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopied(i);
    toast.success(t('support.copied', 'Скопировано'));
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300 flex items-center justify-center">
              <Megaphone className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.marketing.title', 'AI-маркетолог')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('ai.marketing.subtitle', 'Посты для соцсетей о курсах и акциях')}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close', 'Закрыть')} className="-mt-1 -mr-1 w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 pt-2 pb-4 space-y-3 overflow-y-auto">
          <div>
            <label className="label">{t('ai.marketing.topicLabel', 'О чём пост?')}</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="input w-full min-h-[80px] resize-y"
              placeholder={t('ai.marketing.topicPh', 'Например: набор на курс английского для детей 8–12 лет, скидка 20% до конца месяца, первый урок бесплатно')}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('ai.marketing.platform', 'Платформа')}</label>
              <div className="flex flex-wrap gap-1">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`h-7 px-2 rounded-md text-sm transition-colors ${platform === p ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">{t('ai.marketing.tone', 'Тон')}</label>
              <div className="flex flex-wrap gap-1">
                {TONES.map((tn) => (
                  <button
                    key={tn.id}
                    onClick={() => setTone(tn.id)}
                    className={`h-7 px-2 rounded-md text-sm transition-colors ${tone === tn.id ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    {t(tn.labelKey, tn.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? t('ai.generating', 'Генерирую…') : t('ai.marketing.generate', 'Сгенерировать посты')}
          </button>

          {variants.length > 0 && (
            <div className="space-y-3 pt-2">
              {variants.map((v, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3 relative group">
                  <button
                    onClick={() => copy(v, i)}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-white dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title={t('common.copy', 'Копировать')}
                  >
                    {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed pr-8">{v.caption}</p>
                  {Array.isArray(v.hashtags) && v.hashtags.length > 0 && (
                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 font-medium">
                      {v.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketingGeneratorModal;
