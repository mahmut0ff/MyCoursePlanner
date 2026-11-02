import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, FileText, UploadCloud, Loader2, Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiAIGenerateJob } from '../../lib/api';
import { uploadAISource } from '../../services/storage.service';
import { useSpeechToText } from '../../hooks/useSpeechToText';

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

  // Speech-to-text for the prompt textarea
  const onSpeechTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setPrompt(prev => {
        // Add a space separator if there's already text
        const separator = prev.trim() ? ' ' : '';
        return prev.trim() + separator + text;
      });
    }
  }, []);

  const { isListening, isSupported, toggleListening } = useSpeechToText({
    continuous: true,
    onTranscript: onSpeechTranscript,
  });

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() && !file) {
      toast.error(t('ai.providePromptOrFile', 'Пожалуйста, введите промпт или загрузите файл.'));
      return;
    }

    // Stop listening when generating
    if (isListening) toggleListening();

    setLoading(true);
    const toastId = toast.loading(t('ai.generating', 'Генерация с помощью ИИ... Это может занять до минуты.'));

    try {
      let fileUrl = '';
      if (file) {
        fileUrl = await uploadAISource(file);
      }

      const res = await apiAIGenerateJob(
        { prompt, type, fileUrl },
        {
          onWait: (sec) =>
            toast.loading(
              t('ai.generatingElapsed', 'Генерация с помощью ИИ... {{sec}} с', { sec }),
              { id: toastId },
            ),
        },
      );
      
      if (res.data && Array.isArray(res.data)) {
        toast.success(t('ai.generationSuccess', 'Успешно сгенерировано!'), { id: toastId });
        onSuccess(res.data);
        onClose();
        setPrompt('');
        setFile(null);
      } else {
        throw new Error(t('ai.invalidFormat', 'ИИ вернул ответ в неверном формате'));
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-pop w-full max-w-[480px] overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
            <Sparkles className="w-3.5 h-3.5" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{modelName}</h2>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-2 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('ai.description', 'Используйте ИИ (Gemini 1.5 Pro) для создания вопросов. Вы можете загрузить лекцию (PDF/Image) или просто написать, какие вопросы вам нужны.')}
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">
                {t('ai.promptLabel', 'Что нужно сгенерировать? (Промпт)')}
              </label>
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`
                    flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium transition-colors
                    ${isListening
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100'
                    }
                  `}
                  title={isListening ? t('ai.stopListening', 'Остановить запись') : t('ai.startListening', 'Говорить голосом')}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      {t('ai.voice.stop', 'Стоп')}
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      {t('ai.voice.voice', 'Голос')}
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="relative">
              <textarea
                className={`input min-h-[100px] resize-y ${isListening ? 'border-red-400 dark:border-red-700' : ''}`}
                placeholder={isListening
                  ? t('ai.listeningPlaceholder', '🎙️ Говорите... Текст появится здесь автоматически')
                  : t('ai.promptPlaceholder', 'Например: Создай 5 сложных вопросов по истории Древнего Рима для учеников 6 класса.')
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              {isListening && (
                <div className="absolute bottom-2 right-2.5 flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative rounded-full h-1.5 w-1.5 bg-red-500" />
                  </span>
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">{t('ai.voice.rec', 'Запись')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center text-center">
            {file ? (
              <div className="flex items-center gap-3 justify-between w-full">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-md flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center mb-2">
                  <UploadCloud className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
                  {t('ai.uploadMaterial', 'Загрузить материал (PDF/Image)')}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[250px] mb-3">
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
                  className="btn-secondary"
                >
                  {t('common.selectFile')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={loading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || (!prompt.trim() && !file)}
            className="btn-primary relative overflow-hidden"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('common.loading')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {t('ai.generateButton', 'Сгенерировать')}
              </span>
            )}
            
            {/* Shimmer effect */}
            {!loading && (
              <div className="hidden" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
