import React, { useState } from 'react';
import { X, Megaphone, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';

interface Variant { caption: string; hashtags: string[] }

const PLATFORMS = ['Instagram', 'Telegram', 'WhatsApp', 'Facebook'];
const TONES = [
  { id: 'friendly', label: 'Дружелюбный' },
  { id: 'selling', label: 'Продающий' },
  { id: 'official', label: 'Официальный' },
  { id: 'fun', label: 'Молодёжный' },
];

const MarketingGeneratorModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('friendly');
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  if (!open) return null;

  const generate = async () => {
    if (!topic.trim()) { toast.error('Опишите, о чём пост'); return; }
    setLoading(true);
    setVariants([]);
    try {
      const toneLabel = TONES.find(t => t.id === tone)?.label || tone;
      const prompt = `Платформа: ${platform}. Тон: ${toneLabel}. Тема/предложение: ${topic.trim()}`;
      const res = await apiAIGenerate({ type: 'marketing_post', prompt });
      const v = res?.data?.variants;
      setVariants(Array.isArray(v) ? v : []);
      if (!Array.isArray(v) || v.length === 0) toast.error('Не удалось сгенерировать. Попробуйте ещё раз.');
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  const copy = (v: Variant, i: number) => {
    const text = `${v.caption}\n\n${(v.hashtags || []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopied(i);
    toast.success('Скопировано');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400 flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-маркетолог</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Посты для соцсетей о курсах и акциях</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">О чём пост?</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="input w-full min-h-[80px] resize-y"
              placeholder="Например: набор на курс английского для детей 8–12 лет, скидка 20% до конца месяца, первый урок бесплатно"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Платформа</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${platform === p ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Тон</label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((tn) => (
                  <button
                    key={tn.id}
                    onClick={() => setTone(tn.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tone === tn.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
                  >
                    {tn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Генерирую…' : 'Сгенерировать посты'}
          </button>

          {variants.length > 0 && (
            <div className="space-y-3 pt-2">
              {variants.map((v, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 relative group">
                  <button
                    onClick={() => copy(v, i)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    title="Скопировать"
                  >
                    {copied === i ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
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
