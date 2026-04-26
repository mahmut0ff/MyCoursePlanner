import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Save, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Syllabus } from '../../types';
import { AISyllabusImportModal } from '../ui/AISyllabusImportModal';
import { generateId } from '../../utils/grading';
import { apiGetSyllabuses, apiCreateSyllabus, apiUpdateSyllabus } from '../../lib/api';

interface Props {
  courseId: string;
}

export const SyllabusBuilder: React.FC<Props> = ({ courseId }) => {
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [isAIModalOpen, setAIModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchSyllabus = async () => {
      setLoading(true);
      try {
        const data = await apiGetSyllabuses(courseId);
        // Assuming the backend returns an array of syllabuses for the course
        if (data && data.length > 0) {
          setSyllabus(data[0]);
        }
      } catch (err) {
        console.error('Failed to load syllabus', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSyllabus();
  }, [courseId]);

  const handleAISuccess = (aiData: any) => {
    setSyllabus({
      id: '',
      organizationId: '', // Will be set on backend
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
      let saved;
      if (syllabus.id) {
        saved = await apiUpdateSyllabus(syllabus.id, syllabus);
      } else {
        saved = await apiCreateSyllabus(syllabus);
      }
      setSyllabus(saved);
      toast.success('Силлабус успешно сохранен!');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка сохранения силлабуса');
    } finally {
      setSaving(false);
    }
  };

  const addModule = () => {
    setSyllabus(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        modules: [...prev.modules, { id: generateId(), title: 'Новый модуль', order: prev.modules.length, items: [] }]
      };
    });
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
        return {
          ...m, items: [...m.items, { id: generateId(), title: 'Новая тема', type: 'lesson', order: m.items.length }]
        };
      })
    } : null);
  };

  const updateItemTitle = (modId: string, itemId: string, title: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: m.items.map(i => i.id === itemId ? { ...i, title } : i) };
      })
    } : null);
  };

  const updateItemType = (modId: string, itemId: string, type: 'lesson' | 'exam' | 'topic') => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: m.items.map(i => i.id === itemId ? { ...i, type } : i) };
      })
    } : null);
  };

  const deleteItem = (modId: string, itemId: string) => {
    setSyllabus(prev => prev ? {
      ...prev, modules: prev.modules.map(m => {
        if (m.id !== modId) return m;
        return { ...m, items: m.items.filter(i => i.id !== itemId) };
      })
    } : null);
  };

  if (loading) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm mt-8">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl">
            <BookOpenIcon />
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
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 max-w-fit text-slate-400 hover:bg-slate-50 border border-slate-200 rounded-xl">
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
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">Создайте четкую программу обучения (Syllabus), чтобы преподаватели следовали расписанию модулей и уроков.</p>
          
          <div className="flex justify-center gap-3">
            <button onClick={() => {
              setSyllabus({
                id: '', organizationId: '', courseId, title: 'Новый Силлабус', description: '',
                modules: [{ id: generateId(), title: 'Модуль 1', order: 0, items: [] }],
                isMandatory: false, createdAt: '', updatedAt: ''
              });
              setIsExpanded(true);
            }} className="btn-secondary font-semibold border border-slate-200 rounded-xl px-4 flex items-center gap-2">
               Создать вручную
            </button>
          </div>
        </div>
      )}

      {/* Builder Form */}
      {syllabus && isExpanded && (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50">
          
          <div className="mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start gap-4">
             <div className="flex-1 space-y-4">
               <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Название программы (Силлабуса)</label>
                  <input type="text" className="input text-sm font-semibold" value={syllabus.title} onChange={e => setSyllabus({...syllabus, title: e.target.value})} />
               </div>
               <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Краткое описание / Цели</label>
                  <textarea className="input text-sm min-h-[60px]" value={syllabus.description} onChange={e => setSyllabus({...syllabus, description: e.target.value})} />
               </div>
             </div>
             
             <div className="w-64 shrink-0 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={syllabus.isMandatory} onChange={e => setSyllabus({...syllabus, isMandatory: e.target.checked})} className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 bg-white" />
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">Обязательный режим</span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-tight">Преподаватели групп смогут вести расписание только в рамках этого силлабуса.</span>
                  </div>
                </label>
             </div>
          </div>

          <div className="space-y-4">
            {syllabus.modules.map((mod, mIdx) => (
              <div key={mod.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <div className="flex items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="cursor-move p-1 text-slate-300 hover:text-slate-500">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md">Модуль {mIdx + 1}</span>
                    <input type="text" value={mod.title} onChange={e => updateModuleTitle(mod.id, e.target.value)} className="flex-1 bg-transparent border-none text-sm font-bold text-slate-900 dark:text-white focus:ring-0 p-0" placeholder="Название модуля" />
                    <button onClick={() => deleteModule(mod.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
                 
                 <div className="p-3 space-y-2 relative">
                    <div className="absolute left-6 top-3 bottom-8 w-0.5 bg-slate-100 dark:bg-slate-700 z-0" />
                    {mod.items.map((item) => (
                      <div key={item.id} className="relative z-10 flex items-center gap-2 py-1 pl-4 pr-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg group">
                        <div className={`w-4 h-4 rounded-full border-4 border-white dark:border-slate-800 shrink-0 shadow-sm ${item.type === 'exam' ? 'bg-red-500' : 'bg-indigo-500'}`} />
                        
                        <select value={item.type} onChange={e => updateItemType(mod.id, item.id, e.target.value as any)} className="text-xs font-medium bg-slate-100 dark:bg-slate-700 border-none rounded-md px-2 py-1 text-slate-600 dark:text-slate-300 focus:ring-0 appearance-none cursor-pointer">
                           <option value="topic">Тема</option>
                           <option value="lesson">Лекция</option>
                           <option value="exam">Тест</option>
                        </select>

                        <input type="text" value={item.title} onChange={e => updateItemTitle(mod.id, item.id, e.target.value)} className="flex-1 bg-transparent border-none text-sm text-slate-700 dark:text-slate-200 focus:ring-0 p-0" placeholder="Название урока/темы" />
                        
                        <button onClick={() => deleteItem(mod.id, item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                           <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="pl-9 pt-1 relative z-10">
                      <button onClick={() => addItemToModule(mod.id)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Добавить элемент
                      </button>
                    </div>
                 </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
             <button onClick={addModule} className="btn-secondary py-2 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold border border-slate-200 border-dashed hover:border-indigo-300 shadow-none">
               <Plus className="w-4 h-4" /> Добавить Модуль
             </button>
             <div className="flex-1" />
             <button onClick={handleSave} disabled={saving} className="btn-primary py-2 px-6 rounded-xl flex items-center gap-2 shadow-md">
               {saving ? 'Сохранение...' : <><Save className="w-4 h-4" /> Сохранить Силлабус</>}
             </button>
          </div>
          
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

function BookOpenIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
