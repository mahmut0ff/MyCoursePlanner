import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, ChevronDown, ChevronUp, Save, UploadCloud, Link2, BookOpen, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Syllabus } from '../../types';
import { AISyllabusImportModal } from '../ui/AISyllabusImportModal';
import { generateId } from '../../utils/grading';
import { apiGetSyllabuses, apiCreateSyllabus, apiUpdateSyllabus, apiGetLessons, apiGetExams } from '../../lib/api';

interface Props {
  courseId: string;
}

type ItemType = 'lesson' | 'exam' | 'topic';

/** Reorder a list by moving the element at `index` one step in `dir` (-1 up / +1 down). */
function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const SyllabusBuilder: React.FC<Props> = ({ courseId }) => {
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [exams, setExams] = useState<{ id: string; title: string }[]>([]);

  const [isAIModalOpen, setAIModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [syllabusData, lessonData, examData] = await Promise.all([
          apiGetSyllabuses(courseId).catch(() => []),
          apiGetLessons().catch(() => []),
          apiGetExams().catch(() => []),
        ]);
        if (syllabusData && syllabusData.length > 0) setSyllabus(syllabusData[0]);
        setLessons((lessonData as any[]).map((l: any) => ({ id: l.id, title: l.title || 'Без названия' })));
        setExams((examData as any[]).map((e: any) => ({ id: e.id, title: e.title || 'Без названия' })));
      } catch (err) {
        console.error('Failed to load syllabus', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [courseId]);

  const handleAISuccess = (aiData: any) => {
    setSyllabus({
      id: '',
      organizationId: '',
      courseId,
      title: aiData.title,
      description: aiData.description,
      modules: aiData.modules,
      isMandatory: aiData.isMandatory || false,
      sourceFileUrl: aiData.sourceFileUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setIsExpanded(true);
  };

  const handleSave = async () => {
    if (!syllabus) return;
    setSaving(true);
    try {
      // Normalise order to match the current visual order before persisting.
      const normalised: Syllabus = {
        ...syllabus,
        modules: syllabus.modules.map((m, mi) => ({
          ...m,
          order: mi,
          items: m.items.map((it, ii) => ({ ...it, order: ii })),
        })),
      };
      const saved = normalised.id
        ? await apiUpdateSyllabus(normalised.id, normalised)
        : await apiCreateSyllabus(normalised);
      setSyllabus(saved);
      toast.success('Силлабус успешно сохранён!');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка сохранения силлабуса');
    } finally {
      setSaving(false);
    }
  };

  const addModule = () => {
    setSyllabus(prev => prev ? {
      ...prev,
      modules: [...prev.modules, { id: generateId(), title: 'Новый модуль', order: prev.modules.length, items: [] }]
    } : prev);
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    setSyllabus(prev => prev ? { ...prev, modules: move(prev.modules, index, dir) } : prev);
  };

  const updateModuleTitle = (modId: string, title: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => m.id === modId ? { ...m, title } : m)
    } : null);
  };

  const deleteModule = (modId: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.filter(m => m.id !== modId)
    } : null);
  };

  const addItemToModule = (modId: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: [...m.items, { id: generateId(), title: 'Новая тема', type: 'lesson', order: m.items.length }] };
      })
    } : null);
  };

  const moveItem = (modId: string, index: number, dir: -1 | 1) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => m.id === modId ? { ...m, items: move(m.items, index, dir) } : m)
    } : prev);
  };

  const patchItem = (modId: string, itemId: string, patch: Record<string, any>) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: m.items.map(i => i.id === itemId ? { ...i, ...patch } : i) };
      })
    } : null);
  };

  const updateItemTitle = (modId: string, itemId: string, title: string) => patchItem(modId, itemId, { title });

  const updateItemType = (modId: string, itemId: string, type: ItemType) => {
    // Switching type clears the now-irrelevant link.
    patchItem(modId, itemId, { type, lessonPlanId: undefined, examId: undefined });
  };

  const linkItem = (modId: string, itemId: string, type: ItemType, refId: string) => {
    const list = type === 'exam' ? exams : lessons;
    const ref = list.find(x => x.id === refId);
    const patch: Record<string, any> = type === 'exam'
      ? { examId: refId || undefined, lessonPlanId: undefined }
      : { lessonPlanId: refId || undefined, examId: undefined };
    // If the item still has its placeholder title, adopt the linked entity's title.
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: m.items.map(i => {
          if (i.id !== itemId) return i;
          const adopt = ref && (!i.title || i.title === 'Новая тема' || i.title === 'Новый урок');
          return { ...i, ...patch, title: adopt ? ref.title : i.title };
        }) };
      })
    } : null);
  };

  const deleteItem = (modId: string, itemId: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => m.id === modId ? { ...m, items: m.items.filter(i => i.id !== itemId) } : m)
    } : null);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm mt-8 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-2">
            <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded" />
            <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        </div>
        <div className="h-24 bg-slate-50 dark:bg-slate-800/50 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm mt-8">

      {/* Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Силлабус курса</h2>
            <p className="text-xs font-medium text-slate-500">Управляйте программой обучения</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAIModalOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <Sparkles className="w-4 h-4" /> ИИ Импорт (PDF)
          </button>
          {syllabus && (
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 max-w-fit text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors" aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!syllabus && (
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Силлабус не настроен</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">Создайте чёткую программу обучения (Syllabus), чтобы преподаватели следовали расписанию модулей и уроков.</p>

          <div className="flex justify-center gap-3">
            <button onClick={() => {
              setSyllabus({
                id: '', organizationId: '', courseId, title: 'Новый Силлабус', description: '',
                modules: [{ id: generateId(), title: 'Модуль 1', order: 0, items: [] }],
                isMandatory: false, createdAt: '', updatedAt: ''
              });
              setIsExpanded(true);
            }} className="font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl px-4 py-2 flex items-center gap-2 transition-colors">
               Создать вручную
            </button>
          </div>
        </div>
      )}

      {/* Builder Form */}
      {syllabus && isExpanded && (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50">

          <div className="mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-start gap-4">
             <div className="flex-1 w-full space-y-4">
               <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Название программы (Силлабуса)</label>
                  <input type="text" className="input text-sm font-semibold" value={syllabus.title} onChange={e => setSyllabus({...syllabus, title: e.target.value})} />
               </div>
               <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Краткое описание / Цели</label>
                  <textarea className="input text-sm min-h-[60px]" value={syllabus.description} onChange={e => setSyllabus({...syllabus, description: e.target.value})} />
               </div>
             </div>

             <div className="w-full md:w-64 shrink-0 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={syllabus.isMandatory} onChange={e => setSyllabus({...syllabus, isMandatory: e.target.checked})} className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-600 bg-white dark:bg-slate-800" />
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">Обязательная программа</span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-tight">Группы этого курса ведут прогресс по этому силлабусу (дорожная карта в карточке группы). При включении в группе появляется бейдж «Обязательная».</span>
                  </div>
                </label>
             </div>
          </div>

          <div className="space-y-4">
            {syllabus.modules.map((mod, mIdx) => (
              <div key={mod.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <div className="flex items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="flex flex-col">
                      <button onClick={() => moveModule(mIdx, -1)} disabled={mIdx === 0} className="p-0.5 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label="Вверх"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveModule(mIdx, 1)} disabled={mIdx === syllabus.modules.length - 1} className="p-0.5 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label="Вниз"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md shrink-0">Модуль {mIdx + 1}</span>
                    <input type="text" value={mod.title} onChange={e => updateModuleTitle(mod.id, e.target.value)} className="flex-1 bg-transparent border-none text-sm font-bold text-slate-900 dark:text-white focus:ring-0 p-0" placeholder="Название модуля" />
                    <button onClick={() => deleteModule(mod.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" aria-label="Удалить модуль">
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>

                 <div className="p-3 space-y-2">
                    {mod.items.map((item, iIdx) => (
                      <div key={item.id} className="flex flex-wrap items-center gap-2 py-1.5 px-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-lg group border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                        <div className="flex flex-col shrink-0">
                          <button onClick={() => moveItem(mod.id, iIdx, -1)} disabled={iIdx === 0} className="p-0.5 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label="Вверх"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveItem(mod.id, iIdx, 1)} disabled={iIdx === mod.items.length - 1} className="p-0.5 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label="Вниз"><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.type === 'exam' ? 'bg-red-500' : item.type === 'topic' ? 'bg-slate-400' : 'bg-indigo-500'}`} />

                        <select value={item.type} onChange={e => updateItemType(mod.id, item.id, e.target.value as ItemType)} className="text-xs font-medium bg-slate-100 dark:bg-slate-700 border-none rounded-md px-2 py-1 text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer">
                           <option value="topic">Тема</option>
                           <option value="lesson">Лекция</option>
                           <option value="exam">Тест</option>
                        </select>

                        <input type="text" value={item.title} onChange={e => updateItemTitle(mod.id, item.id, e.target.value)} className="flex-1 min-w-[120px] bg-transparent border-none text-sm text-slate-700 dark:text-slate-200 focus:ring-0 p-0" placeholder="Название урока/темы" />

                        {/* Link to a real lesson / exam */}
                        {item.type === 'lesson' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Link2 className={`w-3.5 h-3.5 ${item.lessonPlanId ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                            <select value={item.lessonPlanId || ''} onChange={e => linkItem(mod.id, item.id, 'lesson', e.target.value)} className="text-xs bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-md px-1.5 py-1 text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer max-w-[160px] truncate">
                              <option value="">— привязать урок —</option>
                              {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                            </select>
                          </div>
                        )}
                        {item.type === 'exam' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Link2 className={`w-3.5 h-3.5 ${item.examId ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                            <select value={item.examId || ''} onChange={e => linkItem(mod.id, item.id, 'exam', e.target.value)} className="text-xs bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-md px-1.5 py-1 text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer max-w-[160px] truncate">
                              <option value="">— привязать тест —</option>
                              {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                            </select>
                          </div>
                        )}

                        <button onClick={() => deleteItem(mod.id, item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all shrink-0" aria-label="Удалить">
                           <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {mod.items.length === 0 && (
                      <p className="text-xs text-slate-400 px-2 py-1">В модуле пока нет элементов</p>
                    )}
                    <div className="pt-1">
                      <button onClick={() => addItemToModule(mod.id)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Добавить элемент
                      </button>
                    </div>
                 </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
             <button onClick={addModule} className="py-2 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
               <Plus className="w-4 h-4" /> Добавить Модуль
             </button>
             <div className="flex-1" />
             <button onClick={handleSave} disabled={saving} className="btn-primary py-2 px-6 rounded-xl flex items-center gap-2 shadow-md disabled:opacity-60">
               {saving ? 'Сохранение...' : <><Save className="w-4 h-4" /> Сохранить Силлабус</>}
             </button>
          </div>

          {/* Linked-content hint */}
          <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />
            Привяжите пункты к реальным урокам и тестам — тогда из дорожной карты группы они будут открываться напрямую.
          </p>

        </div>
      )}

      {isAIModalOpen && (
        <AISyllabusImportModal
          isOpen={isAIModalOpen}
          onClose={() => setAIModalOpen(false)}
          onSuccess={handleAISuccess}
        />
      )}
    </div>
  );
};
