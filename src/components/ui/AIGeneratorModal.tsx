import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, FileText, UploadCloud, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiAIGenerate } from '../../lib/api';
import { uploadFile } from '../../services/storage.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any[]) => void;
  type: 'quiz' | 'exam';
}

export const AIGeneratorModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, type }) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() && !file) {
      toast.error(t('ai.providePromptOrFile', 'Пожалуйста, введите промпт или загрузите файл.'));
      return;
    }

    setLoading(true);
    const toastId = toast.loading(t('ai.generating', 'Генерация с помощью ИИ... Это может занять несколько секунд.'));

    try {
      let fileUrl = '';
      if (file) {
        // Upload file to standard materials path to get URL
        const ext = file.name.split('.').pop() || 'tmp';
        const path = `ai-uploads/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
        fileUrl = await uploadFile(path, file);
      }

      const res = await apiAIGenerate({ prompt, type, fileUrl });
      
      if (res.data && Array.isArray(res.data)) {
        toast.success(t('ai.generationSuccess', 'Успешно сгенерировано!'), { id: toastId });
        onSuccess(res.data);
        onClose();
        setPrompt('');
        setFile(null);
      } else {
        throw new Error('Invalid format returned');
      }
    } catch (err: any) {
      console.error('AI Generation Error:', err);
      toast.error(err.message || t('ai.generationFailed', 'Ошибка генерации. Попробуйте уточнить промпт.'), { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const modelName = type === 'quiz' ? t('ai.quizTitle', 'Сгенерировать Викторину') : t('ai.examTitle', 'Сгенерировать Экзамен');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-3 text-primary-600 dark:text-primary-400">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{modelName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('ai.description', 'Используйте ИИ (Gemini 1.5 Pro) для создания вопросов. Вы можете загрузить лекцию (PDF/Image) или просто написать, какие вопросы вам нужны.')}
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('ai.promptLabel', 'Что нужно сгенерировать? (Промпт)')}
            </label>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder={t('ai.promptPlaceholder', 'Например: Создай 5 сложных вопросов по истории Древнего Рима для учеников 6 класса.')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            {file ? (
              <div className="flex items-center gap-3 justify-between w-full">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                  <UploadCloud className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                  {t('ai.uploadMaterial', 'Загрузить материал (PDF/Image)')}
                </h4>
                <p className="text-xs text-slate-500 max-w-[250px] mb-4">
                  {t('ai.uploadDesc', 'ИИ прочитает файл и составит вопросы на его основе.')}
                </p>
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary !py-2 !px-4 text-sm"
                >
                  {t('common.selectFile')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700/50 flex gap-3 bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1"
            disabled={loading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || (!prompt.trim() && !file)}
            className="btn-primary flex-1 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 border-none relative overflow-hidden group"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 group-hover:animate-pulse" />
                {t('ai.generateButton', 'Сгенерировать')}
              </span>
            )}
            
            {/* Shimmer effect */}
            {!loading && (
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
