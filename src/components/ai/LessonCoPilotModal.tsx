import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X, Sparkles, Loader2, Wand2, Check } from 'lucide-react';
import { apiAIGenerate } from '../../lib/api';
import toast from 'react-hot-toast';

interface QuickAction { id: string; label: string; instruction: string }

const ACTIONS: QuickAction[] = [
  { id: 'improve', label: 'Улучшить', instruction: 'Улучши и сделай текст более понятным и структурированным, сохрани смысл.' },
  { id: 'simplify', label: 'Упростить', instruction: 'Перепиши проще, для начинающих, короткими предложениями.' },
  { id: 'expand', label: 'Расширить', instruction: 'Расширь и дополни деталями, примерами и пояснениями.' },
  { id: 'summary', label: 'Конспект', instruction: 'Сделай краткий конспект в виде маркированного списка ключевых тезисов.' },
  { id: 'examples', label: 'Примеры', instruction: 'Добавь 2-3 наглядных примера по теме.' },
  { id: 'quiz', label: 'Вопросы для проверки', instruction: 'Составь 5 вопросов для самопроверки по этому материалу с краткими ответами.' },
  { id: 'translate_en', label: 'Перевести на English', instruction: 'Translate this lesson content into English, keeping the formatting.' },
];

const LessonCoPilotModal: React.FC<{ open: boolean; onClose: () => void; editor: Editor | null }> = ({ open, onClose, editor }) => {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultHtml, setResultHtml] = useState('');
  const [inserted, setInserted] = useState(false);

  if (!open) return null;

  const getSource = (): { text: string; hasSelection: boolean } => {
    if (!editor) return { text: '', hasSelection: false };
    const { from, to } = editor.state.selection;
    const sel = editor.state.doc.textBetween(from, to, '\n').trim();
    if (sel) return { text: sel, hasSelection: true };
    return { text: editor.getText().trim(), hasSelection: false };
  };

  const run = async (instr: string) => {
    const text = instr.trim();
    if (!text) { toast.error('Опишите, что сделать'); return; }
    const { text: source } = getSource();
    setLoading(true);
    setResultHtml('');
    setInserted(false);
    try {
      const prompt = `Инструкция: ${text}\n\nТекст урока:\n"""\n${source || '(пусто — сгенерируй с нуля по инструкции)'}\n"""`;
      const res = await apiAIGenerate({ type: 'lesson_assist', prompt });
      const html = res?.data?.html;
      if (typeof html === 'string' && html.trim()) {
        setResultHtml(html);
      } else {
        toast.error('Не удалось сгенерировать. Попробуйте ещё раз.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  const insert = (replace: boolean) => {
    if (!editor || !resultHtml) return;
    const chain = editor.chain().focus();
    if (replace) chain.deleteSelection();
    chain.insertContent(resultHtml).run();
    setInserted(true);
    toast.success(replace ? 'Заменено' : 'Вставлено в урок');
  };

  const { hasSelection } = getSource();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-помощник урока</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasSelection ? 'Работаю с выделенным фрагментом' : 'Работаю со всем текстом урока'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => run(a.instruction)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); run(instruction); }} className="flex items-center gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Или своя инструкция: «добавь раздел про…», «сделай таблицу…»"
              className="input flex-1"
            />
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-1.5 shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">Создать</span>
            </button>
          </form>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Генерирую…
            </div>
          )}

          {resultHtml && !loading && (
            <div className="space-y-3">
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-[260px] overflow-y-auto bg-slate-50 dark:bg-slate-900/40">
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: resultHtml }} />
              </div>
              <div className="flex items-center justify-end gap-2">
                {hasSelection && (
                  <button onClick={() => insert(true)} className="btn-secondary text-sm">Заменить выделенное</button>
                )}
                <button onClick={() => insert(false)} className="btn-primary text-sm flex items-center gap-1.5">
                  {inserted ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  Вставить в урок
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonCoPilotModal;
