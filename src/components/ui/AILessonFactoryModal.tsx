import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, FileText, UploadCloud, Loader2, Mic, MicOff, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiAIGenerateJob, apiCreateQuiz, apiSaveQuizQuestions, apiCreateLesson } from '../../lib/api';
import { uploadAISource } from '../../services/storage.service';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { generateId } from '../../utils/grading';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const escapeHtml = (text: string) => {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const AILessonFactoryModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Speech-to-text
  const onSpeechTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setPrompt(prev => prev.trim() ? prev.trim() + ' ' + text : text);
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

    if (isListening) toggleListening();

    setLoading(true);
    const toastId = toast.loading(t('ai.generatingFactory', '1/3 Изучаем материалы и генерируем структуру...'));
    setLoadingState(t('ai.factory.stateWriting', 'Вдумчиво пишем текст урока и придумываем вопросы квиза... Это может занять до 15 секунд.'));

    try {
      let fileUrl = '';
      if (file) {
        setLoadingState(t('ai.factory.stateUploading', 'Загружаем файл для анализа ИИ...'));
        fileUrl = await uploadAISource(file, 'factory-');
      }

      setLoadingState(t('ai.factory.stateGenerating', 'Генерация урока и 10 вопросов для квиза. Пожалуйста, подождите...'));
      const res = await apiAIGenerateJob(
        { prompt, type: 'lesson_and_quiz', fileUrl },
        { onWait: (sec) => setLoadingState(t('ai.factory.stateGeneratingSec', 'Генерация урока и 10 вопросов для квиза... {{sec}} с', { sec })) },
      );
      
      if (!res.data || !res.data.lesson || !res.data.quiz) {
        throw new Error(t('ai.incompleteData', 'ИИ вернул неполные данные'));
      }

      const { lesson, quiz } = res.data;

      // 1. Сборка Квиза
      toast.loading(t('ai.savingQuiz', '2/3 Сохранение интерактивного Квиза...'), { id: toastId });
      setLoadingState(t('ai.factory.stateSavingQuiz', 'Сохраняем сгенерированный квиз...'));
      const quizData = {
        title: t('ai.factory.quizTitle', '{{title}} - Тест', { title: lesson.title }),
        subject: lesson.subject || t('ai.factory.generalSubject', 'Общее'),
        status: 'draft',
        visibility: 'private'
      };
      const createdQuiz: any = await apiCreateQuiz(quizData);
      
      // 2. Сохранение вопросов Квиза
      const formattedQuestions = (quiz || []).map((q: any, index: number) => {
        const isTF = q.type === 'true_false';
        const defaultTexts = isTF ? ['True', 'False'] : [];
        const givenOptions = q.options && q.options.length > 0 ? q.options : defaultTexts;
        
        const _options = givenOptions.map((t: string) => ({ id: generateId(), text: t }));
        
        let correctAnswers: string[] = [];
        if (q.correctOptionIndices && Array.isArray(q.correctOptionIndices)) {
          correctAnswers = q.correctOptionIndices.map((idx: number) => _options[idx]?.id).filter(Boolean);
        } else if (q.correctOptionIndex !== undefined) {
          correctAnswers = [_options[q.correctOptionIndex]?.id].filter(Boolean);
        }

        let generatedMediaUrl = q.mediaUrl || '';
        let generatedMediaType = q.mediaType || 'image';
        
        if (q.searchQuery) {
          generatedMediaUrl = `https://loremflickr.com/800/600/${encodeURIComponent(q.searchQuery)}?lock=${Math.floor(Math.random() * 100)}`;
          generatedMediaType = 'image';
        }

        return {
          id: generateId(),
          type: q.type || (isTF ? 'true_false' : 'single_choice'),
          text: q.question || '',
          options: _options,
          correctAnswers,
          answerExplanation: q.explanation || '',
          mediaUrl: generatedMediaUrl,
          mediaType: generatedMediaType,
          ttsText: q.ttsText || '',
          timerSeconds: 30,
          points: 1000,
          difficulty: 'medium',
          order: index
        };
      });
      await apiSaveQuizQuestions(createdQuiz.id, formattedQuestions);

      // 3. Формирование Урока и Инъекция Квиза
      toast.loading(t('ai.savingLesson', '3/3 Верстка Урока и привязка...'), { id: toastId });
      setLoadingState(t('ai.factory.stateAssembling', 'Собираем финальный урок...'));
      
      // Convert AI blocks into valid HTML string for Tiptap
      let htmlContent = '';
      (lesson.blocks || []).forEach((b: any) => {
        if (b.type === 'heading') {
          const lv = b.level === 1 ? '1' : '2';
          htmlContent += `<h${lv}>${escapeHtml(b.content || '')}</h${lv}>`;
        } else if (b.type === 'bulletList' && Array.isArray(b.items)) {
          htmlContent += `<ul>${b.items.map((i: string) => `<li><p>${escapeHtml(i)}</p></li>`).join('')}</ul>`;
        } else {
          htmlContent += `<p>${escapeHtml(b.content || '')}</p>`;
        }
      });

      // Inject the generated Quiz at the end of the HTML document
      htmlContent += `<hr>`;
      htmlContent += `<h2>${escapeHtml(t('ai.factory.checkKnowledge', '🧠 Проверьте свои знания'))}</h2>`;
      htmlContent += `<p>${escapeHtml(t('ai.factory.quizInvite', 'После изучения материала мы предлагаем вам пройти интерактивный Квиз (10 вопросов), который был специально составлен ИИ по этому уроку!'))}</p>`;
      htmlContent += `<p><a href="/quiz/${createdQuiz.id}/play">👉 <strong>${t('ai.factory.startQuiz', 'Начать тест: {{title}}', { title: quizData.title })}</strong></a></p>`;

      const lessonData = {
        title: lesson.title || t('ai.factory.newLesson', 'Новый AI Урок'),
        subject: lesson.subject || '',
        duration: lesson.duration || 10,
        description: t('ai.factory.generatedOn', 'Сгенерировано ИИ на тему: {{topic}}', { topic: prompt ? prompt.slice(0, 50) + '...' : t('ai.factory.fileMaterials', 'Материалы файла') }),
        level: 'B1',
        coverImageUrl: '',
        videoUrl: '',
        status: 'draft',
        content: htmlContent,
      };

      const createdLesson: any = await apiCreateLesson(lessonData);

      toast.success(t('ai.factorySuccess', 'Урок и Квиз успешно созданы!'), { id: toastId });
      if (onSuccess) onSuccess();
      onClose();
      
      // Redirect to edit the newly generated lesson
      navigate(`/lessons/${createdLesson.id}/edit`);

    } catch (err: any) {
      console.error('AI Factory Error:', err);
      toast.error(err.message || t('ai.generationFailed', 'Ошибка генерации. Попробуйте уточнить промпт.'), { id: toastId });
    } finally {
      setLoading(false);
      setLoadingState('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-pop w-full max-w-[480px] overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="relative overflow-hidden px-4 pt-4 pb-2">
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai.factory.title', 'AI Конструктор')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('ai.factory.subtitle', 'Автоматически создаст Урок + Квиз')}</p>
              </div>
            </div>
            <button onClick={onClose} className="-mr-1 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-4 py-2 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('ai.factory.intro', 'Опишите тему, вставьте ссылку на YouTube или загрузите материал. Gemini 🔥 сгенерирует полноценный урок и тут же добавит к нему интерактивный тест на 10 вопросов.')}
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">
                {t('ai.factory.topicLabel', 'О чем будет урок?')}
              </label>
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium transition-colors ${isListening ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-100'}`}
                  title={isListening ? t('ai.voice.stopRecording', 'Остановить запись') : t('ai.voice.speak', 'Говорить голосом')}
                >
                  {isListening ? <><MicOff className="w-3.5 h-3.5" /> {t('ai.voice.stop', 'Стоп')}</> : <><Mic className="w-3.5 h-3.5" /> {t('ai.voice.voice', 'Голос')}</>}
                </button>
              )}
            </div>
            <div className="relative">
              <textarea
                className={`input min-h-[100px] resize-y ${isListening ? 'border-red-400 dark:border-red-700' : ''}`}
                placeholder={isListening ? t('ai.voice.listening', '🎙️ Слушаю...') : t('ai.factory.placeholder', 'Например: Подробный урок про Французскую революцию, разбей на причины, ход событий и итоги.')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
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
                <button type="button" onClick={() => setFile(null)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-md transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center mb-2">
                  <UploadCloud className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
                  {t('ai.factory.materials', 'Материалы для ИИ (PDF, Изображение)')}
                </h4>
                <input type="file" className="hidden" accept="application/pdf,image/*" ref={fileInputRef} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 hover:underline">
                  {t('ai.factory.uploadFile', 'Загрузить файл')}
                </button>
              </>
            )}
          </div>
          
          {loading && loadingState && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 rounded-lg text-xs border border-slate-200 dark:border-slate-700 flex gap-2 items-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary-600 dark:text-primary-400" />
              <span>{loadingState}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={loading}>
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
                <BookOpen className="w-3.5 h-3.5" />
                <Sparkles className="w-3.5 h-3.5" />
                {t('ai.factory.create', 'Создать Урок + Квиз')}
              </span>
            )}
            {!loading && <div className="hidden" />}
          </button>
        </div>
      </div>
    </div>
  );
};
