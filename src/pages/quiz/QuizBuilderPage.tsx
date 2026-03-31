import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiGetQuiz, apiCreateQuiz, apiUpdateQuiz, apiSaveQuizQuestions } from '../../lib/api';
import type { Quiz, QuizQuestion, QuizQuestionType, QuizDifficulty } from '../../types';
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical,
  CheckCircle, Circle, Sparkles,
  ChevronDown, ChevronUp, Copy, Settings, Clock,
  Upload, Maximize2, Volume2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AIGeneratorModal } from '../../components/ui/AIGeneratorModal';
import FileViewerModal from '../../components/ui/FileViewerModal';
import { uploadFile } from '../../services/storage.service';

const QUESTION_TYPES: { type: QuizQuestionType; label: string; icon: string }[] = [
  { type: 'single_choice', label: 'Single Choice', icon: '🔘' },
  { type: 'multiple_choice', label: 'Multiple Choice', icon: '☑️' },
  { type: 'true_false', label: 'True / False', icon: '✅' },
  { type: 'matching', label: 'Matching', icon: '🔗' },
  { type: 'media_question', label: 'Media', icon: '🖼️' },
  { type: 'speaking', label: 'Speaking', icon: '🎤' },
];

const OPTION_COLORS_BG = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#c4162f', '#1057ad', '#b88600'];
const OPTION_SHAPES = ['▲', '◆', '●', '■', '★', '▲', '◆', '●'];

function generateId(): string {
  return Math.random().toString(36).substring(2, 22);
}

function createEmptyQuestion(order: number, type: QuizQuestionType = 'single_choice'): QuizQuestion {
  const isTF = type === 'true_false';
  return {
    id: generateId(),
    quizId: '',
    type,
    order,
    text: '',
    options: isTF
      ? [{ id: generateId(), text: 'True' }, { id: generateId(), text: 'False' }]
      : [{ id: generateId(), text: '' }, { id: generateId(), text: '' }, { id: generateId(), text: '' }, { id: generateId(), text: '' }],
    correctAnswers: [],
    timerSeconds: 30,
    points: 1000,
    difficulty: 'medium',
  };
}

const QuizBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useAuth();
  const { canAccess } = usePlanGate();
  const isEdit = Boolean(id);

  const [quiz, setQuiz] = useState<Partial<Quiz>>({
    title: '', subtitle: '', description: '', subject: '', category: '',
    difficulty: 'medium', estimatedMinutes: 10, language: 'ru',
    visibility: 'private', status: 'draft', tags: [],
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([createEmptyQuestion(0)]);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [showSettings, setShowSettings] = useState(false);
  const [showAIGen, setShowAIGen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [previewFile, setPreviewFile] = useState<{name: string, url: string, type: string} | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!id) {
      toast.error(t('quiz.saveFirstToUpload', 'Please save the quiz first to enable file uploads'));
      return;
    }
    setUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop() || 'tmp';
      const path = `quizzes/${id}/media/${Date.now()}-${generateId()}.${ext}`;
      const url = await uploadFile(path, file);
      
      const mediaType = 
        file.type.startsWith('image/') ? 'image' : 
        file.type.startsWith('audio/') ? 'audio' : 
        file.type.startsWith('video/') ? 'video' : 'pdf';
      updateQuestion(activeQuestion, { mediaUrl: url, mediaType: mediaType as any });
      toast.success(t('common.uploadSuccess', 'File uploaded successfully'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleAIGenerateSuccess = (data: any[]) => {
    const startOrder = questions.length;
    const newQuestions = data.map((q, i) => {
      const opts = (q.options || []).map((text: string) => ({ id: generateId(), text }));
      
      let correctAnswers: string[] = [];
      if (q.correctOptionIndices && Array.isArray(q.correctOptionIndices)) {
        correctAnswers = q.correctOptionIndices.map((idx: number) => opts[idx]?.id).filter(Boolean);
      } else if (q.correctOptionIndex !== undefined) {
        correctAnswers = [opts[q.correctOptionIndex]?.id].filter(Boolean);
      }

      let generatedMediaUrl = q.mediaUrl || '';
      let generatedMediaType = (q.mediaType as any) || 'image';
      
      if (q.searchQuery) {
        generatedMediaUrl = `https://loremflickr.com/800/600/${encodeURIComponent(q.searchQuery)}?lock=${Math.floor(Math.random() * 100)}`;
        generatedMediaType = 'image';
      }

      return {
        id: generateId(),
        quizId: id || '',
        type: (q.type as QuizQuestionType) || 'single_choice',
        order: startOrder + i,
        text: q.question || '',
        options: opts,
        correctAnswers,
        timerSeconds: 30,
        points: 1000,
        difficulty: 'medium' as QuizDifficulty,
        answerExplanation: q.explanation || '',
        mediaUrl: generatedMediaUrl,
        mediaType: generatedMediaType,
        ttsText: q.ttsText || '',
      };
    });
    if (questions.length === 1 && questions[0].text === '') {
      setQuestions(newQuestions);
      setActiveQuestion(0);
    } else {
      setQuestions([...questions, ...newQuestions]);
      setActiveQuestion(questions.length);
    }
  };

  useEffect(() => {
    if (id) {
      apiGetQuiz(id).then((data: any) => {
        setQuiz(data.quiz);
        if (data.questions?.length > 0) setQuestions(data.questions);
      }).finally(() => setLoading(false));
    }
  }, [id]);

  const handleSave = async () => {
    if (!quiz.title?.trim()) { toast.error(t('quiz.titleRequired')); return; }
    setSaving(true);
    try {
      let quizId = id;
      if (isEdit) {
        await apiUpdateQuiz({ id, ...quiz });
      } else {
        const result = await apiCreateQuiz(quiz);
        quizId = result.id;
      }
      const orderedQuestions = questions.map((q, i) => ({ ...q, quizId, order: i }));
      await apiSaveQuizQuestions(quizId!, orderedQuestions);
      toast.success(t('quiz.saved'));
      if (!isEdit) navigate(`/quiz/${quizId}/edit`, { replace: true });
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = (type: QuizQuestionType = 'single_choice') => {
    const newQ = createEmptyQuestion(questions.length, type);
    setQuestions([...questions, newQ]);
    setActiveQuestion(questions.length);
  };

  const deleteQuestion = (index: number) => {
    if (questions.length <= 1) { toast.error(t('quiz.minOneQuestion')); return; }
    setQuestions(questions.filter((_, i) => i !== index));
    if (activeQuestion >= questions.length - 1) setActiveQuestion(Math.max(0, questions.length - 2));
  };

  const duplicateQuestion = (index: number) => {
    const copy = { ...questions[index], id: generateId(), order: questions.length };
    setQuestions([...questions, copy]);
    setActiveQuestion(questions.length);
  };

  const updateQuestion = (index: number, updates: Partial<QuizQuestion>) => {
    setQuestions(questions.map((q, i) => i === index ? { ...q, ...updates } : q));
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    const newQ = [...questions];
    const [moved] = newQ.splice(from, 1);
    newQ.splice(to, 0, moved);
    setQuestions(newQ);
    setActiveQuestion(to);
  };

  const addOption = (qi: number) => {
    const q = questions[qi];
    updateQuestion(qi, { options: [...q.options, { id: generateId(), text: '' }] });
  };

  const removeOption = (qi: number, optId: string) => {
    const q = questions[qi];
    updateQuestion(qi, {
      options: q.options.filter(o => o.id !== optId),
      correctAnswers: q.correctAnswers.filter(a => a !== optId),
    });
  };

  const updateOption = (qi: number, optId: string, text: string) => {
    const q = questions[qi];
    updateQuestion(qi, { options: q.options.map(o => o.id === optId ? { ...o, text } : o) });
  };

  const toggleCorrectAnswer = (qi: number, optId: string) => {
    const q = questions[qi];
    const isMulti = ['multiple_choice', 'multi_select'].includes(q.type);
    if (isMulti) {
      const next = q.correctAnswers.includes(optId) ? q.correctAnswers.filter(a => a !== optId) : [...q.correctAnswers, optId];
      updateQuestion(qi, { correctAnswers: next });
    } else {
      updateQuestion(qi, { correctAnswers: [optId] });
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !quiz.tags?.includes(tagInput.trim())) {
      setQuiz({ ...quiz, tags: [...(quiz.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) { moveQuestion(dragIndex, index); setDragIndex(index); }
  };
  const handleDragEnd = () => setDragIndex(null);

  const currentQ = questions[activeQuestion];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin dark:border-purple-800 dark:border-t-purple-400" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto kahoot-font">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/library')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <input
              value={quiz.title || ''}
              onChange={e => setQuiz({ ...quiz, title: e.target.value })}
              placeholder={t('quiz.quizTitle')}
              className="text-lg font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none placeholder-slate-300 dark:placeholder-slate-600 w-full"
            />
            <input
              value={quiz.subtitle || ''}
              onChange={e => setQuiz({ ...quiz, subtitle: e.target.value })}
              placeholder={t('quiz.subtitle')}
              className="text-xs text-slate-500 bg-transparent border-none outline-none placeholder-slate-300 dark:placeholder-slate-600 w-full mt-0.5"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-lg transition-colors ${showSettings ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500'}`}>
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-white text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 3px 10px rgba(38,137,12,0.25)' }}
          >
            <Save className="w-4 h-4" />{saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Quiz Settings */}
      {showSettings && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 shadow-sm">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.subject')}</label>
            <input value={quiz.subject || ''} onChange={e => setQuiz({ ...quiz, subject: e.target.value })} className="input text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.difficulty')}</label>
            <select value={quiz.difficulty || 'medium'} onChange={e => setQuiz({ ...quiz, difficulty: e.target.value as QuizDifficulty })} className="input text-sm mt-1">
              <option value="easy">{t('quiz.easy')}</option>
              <option value="medium">{t('quiz.medium')}</option>
              <option value="hard">{t('quiz.hard')}</option>
              <option value="expert">{t('quiz.expert')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.visibility')}</label>
            <select value={quiz.visibility || 'private'} onChange={e => setQuiz({ ...quiz, visibility: e.target.value as any })} className="input text-sm mt-1">
              <option value="private">{t('quiz.private')}</option>
              <option value="organization">{t('quiz.orgShared')}</option>
              <option value="platform">{t('quiz.platformShared')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.duration')}</label>
            <input type="number" value={quiz.estimatedMinutes || 10} onChange={e => setQuiz({ ...quiz, estimatedMinutes: parseInt(e.target.value) || 10 })} className="input text-sm mt-1" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.description')}</label>
            <textarea value={quiz.description || ''} onChange={e => setQuiz({ ...quiz, description: e.target.value })} className="input text-sm mt-1 h-16" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.tags')}</label>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {quiz.tags?.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 text-white font-semibold" style={{ backgroundColor: 'var(--kahoot-purple)' }}>
                  {tag}
                  <button onClick={() => setQuiz({ ...quiz, tags: quiz.tags?.filter(t => t !== tag) })} className="hover:text-red-200 ml-0.5">×</button>
                </span>
              ))}
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag..." className="text-xs py-0.5 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-transparent dark:text-white w-24 outline-none" />
            </div>
          </div>
        </div>
      )}

      {/* Main Builder Layout */}
      <div className="flex gap-4" style={{ minHeight: '65vh' }}>
        {/* Left: Slide Navigator */}
        <div className="kahoot-slide-nav rounded-xl overflow-hidden">
          <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-700">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('quiz.questions')} ({questions.length})</p>
          </div>
          <div className="max-h-[55vh] overflow-y-auto py-2">
            {questions.map((q, i) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveQuestion(i)}
                className={`kahoot-slide-item ${activeQuestion === i ? 'active' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3 h-3 text-slate-300 cursor-grab shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold" style={{ color: 'var(--kahoot-purple)' }}>{i + 1}</span>
                      <span className="text-[10px] text-slate-400">{QUESTION_TYPES.find(t => t.type === q.type)?.icon}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate mt-0.5">{q.text || t('quiz.untitled')}</p>
                  </div>
                  {q.correctAnswers.length > 0 && <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />}
                </div>
              </div>
            ))}
          </div>

          {/* Add question buttons */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-700">
            {canAccess('ai') && (
              <button
                onClick={() => setShowAIGen(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white py-2.5 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-[0.98] mb-2"
                style={{ background: 'linear-gradient(135deg, var(--kahoot-purple) 0%, #864cbf 100%)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />{t('ai.generateButton', 'Сгенерировать ИИ')}
              </button>
            )}
            <button onClick={() => addQuestion()} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-400">
              <Plus className="w-3 h-3" />{t('quiz.addQuestion')}
            </button>
          </div>
        </div>

        {/* Center: Question Editor */}
        {currentQ && (
          <div className="flex-1 flex flex-col gap-4">
            {/* Question type + actions bar */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 shadow-sm">
              <select
                value={currentQ.type}
                onChange={e => updateQuestion(activeQuestion, { type: e.target.value as QuizQuestionType })}
                className="text-sm font-semibold border-none bg-transparent outline-none dark:text-white cursor-pointer"
                style={{ color: 'var(--kahoot-purple)' }}
              >
                {QUESTION_TYPES.map(qt => (
                  <option key={qt.type} value={qt.type}>{qt.icon} {qt.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button onClick={() => moveQuestion(activeQuestion, activeQuestion - 1)} disabled={activeQuestion === 0} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors"><ChevronUp className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => moveQuestion(activeQuestion, activeQuestion + 1)} disabled={activeQuestion === questions.length - 1} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors"><ChevronDown className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => duplicateQuestion(activeQuestion)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><Copy className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => deleteQuestion(activeQuestion)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>

            {/* Question text card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <textarea
                value={currentQ.text}
                onChange={e => updateQuestion(activeQuestion, { text: e.target.value })}
                placeholder={t('quiz.questionText')}
                className="w-full text-lg font-bold text-center text-slate-900 dark:text-white bg-transparent border-none outline-none placeholder-slate-300 dark:placeholder-slate-600 resize-none h-20"
              />

              {/* Media */}
              {['media_question', 'speaking'].includes(currentQ.type) && (
                <div className="mt-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">{t('quiz.mediaContent', 'Media Content')}</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                    <input 
                      value={currentQ.mediaUrl || ''} 
                      onChange={e => updateQuestion(activeQuestion, { mediaUrl: e.target.value, mediaType: 'image' })} 
                      placeholder="URL (https://...)" 
                      className="input text-xs flex-1" 
                    />
                    <div className="relative shrink-0 w-full sm:w-auto">
                      <input
                        type="file"
                        accept="image/*, audio/*, video/*"
                        onChange={handleFileUpload}
                        disabled={uploadingMedia || !id}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        title={!id ? t('quiz.saveFirstToUpload', 'Please save the quiz first to enable file uploads') : ''}
                      />
                      <button 
                        disabled={uploadingMedia || !id}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/60 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {uploadingMedia ? <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-purple-700 rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {uploadingMedia ? t('common.uploading', 'Uploading...') : t('quiz.uploadFile', 'Upload File')}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                    <input 
                      value={currentQ.ttsText || ''} 
                      onChange={e => updateQuestion(activeQuestion, { ttsText: e.target.value })} 
                      placeholder={t('quiz.ttsPlaceholder', 'Text to synthesize (Audio question)')} 
                      className="input text-xs flex-1" 
                    />
                    {currentQ.ttsText && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          const u = new SpeechSynthesisUtterance(currentQ.ttsText);
                          u.lang = quiz.language || 'en-US';
                          window.speechSynthesis.speak(u);
                        }}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> {t('quiz.listen', 'Listen')}
                      </button>
                    )}
                  </div>

                  {/* PREVIEW */}
                  {currentQ.mediaUrl && (
                    <div className="mt-2 relative group inline-flex flex-col items-center max-w-full justify-center w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2 overflow-hidden">
                      {(!currentQ.mediaType || currentQ.mediaType === 'image') && <img src={currentQ.mediaUrl} alt="Preview" className="max-h-56 rounded object-contain w-full" />}
                      {currentQ.mediaType === 'audio' && <audio src={currentQ.mediaUrl} controls className="w-full mt-2" />}
                      {currentQ.mediaType === 'video' && <video src={currentQ.mediaUrl} controls className="max-h-56 w-full rounded mt-2" />}
                      
                      {(!currentQ.mediaType || currentQ.mediaType === 'image') && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none rounded">
                          <button 
                            onClick={(e) => { e.preventDefault(); setPreviewFile({ 
                              name: currentQ.mediaUrl?.split('/').pop()?.split('?')[0] || 'Media Preview', 
                              url: currentQ.mediaUrl!, 
                              type: 'image/jpeg' 
                            }); }}
                            className="pointer-events-auto p-3 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white rounded-xl flex items-center gap-2 text-sm font-bold shadow-2xl transform scale-95 group-hover:scale-100 transition-all border border-white/20"
                            title="View Fullscreen"
                          >
                            <Maximize2 className="w-5 h-5" /> Fullscreen Preview
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Answer Options — Kahoot 2x2 colored grid */}
            {['single_choice', 'multiple_choice', 'true_false', 'matching', 'media_question'].includes(currentQ.type) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQ.options.map((opt, oi) => {
                  const isCorrect = currentQ.correctAnswers.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className="kahoot-builder-option relative"
                      style={{ backgroundColor: OPTION_COLORS_BG[oi % OPTION_COLORS_BG.length] }}
                    >
                      {/* Correct answer toggle */}
                      <button
                        onClick={() => toggleCorrectAnswer(activeQuestion, opt.id)}
                        className="shrink-0 transition-all"
                      >
                        {isCorrect ? (
                          <CheckCircle className="w-6 h-6 text-white drop-shadow-md" />
                        ) : (
                          <Circle className="w-6 h-6 text-white/40 hover:text-white/70" />
                        )}
                      </button>

                      <span className="text-xl opacity-70 shrink-0">{OPTION_SHAPES[oi % OPTION_SHAPES.length]}</span>

                      <input
                        value={opt.text}
                        onChange={e => updateOption(activeQuestion, opt.id, e.target.value)}
                        placeholder={`${t('quiz.option')} ${oi + 1}`}
                      />

                      {currentQ.type !== 'true_false' && currentQ.options.length > 2 && (
                        <button onClick={() => removeOption(activeQuestion, opt.id)} className="text-white/40 hover:text-white shrink-0 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {currentQ.type !== 'true_false' && (
                  <button
                    onClick={() => addOption(activeQuestion)}
                    className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-colors py-5"
                  >
                    <Plus className="w-4 h-4" />{t('quiz.addOption')}
                  </button>
                )}
              </div>
            )}



            {/* Help text + Explanation */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">{t('quiz.helpText')}</label>
                <input value={currentQ.helpText || ''} onChange={e => updateQuestion(activeQuestion, { helpText: e.target.value })} className="input text-xs w-full" placeholder={t('quiz.helpTextPlaceholder')} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">{t('quiz.explanation')}</label>
                <input value={currentQ.answerExplanation || ''} onChange={e => updateQuestion(activeQuestion, { answerExplanation: e.target.value })} className="input text-xs w-full" placeholder={t('quiz.explanationHint')} />
              </div>
            </div>

            {/* Scoring row */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500">{t('quiz.timer')}</span>
                <select value={currentQ.timerSeconds} onChange={e => updateQuestion(activeQuestion, { timerSeconds: parseInt(e.target.value) })} className="text-sm font-bold border rounded-lg px-2 py-1 bg-transparent dark:text-white outline-none" style={{ borderColor: 'var(--kahoot-purple)', color: 'var(--kahoot-purple)' }}>
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                  <option value={20}>20s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                  <option value={90}>90s</option>
                  <option value={120}>2min</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{t('quiz.points')}</span>
                <select value={currentQ.points} onChange={e => updateQuestion(activeQuestion, { points: parseInt(e.target.value) || 1000 })} className="text-sm font-bold border rounded-lg px-2 py-1 bg-transparent dark:text-white outline-none" style={{ borderColor: 'var(--kahoot-purple)', color: 'var(--kahoot-purple)' }}>
                  <option value={0}>No points</option>
                  <option value={500}>500</option>
                  <option value={1000}>Standard (1000)</option>
                  <option value={2000}>Double (2000)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{t('quiz.difficulty')}</span>
                <select value={currentQ.difficulty || 'medium'} onChange={e => updateQuestion(activeQuestion, { difficulty: e.target.value as QuizDifficulty })} className="text-sm font-bold border rounded-lg px-2 py-1 bg-transparent dark:text-white outline-none" style={{ borderColor: 'var(--kahoot-purple)', color: 'var(--kahoot-purple)' }}>
                  <option value="easy">{t('quiz.easy')}</option>
                  <option value="medium">{t('quiz.medium')}</option>
                  <option value="hard">{t('quiz.hard')}</option>
                  <option value="expert">{t('quiz.expert')}</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <AIGeneratorModal
        isOpen={showAIGen}
        onClose={() => setShowAIGen(false)}
        onSuccess={handleAIGenerateSuccess}
        type="quiz"
      />

      <FileViewerModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};

export default QuizBuilderPage;
