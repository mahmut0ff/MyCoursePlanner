import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, FileText, UploadCloud, Loader2, Mic, MicOff, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiAIGenerate, apiCreateQuiz, apiSaveQuizQuestions, apiCreateLesson } from '../../lib/api';
import { uploadFile } from '../../services/storage.service';
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
    lang: 'ru-RU',
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
    setLoadingState('Вдумчиво пишем текст урока и придумываем вопросы квиза... Это может занять до 15 секунд.');

    try {
      let fileUrl = '';
      if (file) {
        setLoadingState('Загружаем файл для анализа ИИ...');
        const ext = file.name.split('.').pop() || 'tmp';
        const path = `ai-uploads/factory-${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
        fileUrl = await uploadFile(path, file);
      }

      setLoadingState('Генерация урока и 10 вопросов для квиза. Пожалуйста, подождите...');
      const res = await apiAIGenerate({ prompt, type: 'lesson_and_quiz', fileUrl });
      
      if (!res.data || !res.data.lesson || !res.data.quiz) {
        throw new Error('ИИ вернул неполные данные');
      }

      const { lesson, quiz } = res.data;

      // 1. Сборка Квиза
      toast.loading(t('ai.savingQuiz', '2/3 Сохранение интерактивного Квиза...'), { id: toastId });
      setLoadingState('Сохраняем сгенерированный квиз...');
      const quizData = {
        title: `${lesson.title} - Тест`,
        subject: lesson.subject || 'Общее',
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
      setLoadingState('Собираем финальный урок...');
      
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
      htmlContent += `<h2>🧠 Проверьте свои знания</h2>`;
      htmlContent += `<p>После изучения материала мы предлагаем вам пройти интерактивный Квиз (10 вопросов), который был специально составлен ИИ по этому уроку!</p>`;
      htmlContent += `<p><a href="/quiz/${createdQuiz.id}/play">👉 <strong>Начать тест: ${quizData.title}</strong></a></p>`;

      const lessonData = {
        title: lesson.title || 'Новый AI Урок',
        subject: lesson.subject || '',
        duration: lesson.duration || 10,
        description: `Сгенерировано ИИ на тему: ${prompt ? prompt.slice(0, 50) + '...' : 'Материалы файла'}`,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="relative overflow-hidden p-6 border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-violet-600/10 to-primary-600/10 dark:from-violet-500/10 dark:to-primary-500/10">
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary-600 flex items-center justify-center text-white shadow-lg">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">AI Конструктор</h2>
                <p className="text-xs font-medium text-primary-600 dark:text-primary-400">Автоматически создаст Урок + Квиз</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-white/50 dark:hover:bg-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Опишите тему, вставьте ссылку на YouTube или загрузите материал. Gemini 🔥 сгенерирует полноценный урок и тут же добавит к нему интерактивный тест на 10 вопросов.
          </p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                О чем будет урок?
              </label>
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isListening ? 'bg-red-50 text-red-600 ring-2 ring-red-200 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600'}`}
                  title={isListening ? 'Остановить запись' : 'Говорить голосом'}
                >
                  {isListening ? <><MicOff className="w-3.5 h-3.5" /> Стоп</> : <><Mic className="w-3.5 h-3.5" /> Голос</>}
                </button>
              )}
            </div>
            <div className="relative">
              <textarea
                className={`input min-h-[100px] resize-y transition-all text-sm ${isListening ? 'ring-2 ring-red-300 border-red-300' : ''}`}
                placeholder={isListening ? '🎙️ Слушаю...' : 'Например: Подробный урок про Французскую революцию, разбей на причины, ход событий и итоги.'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            {file ? (
              <div className="flex items-center gap-3 justify-between w-full">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button type="button" onClick={() => setFile(null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2">
                  <UploadCloud className="w-5 h-5 text-slate-400 text-primary-500" />
                </div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                  Материалы для ИИ (PDF, Изображение)
                </h4>
                <input type="file" className="hidden" accept="application/pdf,image/*" ref={fileInputRef} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline">
                  Загрузить файл
                </button>
              </>
            )}
          </div>
          
          {loading && loadingState && (
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-medium border border-violet-100 dark:border-violet-800/50 flex gap-2 items-center">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{loadingState}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-700/50 flex gap-3 bg-slate-50 dark:bg-slate-800/50">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || (!prompt.trim() && !file)}
            className="btn-primary flex-[2] bg-gradient-to-r from-violet-600 to-primary-600 hover:from-violet-700 hover:to-primary-700 border-none relative overflow-hidden group shadow-md"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Создать Урок + Квиз
              </span>
            )}
            {!loading && <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />}
          </button>
        </div>
      </div>
    </div>
  );
};
