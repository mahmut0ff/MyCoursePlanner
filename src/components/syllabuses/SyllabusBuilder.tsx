import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, ChevronDown, ChevronUp, Save, UploadCloud, Link2, BookOpen, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        setLessons((lessonData as any[]).map((l: any) => ({ id: l.id, title: l.title || t('syllabus.untitled', 'Без названия') })));
        setExams((examData as any[]).map((e: any) => ({ id: e.id, title: e.title || t('syllabus.untitled', 'Без названия') })));
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
      toast.success(t('syllabus.saved', 'Силлабус успешно сохранён!'));
    } catch (err: any) {
      toast.error(err.message || t('syllabus.saveFailed', 'Ошибка сохранения силлабуса'));
    } finally {
      setSaving(false);
    }
  };

  const addModule = () => {
    setSyllabus(prev => prev ? {
      ...prev,
      modules: [...prev.modules, { id: generateId(), title: t('syllabus.newModule', 'Новый модуль'), order: prev.modules.length, items: [] }]
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
        return { ...m, items: [...m.items, { id: generateId(), title: t('syllabus.newTopic', 'Новая тема'), type: 'lesson', order: m.items.length }] };
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
          const adopt = ref && (!i.title || i.title === 'Новая тема' || i.title === 'Новый урок' || i.title === t('syllabus.newTopic', 'Новая тема'));
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mt-4 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-2">
            <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded" />
            <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        </div>
        <div className="h-24 bg-slate-50 dark:bg-slate-800/50 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mt-4">

      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="text-slate-400 pt-0.5">
            <BookOpen className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('syllabus.title', 'Силлабус курса')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('syllabus.subtitle', 'Управляйте программой обучения')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAIModalOpen(true)} className="btn-secondary inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {t('syllabus.aiImport', 'ИИ Импорт (PDF)')}
          </button>
          {syllabus && (
            <button onClick={() => setIsExpanded(!isExpanded)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label={isExpanded ? t('syllabus.collapse', 'Свернуть') : t('syllabus.expand', 'Развернуть')}>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!syllabus && (
        <div className="px-4 py-10 text-center">
          <div className="flex items-center justify-center mx-auto mb-2 text-slate-400">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('syllabus.notSet', 'Силлабус не настроен')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-3">{t('syllabus.notSetDesc', 'Создайте чёткую программу обучения, чтобы преподаватели следовали расписанию модулей и уроков.')}</p>

          <div className="flex justify-center gap-3">
            <button onClick={() => {
              setSyllabus({
                id: '', organizationId: '', courseId, title: t('syllabus.newSyllabus', 'Новый силлабус'), description: '',
                modules: [{ id: generateId(), title: t('syllabus.moduleN', 'Модуль {{n}}', { n: 1 }), order: 0, items: [] }],
                isMandatory: false, createdAt: '', updatedAt: ''
              });
              setIsExpanded(true);
            }} className="btn-secondary inline-flex items-center gap-1.5">
               {t('syllabus.createManual', 'Создать вручную')}
            </button>
          </div>
        </div>
      )}

      {/* Builder Form */}
      {syllabus && isExpanded && (
        <div className="p-3 bg-slate-50 dark:bg-slate-900/50">

          <div className="mb-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start gap-3">
             <div className="flex-1 w-full space-y-3">
               <div>
                  <label className="label">{t('syllabus.nameLabel', 'Название программы (Силлабуса)')}</label>
                  <input type="text" className="input font-medium" value={syllabus.title} onChange={e => setSyllabus({...syllabus, title: e.target.value})} />
               </div>
               <div>
                  <label className="label">{t('syllabus.descLabel', 'Краткое описание / Цели')}</label>
                  <textarea className="input min-h-[60px]" value={syllabus.description} onChange={e => setSyllabus({...syllabus, description: e.target.value})} />
               </div>
             </div>

             <div className="w-full md:w-64 shrink-0 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={syllabus.isMandatory} onChange={e => setSyllabus({...syllabus, isMandatory: e.target.checked})} className="mt-1 w-3.5 h-3.5 accent-primary-600" />
                  <div>
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{t('syllabus.mandatory', 'Обязательная программа')}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{t('syllabus.mandatoryDesc', 'Группы этого курса ведут прогресс по этому силлабусу (дорожная карта в карточке группы). При включении в группе появляется бейдж «Обязательная».')}</span>
                  </div>
                </label>
             </div>
          </div>

          <div className="space-y-3">
            {syllabus.modules.map((mod, mIdx) => (
              <div key={mod.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                 <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col">
                      <button onClick={() => moveModule(mIdx, -1)} disabled={mIdx === 0} className="p-0.5 text-slate-300 hover:text-primary-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label={t('syllabus.up', 'Вверх')}><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveModule(mIdx, 1)} disabled={mIdx === syllabus.modules.length - 1} className="p-0.5 text-slate-300 hover:text-primary-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label={t('syllabus.down', 'Вниз')}><ChevronDown className="w-4 h-4" /></button>
                    </div>
                    <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 shrink-0">{t('syllabus.moduleN', 'Модуль {{n}}', { n: mIdx + 1 })}</span>
                    <input type="text" value={mod.title} onChange={e => updateModuleTitle(mod.id, e.target.value)} className="flex-1 bg-transparent border-none text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-0 p-0" placeholder={t('syllabus.moduleNamePh', 'Название модуля')} />
                    <button onClick={() => deleteModule(mod.id)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-md transition-colors" aria-label={t('syllabus.deleteModule', 'Удалить модуль')}>
                       <Trash2 className="w-3.5 h-3.5" />
                    </button>
                 </div>

                 <div className="p-2 space-y-0.5">
                    {mod.items.map((item, iIdx) => (
                      <div key={item.id} className="flex flex-wrap items-center gap-2 min-h-[36px] py-1 px-2 hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-md group">
                        <div className="flex flex-col shrink-0">
                          <button onClick={() => moveItem(mod.id, iIdx, -1)} disabled={iIdx === 0} className="p-0.5 text-slate-300 hover:text-primary-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label={t('syllabus.up', 'Вверх')}><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveItem(mod.id, iIdx, 1)} disabled={iIdx === mod.items.length - 1} className="p-0.5 text-slate-300 hover:text-primary-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors" aria-label={t('syllabus.down', 'Вниз')}><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.type === 'exam' ? 'bg-red-500' : item.type === 'topic' ? 'bg-slate-400' : 'bg-primary-500'}`} />

                        <select value={item.type} onChange={e => updateItemType(mod.id, item.id, e.target.value as ItemType)} className="h-6 text-xs font-medium bg-slate-100 dark:bg-slate-700 border-none rounded px-1.5 py-0 text-slate-700 dark:text-slate-300 focus:ring-0 cursor-pointer">
                           <option value="topic">{t('syllabus.typeTopic', 'Тема')}</option>
                           <option value="lesson">{t('syllabus.typeLesson', 'Лекция')}</option>
                           <option value="exam">{t('syllabus.typeExam', 'Тест')}</option>
                        </select>

                        <input type="text" value={item.title} onChange={e => updateItemTitle(mod.id, item.id, e.target.value)} className="flex-1 min-w-[120px] bg-transparent border-none text-sm text-slate-700 dark:text-slate-200 focus:ring-0 p-0" placeholder={t('syllabus.itemNamePh', 'Название урока/темы')} />

                        {/* Link to a real lesson / exam */}
                        {item.type === 'lesson' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Link2 className={`w-3.5 h-3.5 ${item.lessonPlanId ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                            <select value={item.lessonPlanId || ''} onChange={e => linkItem(mod.id, item.id, 'lesson', e.target.value)} className="h-6 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0 text-slate-700 dark:text-slate-300 focus:ring-0 cursor-pointer max-w-[160px] truncate">
                              <option value="">{t('syllabus.linkLesson', '— привязать урок —')}</option>
                              {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                            </select>
                          </div>
                        )}
                        {item.type === 'exam' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Link2 className={`w-3.5 h-3.5 ${item.examId ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                            <select value={item.examId || ''} onChange={e => linkItem(mod.id, item.id, 'exam', e.target.value)} className="h-6 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0 text-slate-700 dark:text-slate-300 focus:ring-0 cursor-pointer max-w-[160px] truncate">
                              <option value="">{t('syllabus.linkExam', '— привязать тест —')}</option>
                              {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                            </select>
                          </div>
                        )}

                        <button onClick={() => deleteItem(mod.id, item.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-md transition-colors shrink-0" aria-label={t('common.delete', 'Удалить')}>
                           <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {mod.items.length === 0 && (
                      <p className="text-xs text-slate-400 px-2 py-1">{t('syllabus.moduleEmpty', 'В модуле пока нет элементов')}</p>
                    )}
                    <div className="pt-1">
                      <button onClick={() => addItemToModule(mod.id)} className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> {t('syllabus.addItem', 'Добавить элемент')}
                      </button>
                    </div>
                 </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
             <button onClick={addModule} className="btn-secondary inline-flex items-center gap-1.5 !border-dashed">
               <Plus className="w-3.5 h-3.5" /> {t('syllabus.addModule', 'Добавить модуль')}
             </button>
             <div className="flex-1" />
             <button onClick={handleSave} disabled={saving} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-60">
               {saving ? t('common.saving', 'Сохранение...') : <><Save className="w-3.5 h-3.5" /> {t('syllabus.save', 'Сохранить силлабус')}</>}
             </button>
          </div>

          {/* Linked-content hint */}
          <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />
            {t('syllabus.linkHint', 'Привяжите пункты к реальным урокам и тестам — тогда из дорожной карты группы они будут открываться напрямую.')}
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
