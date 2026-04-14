import React, { useState, useRef } from 'react';
import { Sparkles, X, FileText, UploadCloud, Loader2, Save, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiAIGenerate } from '../../lib/api';
import { uploadFile } from '../../services/storage.service';
import type { SyllabusModule } from '../../types';
import { generateId } from '../../utils/grading';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (extractedSyllabus: any) => void;
}

export const AISyllabusImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState('');
  
  // Editable state for the extracted syllabus
  const [syllabusTitle, setSyllabusTitle] = useState('');
  const [syllabusDesc, setSyllabusDesc] = useState('');
  const [modules, setModules] = useState<SyllabusModule[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!file) {
      toast.error('Пожалуйста, загрузите PDF или изображение.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Загрузка файла...');
    setLoadingState('Загружаем файл в облако...');

    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `syllabuses/ai-${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const uploadedUrl = await uploadFile(path, file);
      setFileUrl(uploadedUrl);

      setLoadingState('ИИ читает документ и извлекает структуру...');
      toast.loading('ИИ анализирует силлабус...', { id: toastId });
      
      const res = await apiAIGenerate({ type: 'syllabus_extraction', fileUrl: uploadedUrl });
      
      if (!res.data || !res.data.modules) {
        throw new Error('ИИ вернул неполные данные');
      }

      setSyllabusTitle(res.data.title || 'Новый силлабус');
      setSyllabusDesc(res.data.description || '');
      
      // Map AI data to internal format with fresh IDs
      const mappedModules = (res.data.modules || []).map((mod: any, mIdx: number) => ({
        id: generateId(),
        title: mod.title || `Модуль ${mIdx + 1}`,
        order: mod.order || mIdx,
        items: (mod.items || []).map((item: any, iIdx: number) => ({
          id: generateId(),
          title: item.title || `Урок ${iIdx + 1}`,
          type: item.type === 'exam' || item.type === 'topic' ? item.type : 'lesson',
          order: item.order || iIdx
        }))
      }));

      setModules(mappedModules);
      setStep('preview');
      toast.success('Структура успешно извлечена!', { id: toastId });

    } catch (err: any) {
      console.error('Syllabus AI Error:', err);
      toast.error(err.message || 'Ошибка распознавания силлабуса.', { id: toastId });
    } finally {
      setLoading(false);
      setLoadingState('');
    }
  };

  const handleSave = () => {
    if (!syllabusTitle.trim()) {
      toast.error('Введите название силлабуса');
      return;
    }
    if (modules.length === 0) {
      toast.error('Силлабус должен содержать хотя бы один модуль');
      return;
    }
    
    // Passing the draft data back to the Course page
    if (onSuccess) {
      onSuccess({
        title: syllabusTitle,
        description: syllabusDesc,
        modules,
        sourceFileUrl: fileUrl,
        isMandatory: false
      });
    }
    onClose();
  };

  const updateModuleTitle = (modId: string, title: string) => {
    setModules(prev => prev.map(m => m.id === modId ? { ...m, title } : m));
  };

  const updateItemTitle = (modId: string, itemId: string, title: string) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return { ...m, items: m.items.map(i => i.id === itemId ? { ...i, title } : i) };
    }));
  };

  const deleteItem = (modId: string, itemId: string) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return { ...m, items: m.items.filter(i => i.id !== itemId) };
    }));
  };

  const addItem = (modId: string) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return {
        ...m,
        items: [...m.items, { id: generateId(), title: 'Новая тема', type: 'lesson', order: m.items.length }]
      };
    }));
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200`}>
      <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 ${step === 'preview' ? 'w-full max-w-6xl h-[90vh]' : 'w-full max-w-lg'}`}>
        
        {/* Header */}
        <div className="relative overflow-hidden p-6 border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 dark:from-blue-500/10 dark:to-indigo-500/10 shrink-0">
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">AI Импорт Силлабуса</h2>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {step === 'upload' ? 'Извлечение структуры из PDF файлов' : 'Слеверка распознанных данных'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-white/50 dark:hover:bg-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Upload Step Body */}
        {step === 'upload' && (
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Загрузите PDF файл с утвержденной учебной программой (силлабусом). Gemini проанализирует документ и автоматически составит план уроков по неделям.
            </p>

            <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer" onClick={() => !file && fileInputRef.current?.click()}>
              {file ? (
                <div className="flex flex-col items-center gap-3 w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="text-center w-full">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate px-4">{file.name}</p>
                    <p className="text-xs text-slate-500 mb-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button type="button" onClick={() => setFile(null)} className="text-xs text-red-500 font-medium hover:underline">
                      Удалить и выбрать другой
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 shadow-sm rounded-xl flex items-center justify-center mb-3">
                    <UploadCloud className="w-6 h-6 text-indigo-500" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                    Выберите PDF или Изображение
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">Максимальный размер: 10 MB</p>
                  <span className="btn-secondary py-1.5 px-4 text-xs font-semibold">Обзор файлов</span>
                  <input type="file" className="hidden" accept="application/pdf,image/*" ref={fileInputRef} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </>
              )}
            </div>
            
            {loading && loadingState && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium flex gap-2 items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>{loadingState}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={loading}>
                Отмена
              </button>
              <button type="button" onClick={handleGenerate} disabled={loading || !file} className="btn-primary flex-[2] bg-indigo-600 hover:bg-indigo-700">
                {loading ? 'Обработка...' : 'Извлечь Силлабус'}
              </button>
            </div>
          </div>
        )}

        {/* Preview Step Body (Split Screen) */}
        {step === 'preview' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left side: PDF Viewer */}
            <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-4 flex flex-col hidden md:flex">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Оригинал документа</h3>
                <span className="text-xs text-slate-500 px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded-md">Только чтение</span>
              </div>
              <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-inner border border-slate-200 dark:border-slate-700 overflow-hidden">
                <iframe src={`${fileUrl}#view=FitH`} className="w-full h-full border-0" title="PDF Preview" />
              </div>
            </div>

            {/* Right side: Syllabus Builder Editor */}
            <div className="w-full md:w-1/2 flex flex-col bg-white dark:bg-slate-800">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Распознанная структура</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Название курса / силлабуса</label>
                    <input 
                      type="text" 
                      className="input py-1.5 text-sm font-semibold" 
                      value={syllabusTitle} 
                      onChange={e => setSyllabusTitle(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Описание</label>
                    <textarea 
                      className="input py-1.5 text-sm min-h-[60px] resize-none" 
                      value={syllabusDesc} 
                      onChange={e => setSyllabusDesc(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
                {modules.map((mod, mIndex) => (
                  <div key={mod.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <input 
                        type="text" 
                        value={mod.title} 
                        onChange={(e) => updateModuleTitle(mod.id, e.target.value)}
                        className="bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-slate-800 dark:text-slate-200 w-full"
                        title="Нажмите чтобы отредактировать"
                      />
                      <span className="text-xs font-medium text-slate-400 shrink-0 ml-2">Модуль {mIndex + 1}</span>
                    </div>
                    <div className="p-2 space-y-1">
                      {mod.items.map((item) => (
                        <div key={item.id} className="group flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.type === 'exam' ? 'bg-red-500' : 'bg-blue-500'}`} />
                          <input 
                            type="text" 
                            className="bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-700 dark:text-slate-300 w-full truncate"
                            value={item.title}
                            onChange={(e) => updateItemTitle(mod.id, item.id, e.target.value)}
                          />
                          <button onClick={() => deleteItem(mod.id, item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addItem(mod.id)} className="flex items-center gap-1.5 w-full py-1.5 px-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors mt-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Добавить тему</span>
                      </button>
                    </div>
                  </div>
                ))}
                {modules.length === 0 && (
                  <div className="text-center py-10 text-slate-500 text-sm">
                    AI не распознал ни одного модуля. Заполните вручную или попробуйте другой документ.
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex gap-3 shrink-0">
                <button type="button" onClick={() => setStep('upload')} className="btn-secondary">
                  Назад к загрузке
                </button>
                <button type="button" onClick={handleSave} className="btn-primary flex-1 bg-green-600 hover:bg-green-700 border-none shadow-md flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  Подтвердить структуру
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
