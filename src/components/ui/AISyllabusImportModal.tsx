import React, { useState, useRef } from 'react';
import { Sparkles, X, FileText, UploadCloud, Loader2, Save, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { apiAIGenerateJob } from '../../lib/api';
import { uploadAISource } from '../../services/storage.service';
import type { SyllabusModule } from '../../types';
import { generateId } from '../../utils/grading';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (extractedSyllabus: any) => void;
}

export const AISyllabusImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
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
      toast.error(t('ai.syllabus.pdfOrImage', 'Пожалуйста, загрузите PDF или изображение.'));
      return;
    }

    setLoading(true);
    const toastId = toast.loading(t('ai.syllabus.uploadingToast', 'Загрузка файла...'));
    setLoadingState(t('ai.syllabus.stateUploading', 'Загружаем файл в облако...'));

    try {
      const uploadedUrl = await uploadAISource(file, 'syllabus-');
      setFileUrl(uploadedUrl);

      setLoadingState(t('ai.syllabus.stateReading', 'ИИ читает документ и извлекает структуру...'));
      toast.loading(t('ai.syllabus.analyzing', 'ИИ анализирует силлабус...'), { id: toastId });
      
      const res = await apiAIGenerateJob(
        { type: 'syllabus_extraction', fileUrl: uploadedUrl },
        { onWait: (sec) => setLoadingState(t('ai.syllabus.stateReadingSec', 'ИИ читает документ и извлекает структуру... {{sec}} с', { sec })) },
      );
      
      if (!res.data || !res.data.modules) {
        throw new Error(t('ai.incompleteData', 'ИИ вернул неполные данные'));
      }

      setSyllabusTitle(res.data.title || t('ai.syllabus.newSyllabus', 'Новый силлабус'));
      setSyllabusDesc(res.data.description || '');
      
      // Map AI data to internal format with fresh IDs
      const mappedModules = (res.data.modules || []).map((mod: any, mIdx: number) => ({
        id: generateId(),
        title: mod.title || t('ai.syllabus.moduleN', 'Модуль {{n}}', { n: mIdx + 1 }),
        order: mod.order || mIdx,
        items: (mod.items || []).map((item: any, iIdx: number) => ({
          id: generateId(),
          title: item.title || t('ai.syllabus.lessonN', 'Урок {{n}}', { n: iIdx + 1 }),
          type: item.type === 'exam' || item.type === 'topic' ? item.type : 'lesson',
          order: item.order || iIdx
        }))
      }));

      setModules(mappedModules);
      setStep('preview');
      toast.success(t('ai.syllabus.extracted', 'Структура успешно извлечена!'), { id: toastId });

    } catch (err: any) {
      console.error('Syllabus AI Error:', err);
      toast.error(err.message || t('ai.syllabus.recognizeFailed', 'Ошибка распознавания силлабуса.'), { id: toastId });
    } finally {
      setLoading(false);
      setLoadingState('');
    }
  };

  const handleSave = () => {
    if (!syllabusTitle.trim()) {
      toast.error(t('ai.syllabus.enterTitle', 'Введите название силлабуса'));
      return;
    }
    if (modules.length === 0) {
      toast.error(t('ai.syllabus.needModule', 'Силлабус должен содержать хотя бы один модуль'));
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
        items: [...m.items, { id: generateId(), title: t('ai.syllabus.newTopic', 'Новая тема'), type: 'lesson', order: m.items.length }]
      };
    }));
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 animate-in fade-in duration-200`}>
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-pop overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 ${step === 'preview' ? 'w-full max-w-6xl h-[90vh]' : 'w-full max-w-[480px]'}`}>
        
        {/* Header */}
        <div className="relative overflow-hidden px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.syllabus.title', 'AI Импорт Силлабуса')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {step === 'upload' ? t('ai.syllabus.subtitleUpload', 'Извлечение структуры из PDF файлов') : t('ai.syllabus.subtitlePreview', 'Сверка распознанных данных')}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="-mr-1 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Upload Step Body */}
        {step === 'upload' && (
          <div className="px-4 pt-3 pb-4 space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('ai.syllabus.intro', 'Загрузите PDF файл с утвержденной учебной программой (силлабусом). Gemini проанализирует документ и автоматически составит план уроков по неделям.')}
            </p>

            <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center text-center transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => !file && fileInputRef.current?.click()}>
              {file ? (
                <div className="flex flex-col items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-md flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-center w-full">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate px-4">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mb-2">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button type="button" onClick={() => setFile(null)} className="text-xs text-red-600 dark:text-red-400 font-medium hover:underline">
                      {t('ai.syllabus.removeAndPick', 'Удалить и выбрать другой')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center mb-2">
                    <UploadCloud className="w-6 h-6 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
                    {t('ai.syllabus.pickFile', 'Выберите PDF или Изображение')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('ai.syllabus.maxSize', 'Максимальный размер: 10 MB')}</p>
                  <span className="btn-secondary">{t('ai.syllabus.browse', 'Обзор файлов')}</span>
                  <input type="file" className="hidden" accept="application/pdf,image/*" ref={fileInputRef} onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > 10 * 1024 * 1024) { toast.error(t('ai.syllabus.tooLarge', 'Файл превышает 10 МБ. Выберите файл поменьше.')); return; }
                    setFile(f);
                  }} />
                </>
              )}
            </div>
            
            {loading && loadingState && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs flex gap-2 items-center justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary-600 dark:text-primary-400" />
                <span>{loadingState}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-ghost" disabled={loading}>
                {t('common.cancel', 'Отмена')}
              </button>
              <button type="button" onClick={handleGenerate} disabled={loading || !file} className="btn-primary">
                {loading ? t('ai.syllabus.processing', 'Обработка...') : t('ai.syllabus.extract', 'Извлечь Силлабус')}
              </button>
            </div>
          </div>
        )}

        {/* Preview Step Body (Split Screen) */}
        {step === 'preview' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left side: PDF Viewer */}
            <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 flex flex-col hidden md:flex">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.syllabus.original', 'Оригинал документа')}</h3>
                <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{t('ai.syllabus.readOnly', 'Только чтение')}</span>
              </div>
              <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <iframe src={`${fileUrl}#view=FitH`} className="w-full h-full border-0" title={t('ai.syllabus.pdfPreview', 'Предпросмотр PDF')} />
              </div>
            </div>

            {/* Right side: Syllabus Builder Editor */}
            <div className="w-full md:w-1/2 flex flex-col bg-white dark:bg-slate-800">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('ai.syllabus.recognized', 'Распознанная структура')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="label">{t('ai.syllabus.nameLabel', 'Название курса / силлабуса')}</label>
                    <input 
                      type="text" 
                      className="input font-medium" 
                      value={syllabusTitle} 
                      onChange={e => setSyllabusTitle(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="label">{t('ai.syllabus.descLabel', 'Описание')}</label>
                    <textarea 
                      className="input min-h-[60px] resize-none" 
                      value={syllabusDesc} 
                      onChange={e => setSyllabusDesc(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-900/50">
                {modules.map((mod, mIndex) => (
                  <div key={mod.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="h-9 px-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <input 
                        type="text" 
                        value={mod.title} 
                        onChange={(e) => updateModuleTitle(mod.id, e.target.value)}
                        className="bg-transparent border-none p-0 focus:ring-0 text-sm font-semibold text-slate-900 dark:text-slate-100 w-full"
                        title={t('ai.syllabus.clickToEdit', 'Нажмите чтобы отредактировать')}
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 ml-2">{t('ai.syllabus.moduleN', 'Модуль {{n}}', { n: mIndex + 1 })}</span>
                    </div>
                    <div className="p-2 space-y-1">
                      {mod.items.map((item) => (
                        <div key={item.id} className="group flex items-center gap-2 min-h-[32px] py-1 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.type === 'exam' ? 'bg-red-500' : 'bg-blue-500'}`} />
                          <input 
                            type="text" 
                            className="bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-700 dark:text-slate-300 w-full truncate"
                            value={item.title}
                            onChange={(e) => updateItemTitle(mod.id, item.id, e.target.value)}
                          />
                          <button onClick={() => deleteItem(mod.id, item.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-md transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addItem(mod.id)} className="flex items-center gap-1.5 w-full h-7 px-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-md transition-colors mt-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('ai.syllabus.addTopic', 'Добавить тему')}</span>
                      </button>
                    </div>
                  </div>
                ))}
                {modules.length === 0 && (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-xs">
                    {t('ai.syllabus.noModules', 'AI не распознал ни одного модуля. Заполните вручную или попробуйте другой документ.')}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setStep('upload')} className="btn-ghost">
                  {t('ai.syllabus.backToUpload', 'Назад к загрузке')}
                </button>
                <button type="button" onClick={handleSave} className="btn-primary inline-flex items-center justify-center gap-1.5">
                  <Save className="w-3.5 h-3.5" />
                  {t('ai.syllabus.confirm', 'Подтвердить структуру')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
