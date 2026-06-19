import React, { useState } from 'react';
import { X, MessageSquareText, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';

/**
 * Generates a personalized report-card comment for a student from their
 * performance stats. Reusable: pass the student's name and a stats map.
 */
const ReportCommentModal: React.FC<{
  open: boolean;
  onClose: () => void;
  studentName: string;
  stats: Record<string, string | number>;
}> = ({ open, onClose, studentName, stats }) => {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [short, setShort] = useState('');
  const [copied, setCopied] = useState<'full' | 'short' | null>(null);

  if (!open) return null;

  const generate = async () => {
    setLoading(true);
    setComment('');
    setShort('');
    try {
      const statLines = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(', ');
      const prompt = `Ученик: ${studentName}. Показатели: ${statLines}.${note.trim() ? ` Заметка преподавателя: ${note.trim()}.` : ''}`;
      const res = await apiAIGenerate({ type: 'report_comment', prompt });
      setComment(res?.data?.comment || '');
      setShort(res?.data?.short || '');
      if (!res?.data?.comment) toast.error('Не удалось сгенерировать');
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, which: 'full' | 'short') => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success('Скопировано');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Комментарий в табель</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Персональный отзыв для {studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Заметка (необязательно)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input w-full min-h-[70px] resize-y"
              placeholder="Например: активен на уроках, но забывает делать домашнее задание"
            />
          </div>

          <button onClick={generate} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Генерирую…' : comment ? 'Перегенерировать' : 'Сгенерировать комментарий'}
          </button>

          {comment && !loading && (
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 relative">
                <button onClick={() => copy(comment, 'full')} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                  {copied === 'full' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Для табеля</p>
                <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed pr-8">{comment}</p>
              </div>
              {short && (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 relative">
                  <button onClick={() => copy(short, 'short')} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                    {copied === 'short' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Коротко (SMS / Telegram)</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed pr-8">{short}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportCommentModal;
