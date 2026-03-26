import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetQuiz, apiCreateQuiz, apiUpdateQuiz, apiSaveQuizQuestions } from '../../lib/api';
import type { Quiz, QuizQuestion, QuizQuestionType, QuizDifficulty } from '../../types';
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical,
  CheckCircle, Circle,
  ChevronDown, ChevronUp, Copy, Settings, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

const QUESTION_TYPES: { type: QuizQuestionType; label: string; icon: string }[] = [
  { type: 'single_choice', label: 'Single Choice', icon: '🔘' },
  { type: 'multiple_choice', label: 'Multiple Choice', icon: '☑️' },
  { type: 'true_false', label: 'True / False', icon: '✅' },
  { type: 'multi_select', label: 'Multi Select', icon: '📋' },
  { type: 'short_text', label: 'Short Answer', icon: '✏️' },
  { type: 'poll', label: 'Poll / Opinion', icon: '📊' },
  { type: 'ordering', label: 'Ordering', icon: '🔢' },
  { type: 'matching', label: 'Matching', icon: '🔗' },
  { type: 'image_question', label: 'Image Question', icon: '🖼️' },
  { type: 'audio_question', label: 'Audio Question', icon: '🎵' },
  { type: 'pdf_question', label: 'PDF Question', icon: '📄' },
  { type: 'passage_question', label: 'Passage + Question', icon: '📖' },
  { type: 'info_slide', label: 'Info Slide', icon: 'ℹ️' },
  { type: 'discussion', label: 'Discussion', icon: '💬' },
  { type: 'puzzle', label: 'Puzzle / Timed', icon: '🧩' },
];

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
  const [tagInput, setTagInput] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
      // Save questions
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

  // Option management
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
      const next = q.correctAnswers.includes(optId)
        ? q.correctAnswers.filter(a => a !== optId)
        : [...q.correctAnswers, optId];
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

  // Drag handlers
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveQuestion(dragIndex, index);
      setDragIndex(index);
    }
  };
  const handleDragEnd = () => setDragIndex(null);

  const currentQ = questions[activeQuestion];

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/library')} className="btn-ghost p-2"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <input
              value={quiz.title || ''}
              onChange={e => setQuiz({ ...quiz, title: e.target.value })}
              placeholder={t('quiz.quizTitle')}
              className="text-xl font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none placeholder-slate-300 dark:placeholder-slate-600 w-full"
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
          <button onClick={() => setShowSettings(!showSettings)} className={`btn-ghost p-2 ${showSettings ? 'text-primary-600' : ''}`}>
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />{saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Quiz Settings Panel */}
      {showSettings && (
        <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.subject')}</label>
            <input value={quiz.subject || ''} onChange={e => setQuiz({ ...quiz, subject: e.target.value })} className="input text-xs mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.difficulty')}</label>
            <select value={quiz.difficulty || 'medium'} onChange={e => setQuiz({ ...quiz, difficulty: e.target.value as QuizDifficulty })} className="input text-xs mt-1">
              <option value="easy">{t('quiz.easy')}</option>
              <option value="medium">{t('quiz.medium')}</option>
              <option value="hard">{t('quiz.hard')}</option>
              <option value="expert">{t('quiz.expert')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.visibility')}</label>
            <select value={quiz.visibility || 'private'} onChange={e => setQuiz({ ...quiz, visibility: e.target.value as any })} className="input text-xs mt-1">
              <option value="private">{t('quiz.private')}</option>
              <option value="organization">{t('quiz.orgShared')}</option>
              <option value="platform">{t('quiz.platformShared')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.duration')}</label>
            <input type="number" value={quiz.estimatedMinutes || 10} onChange={e => setQuiz({ ...quiz, estimatedMinutes: parseInt(e.target.value) || 10 })} className="input text-xs mt-1" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.description')}</label>
            <textarea value={quiz.description || ''} onChange={e => setQuiz({ ...quiz, description: e.target.value })} className="input text-xs mt-1 h-16" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.tags')}</label>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {quiz.tags?.map(tag => (
                <span key={tag} className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  {tag}
                  <button onClick={() => setQuiz({ ...quiz, tags: quiz.tags?.filter(t => t !== tag) })} className="hover:text-red-500">×</button>
                </span>
              ))}
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag..." className="input text-xs w-24 py-0.5 px-2" />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Question List (left sidebar) */}
        <div className="w-56 shrink-0">
          <div className="card overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">{t('quiz.questions')} ({questions.length})</p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveQuestion(i)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 transition-colors ${
                    activeQuestion === i ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <GripVertical className="w-3 h-3 text-slate-300 cursor-grab shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400">{QUESTION_TYPES.find(t => t.type === q.type)?.icon} Q{i + 1}</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{q.text || t('quiz.untitled')}</p>
                  </div>
                  {q.correctAnswers.length > 0 && <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />}
                </div>
              ))}
            </div>

            {/* Add question */}
            <div className="p-2 border-t border-slate-200 dark:border-slate-700">
              <div className="relative group">
                <button onClick={() => addQuestion()} className="w-full flex items-center justify-center gap-1 text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 py-1.5 rounded-md transition-colors">
                  <Plus className="w-3 h-3" />{t('quiz.addQuestion')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Question Editor (main area) */}
        {currentQ && (
          <div className="flex-1">
            <div className="card p-5">
              {/* Question type selector */}
              <div className="flex items-center justify-between mb-4">
                <select
                  value={currentQ.type}
                  onChange={e => updateQuestion(activeQuestion, { type: e.target.value as QuizQuestionType })}
                  className="input text-xs w-48"
                >
                  {QUESTION_TYPES.map(qt => (
                    <option key={qt.type} value={qt.type}>{qt.icon} {qt.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={() => moveQuestion(activeQuestion, activeQuestion - 1)} disabled={activeQuestion === 0} className="btn-ghost p-1 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveQuestion(activeQuestion, activeQuestion + 1)} disabled={activeQuestion === questions.length - 1} className="btn-ghost p-1 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => duplicateQuestion(activeQuestion)} className="btn-ghost p-1"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => deleteQuestion(activeQuestion)} className="btn-ghost p-1 text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Question text */}
              <textarea
                value={currentQ.text}
                onChange={e => updateQuestion(activeQuestion, { text: e.target.value })}
                placeholder={t('quiz.questionText')}
                className="input text-sm w-full h-20 mb-4"
              />

              {/* Media URL */}
              {['image_question', 'audio_question', 'pdf_question'].includes(currentQ.type) && (
                <div className="mb-4">
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.mediaUrl')}</label>
                  <input
                    value={currentQ.mediaUrl || ''}
                    onChange={e => updateQuestion(activeQuestion, { mediaUrl: e.target.value, mediaType: currentQ.type === 'image_question' ? 'image' : currentQ.type === 'audio_question' ? 'audio' : 'pdf' })}
                    placeholder="https://..."
                    className="input text-xs w-full"
                  />
                  {currentQ.mediaUrl && currentQ.type === 'image_question' && (
                    <img src={currentQ.mediaUrl} alt="" className="mt-2 max-h-40 rounded-lg border" />
                  )}
                  {currentQ.mediaUrl && currentQ.type === 'audio_question' && (
                    <audio src={currentQ.mediaUrl} controls className="mt-2 w-full" />
                  )}
                </div>
              )}

              {/* Passage */}
              {currentQ.type === 'passage_question' && (
                <div className="mb-4">
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.passage')}</label>
                  <textarea
                    value={currentQ.passageText || ''}
                    onChange={e => updateQuestion(activeQuestion, { passageText: e.target.value })}
                    className="input text-xs w-full h-24"
                    placeholder={t('quiz.passagePlaceholder')}
                  />
                </div>
              )}

              {/* Help text */}
              <div className="mb-4">
                <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.helpText')}</label>
                <input
                  value={currentQ.helpText || ''}
                  onChange={e => updateQuestion(activeQuestion, { helpText: e.target.value })}
                  className="input text-xs w-full"
                  placeholder={t('quiz.helpTextPlaceholder')}
                />
              </div>

              {/* Options (for choice-based questions) */}
              {['single_choice', 'multiple_choice', 'true_false', 'multi_select', 'poll', 'image_question', 'audio_question', 'pdf_question', 'passage_question', 'puzzle'].includes(currentQ.type) && (
                <div className="mb-4">
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-2 block">{t('quiz.answerOptions')}</label>
                  <div className="space-y-2">
                    {currentQ.options.map((opt, oi) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <button
                          onClick={() => toggleCorrectAnswer(activeQuestion, opt.id)}
                          className={`shrink-0 transition-colors ${currentQ.correctAnswers.includes(opt.id) ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'}`}
                        >
                          {currentQ.correctAnswers.includes(opt.id) ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </button>
                        <input
                          value={opt.text}
                          onChange={e => updateOption(activeQuestion, opt.id, e.target.value)}
                          placeholder={`${t('quiz.option')} ${oi + 1}`}
                          className={`input text-xs flex-1 ${currentQ.correctAnswers.includes(opt.id) ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' : ''}`}
                        />
                        {currentQ.type !== 'true_false' && currentQ.options.length > 2 && (
                          <button onClick={() => removeOption(activeQuestion, opt.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    ))}
                    {currentQ.type !== 'true_false' && (
                      <button onClick={() => addOption(activeQuestion)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                        <Plus className="w-3 h-3" />{t('quiz.addOption')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Short text correct answers */}
              {currentQ.type === 'short_text' && (
                <div className="mb-4">
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.acceptedAnswers')}</label>
                  <input
                    value={currentQ.correctAnswers.join(', ')}
                    onChange={e => updateQuestion(activeQuestion, { correctAnswers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder={t('quiz.acceptedAnswersHint')}
                    className="input text-xs w-full"
                  />
                </div>
              )}

              {/* Answer explanation */}
              <div className="mb-4">
                <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.explanation')}</label>
                <input
                  value={currentQ.answerExplanation || ''}
                  onChange={e => updateQuestion(activeQuestion, { answerExplanation: e.target.value })}
                  className="input text-xs w-full"
                  placeholder={t('quiz.explanationHint')}
                />
              </div>

              {/* Scoring settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block flex items-center gap-1"><Clock className="w-3 h-3" />{t('quiz.timer')}</label>
                  <select value={currentQ.timerSeconds} onChange={e => updateQuestion(activeQuestion, { timerSeconds: parseInt(e.target.value) })} className="input text-xs">
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
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.points')}</label>
                  <input type="number" value={currentQ.points} onChange={e => updateQuestion(activeQuestion, { points: parseInt(e.target.value) || 1000 })} className="input text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">{t('quiz.difficulty')}</label>
                  <select value={currentQ.difficulty || 'medium'} onChange={e => updateQuestion(activeQuestion, { difficulty: e.target.value as QuizDifficulty })} className="input text-xs">
                    <option value="easy">{t('quiz.easy')}</option>
                    <option value="medium">{t('quiz.medium')}</option>
                    <option value="hard">{t('quiz.hard')}</option>
                    <option value="expert">{t('quiz.expert')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizBuilderPage;
