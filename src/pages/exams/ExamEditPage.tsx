import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { createExam, getExam, updateExam, saveQuestions, getQuestions } from '../../services/exams.service';
import { uploadFile } from '../../services/storage.service';
import type { Question, QuestionType } from '../../types';
import { generateId } from '../../utils/grading';
import { Save, ArrowLeft, Plus, Trash2, Sparkles, Settings, HelpCircle, GripVertical, ImageIcon, Volume2, Video, PlayCircle } from 'lucide-react';
import { AIGeneratorModal } from '../../components/ui/AIGeneratorModal';

const EMPTY_QUESTION = (): Question => ({
  id: generateId(),
  type: 'multiple_choice',
  text: '',
  options: ['', ''],
  correctAnswer: '',
  correctAnswers: [],
  keywords: [],
  points: 1,
  order: 0,
});

const ExamEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { canAccess } = usePlanGate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passScore, setPassScore] = useState(60);
  const [randomize, setRandomize] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [gradingCategories, setGradingCategories] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([EMPTY_QUESTION()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [showAIGen, setShowAIGen] = useState(false);

  // Normalize AI-generated types to frontend QuestionType enum
  const normalizeType = (aiType: string): QuestionType => {
    const typeMap: Record<string, QuestionType> = {
      'single_choice': 'multiple_choice',
      'multiple_choice': 'multiple_choice',
      'multi_select': 'multi_select',
      'true_false': 'true_false',
      'short_answer': 'short_answer',
      'speaking': 'speaking',
      // Legacy/deprecated AI types → best match
      'matching': 'short_answer',
      'media_question': 'multiple_choice',
    };
    return typeMap[aiType] || 'multiple_choice';
  };

  const handleAIGenerateSuccess = (data: any[]) => {
    const startOrder = questions.length;
    const newQuestions = data.map((q, i) => {
      const opts = q.options || [];
      const resolvedType = normalizeType(q.type);
      
      let correctAnswersStr: string[] = [];
      if (q.correctOptionIndices && Array.isArray(q.correctOptionIndices)) {
        correctAnswersStr = q.correctOptionIndices.map((idx: number) => opts[idx]).filter(Boolean);
      } else if (q.correctOptionIndex !== undefined) {
        correctAnswersStr = [opts[q.correctOptionIndex]].filter(Boolean);
      }
      
      const correctOpt = correctAnswersStr.length > 0 ? correctAnswersStr[0] : '';

      return {
        id: generateId(),
        type: resolvedType,
        text: q.question || '',
        options: resolvedType === 'true_false' ? ['True', 'False'] : opts,
        correctAnswer: correctOpt,
        correctAnswers: correctAnswersStr,
        keywords: q.keywords || [],
        points: q.points || 1,
        order: startOrder + i,
        mediaUrl: q.searchQuery ? `https://loremflickr.com/800/600/${encodeURIComponent(q.searchQuery)}?lock=${Math.floor(Math.random() * 100)}` : undefined,
        mediaType: (q.searchQuery ? 'image' : undefined) as 'image' | undefined,
        ttsText: q.ttsText,
      } as Question;
    });
    
    // Remove the default empty question if it's the only one and empty
    if (questions.length === 1 && questions[0].text === '') {
      setQuestions(newQuestions);
    } else {
      setQuestions([...questions, ...newQuestions]);
    }
  };

  useEffect(() => {
    if (isEdit && id) {
      Promise.all([getExam(id), getQuestions(id)]).then(([exam, qs]) => {
        if (exam) {
          setTitle(exam.title); setDescription(exam.description); setSubject(exam.subject);
          setDurationMinutes(exam.durationMinutes); setPassScore(exam.passScore);
          setRandomize(exam.randomizeQuestions); setShowResults(exam.showResultsImmediately);
          setStatus(exam.status as any);
          setGradingCategories(exam.gradingCategories || []);
        }
        if (qs.length > 0) setQuestions(qs);
        setLoading(false);
      });
    }
  }, [id, isEdit]);

  const addQuestion = () => setQuestions([...questions, { ...EMPTY_QUESTION(), order: questions.length }]);
  const removeQuestion = (idx: number) => { if (questions.length > 1) setQuestions(questions.filter((_, i) => i !== idx)); };
  const updateQuestion = (idx: number, updates: Partial<Question>) => setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  const addOption = (idx: number) => { const q = questions[idx]; updateQuestion(idx, { options: [...q.options, ''] }); };
  const removeOption = (qIdx: number, oIdx: number) => { const q = questions[qIdx]; if (q.options.length > 2) updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) }); };
  const updateOption = (qIdx: number, oIdx: number, value: string) => { const opts = [...questions[qIdx].options]; opts[oIdx] = value; updateQuestion(qIdx, { options: opts }); };

  const handleSave = async () => {
    if (!title || !subject) { toast.error(t('exams.titleSubjectRequired', 'Title and Subject are required')); return; }
    setSaving(true);
    try {
      const examData = {
        title, description, subject, durationMinutes, passScore,
        randomizeQuestions: randomize, showResultsImmediately: showResults,
        status, questionCount: questions.length, gradingCategories,
        authorId: profile?.uid || '', authorName: profile?.displayName || '',
      };
      let examId = id;
      if (isEdit && id) { await updateExam(id, examData); } else { examId = await createExam(examData as any); }
      await saveQuestions(examId!, questions.map((q, i) => ({ ...q, order: i })));
      navigate(`/exams/${examId}`);
      toast.success(t('exams.savedSuccessfully', 'Exam saved successfully'));
    } catch (e) { console.error(e); toast.error(t('exams.saveFailed', 'Failed to save exam')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>;

  const labelClass = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2";
  const inputClass = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400";

  return (
    <div className="max-w-5xl mx-auto pb-16 font-sans animate-fade-in relative">
      
      {/* Sticky Top Bar for Actions */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:hover:text-white dark:hover:bg-slate-800 transition-all shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1">
                {isEdit ? t('exams.editExam', 'Edit Assessment') : t('exams.newExam', 'Create Assessment')}
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {status === 'published' ? <span className="text-emerald-500">Live & Published</span> : 'Draft Mode'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />{saving ? t('common.saving', 'Saving...') : t('common.save', 'Save Assessment')}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Module 1: Core Configuration */}
        <section className="exam-slide-up bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('exams.coreSettings', 'Core Configuration')}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={labelClass}>{t('exams.titleLabel', 'Assessment Title')} *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} !text-lg !font-semibold`} placeholder={t('exams.titlePlaceholder', 'e.g. Midterm Examination: Advanced Algorithms')} />
            </div>
            
            <div className="md:col-span-2">
              <label className={labelClass}>{t('exams.descriptionLabel', 'Description & Instructions')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[100px] resize-y`} placeholder={t('exams.descPlaceholder', 'Provide any prep instructions for students...')} />
            </div>
            
            <div>
              <label className={labelClass}>{t('exams.subjectLabel', 'Subject / Category')} *</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} placeholder="e.g. Computer Science" />
            </div>
            
            <div className="md:col-span-2">
              <label className={labelClass}>{t('exams.gradingCategories', 'AI Evaluation Skills (Optional)')}</label>
              <input value={gradingCategories.join(', ')} onChange={(e) => setGradingCategories(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className={inputClass} placeholder={t('exams.gradingCategoriesPlaceholder', 'e.g. Speaking, Writing, Coding, Design')} />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">Comma-separated skills the AI must evaluate specifically. Leave blank for standard evaluation.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('exams.durationLabel', 'Duration (Min)')}</label>
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(+e.target.value)} className={inputClass} min={1} />
              </div>
              <div>
                <label className={labelClass}>{t('exams.passScoreLabel', 'Pass Score (%)')}</label>
                <input type="number" value={passScore} onChange={(e) => setPassScore(+e.target.value)} className={inputClass} min={0} max={100} />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('common.status', 'Status')}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputClass}>
                <option value="draft">{t('common.draft', 'Draft (Hidden)')}</option>
                <option value="published">{t('common.published', 'Published (Visible)')}</option>
              </select>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} className="peer sr-only" />
                  <div className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 peer-checked:bg-slate-900 peer-checked:border-slate-900 dark:peer-checked:bg-white dark:peer-checked:border-white transition-all flex items-center justify-center">
                    <svg className={`w-3 h-3 text-white dark:text-slate-900 ${randomize ? 'opacity-100' : 'opacity-0'} transition-opacity`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t('exams.randomize', 'Shuffle Questions')}</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="peer sr-only" />
                  <div className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 peer-checked:bg-slate-900 peer-checked:border-slate-900 dark:peer-checked:bg-white dark:peer-checked:border-white transition-all flex items-center justify-center">
                    <svg className={`w-3 h-3 text-white dark:text-slate-900 ${showResults ? 'opacity-100' : 'opacity-0'} transition-opacity`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t('exams.showResults', 'Show Results Immediately')}</span>
              </label>
            </div>
          </div>
        </section>

        {/* Module 2: Question Builder */}
        <section className="exam-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <HelpCircle className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('exams.questions', 'Questions Array')} ({questions.length})</h2>
            </div>
            
            <div className="flex items-center gap-3">
              {canAccess('ai') && (
                <button 
                  onClick={() => setShowAIGen(true)} 
                  className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-black hover:to-black dark:from-white dark:to-slate-200 dark:text-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 dark:text-amber-500" />
                  {t('ai.generateButton', 'AI Generation')}
                </button>
              )}
              <button 
                onClick={addQuestion} 
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />{t('exams.addQuestion', 'Add Manual')}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {questions.map((q, qIdx) => (
              <div key={q.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm relative group overflow-hidden transition-all focus-within:ring-2 focus-within:ring-slate-400 dark:focus-within:ring-slate-600 focus-within:border-transparent">
                
                {/* Visual Number Indicator */}
                <div className="absolute top-0 left-0 w-2 h-full bg-slate-100 dark:bg-slate-800 group-focus-within:bg-slate-900 dark:group-focus-within:bg-white transition-colors" />

                <div className="pl-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <GripVertical className="w-4 h-4 text-slate-400 cursor-move hidden sm:block" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Q{qIdx + 1}</span>
                      </div>
                      
                      <select 
                        value={q.type} 
                        onChange={(e) => updateQuestion(qIdx, { type: e.target.value as QuestionType })} 
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none"
                      >
                        <option value="multiple_choice">{t('exams.singleChoice', 'Один ответ')}</option>
                        <option value="multi_select">{t('exams.multipleChoice', 'Несколько ответов')}</option>
                        <option value="true_false">{t('exams.trueFalse', 'Верно / Неверно')}</option>
                        <option value="short_answer">{t('exams.textAnswer', 'Текстовый ответ')}</option>
                        <option value="speaking">{t('exams.speaking', 'Устный ответ')}</option>
                      </select>
                      
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-bold text-slate-500">PTS</span>
                        <input 
                          type="number" 
                          value={q.points} 
                          onChange={(e) => updateQuestion(qIdx, { points: +e.target.value })} 
                          className="w-12 bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none" 
                          min={1} 
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => removeQuestion(qIdx)} 
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all self-end sm:self-auto"
                      title="Remove Question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mb-6">
                    <textarea 
                      value={q.text} 
                      onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} 
                      className={`${inputClass} !text-base !font-medium min-h-[80px] resize-y`} 
                      placeholder={t('exams.questionPlaceholder', 'Enter question text here...')} 
                    />
                  </div>

                  {/* MEDIA & AUDIO CONTROLS */}
                  <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col xl:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('quiz.mediaAttachment', 'Media Attachment')}</label>
                        {q.mediaUrl ? (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black/5 flex items-center justify-center min-h-[120px]">
                            {q.mediaType === 'image' && <img src={q.mediaUrl} alt="Question Media" className="max-h-48 object-contain" />}
                            {q.mediaType === 'video' && <video src={q.mediaUrl} controls className="max-h-48" />}
                            {q.mediaType === 'audio' && <audio src={q.mediaUrl} controls className="w-full mx-4" />}
                            <button onClick={() => updateQuestion(qIdx, { mediaUrl: undefined, mediaType: undefined })} className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all">
                              <ImageIcon className="w-6 h-6 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-500">{t('quiz.image', 'Image')}</span>
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const url = await uploadFile(`exams/${id}/${Date.now()}-${file.name}`, file);
                                updateQuestion(qIdx, { mediaUrl: url, mediaType: 'image' });
                              }} />
                            </label>
                            <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all">
                              <Video className="w-6 h-6 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-500">{t('quiz.video', 'Video')}</span>
                              <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const url = await uploadFile(`exams/${id}/${Date.now()}-${file.name}`, file);
                                updateQuestion(qIdx, { mediaUrl: url, mediaType: 'video' });
                              }} />
                            </label>
                            <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all">
                              <Volume2 className="w-6 h-6 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-500">{t('quiz.audio', 'Audio')}</span>
                              <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const url = await uploadFile(`exams/${id}/${Date.now()}-${file.name}`, file);
                                updateQuestion(qIdx, { mediaUrl: url, mediaType: 'audio' });
                              }} />
                            </label>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 space-y-4">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('quiz.ttsAudio', 'Text to Synthesize')}</label>
                        <div className="flex items-start gap-2">
                          <textarea
                            value={q.ttsText || ''}
                            onChange={(e) => updateQuestion(qIdx, { ttsText: e.target.value })}
                            className={`${inputClass} min-h-[120px] text-sm`}
                            placeholder={t('quiz.ttsPlaceholder', 'Type text that will be synthesized into speech for the student...')}
                          />
                        </div>
                        {q.ttsText && (
                          <div className="flex justify-end">
                            <button 
                              onClick={() => {
                                window.speechSynthesis.cancel();
                                const u = new SpeechSynthesisUtterance(q.ttsText);
                                window.speechSynthesis.speak(u);
                              }}
                              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                              <PlayCircle className="w-4 h-4" /> {t('quiz.listen', 'Listen')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ─── Multiple Choice / Multi Select Options ─── */}
                  {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
                    <div className="space-y-3 pl-2 sm:pl-6 border-l-2 border-slate-100 dark:border-slate-800">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-3">
                          {q.type === 'multiple_choice' ? (
                            <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                               <input type="radio" name={`q-${q.id}`} checked={q.correctAnswer === opt && opt !== ''} onChange={() => updateQuestion(qIdx, { correctAnswer: opt })} className="peer sr-only" />
                               <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 peer-checked:border-emerald-500 flex items-center justify-center transition-all cursor-pointer">
                                   {q.correctAnswer === opt && opt !== '' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                               </div>
                            </div>
                          ) : (
                            <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                              <input type="checkbox" checked={q.correctAnswers.includes(opt) && opt !== ''} onChange={(e) => {
                                const ca = e.target.checked ? [...q.correctAnswers, opt] : q.correctAnswers.filter((a) => a !== opt);
                                updateQuestion(qIdx, { correctAnswers: ca });
                              }} className="peer sr-only" />
                              <div className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center cursor-pointer">
                                <svg className={`w-3 h-3 text-white ${q.correctAnswers.includes(opt) && opt !== '' ? 'opacity-100' : 'opacity-0'} transition-opacity`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              </div>
                            </div>
                          )}
                          <input 
                            value={opt} 
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} 
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none transition-all" 
                            placeholder={`${t('exams.option', 'Option')} ${oIdx + 1}`} 
                          />
                          <button onClick={() => removeOption(qIdx, oIdx)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button onClick={() => addOption(qIdx)} className="mt-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Plus className="w-4 h-4" /> {t('exams.addOption', 'Add Option')}
                      </button>
                    </div>
                  )}

                  {/* ─── True / False ─── */}
                  {q.type === 'true_false' && (
                    <div className="space-y-3 pl-2 sm:pl-6 border-l-2 border-emerald-200 dark:border-emerald-800">
                      {['True', 'False'].map((opt) => (
                        <div key={opt} className="flex items-center gap-3">
                          <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                            <input type="radio" name={`q-${q.id}-tf`} checked={q.correctAnswer === opt} onChange={() => updateQuestion(qIdx, { correctAnswer: opt, options: ['True', 'False'] })} className="peer sr-only" />
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 peer-checked:border-emerald-500 flex items-center justify-center transition-all cursor-pointer">
                              {q.correctAnswer === opt && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                            </div>
                          </div>
                          <span className={`text-sm font-semibold ${q.correctAnswer === opt ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                            {opt === 'True' ? '✅ Верно (True)' : '❌ Неверно (False)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ─── Speaking (oral) ─── */}
                  {q.type === 'speaking' && (
                    <div className="pl-6 border-l-2 border-violet-200 dark:border-violet-800 pt-2">
                      <p className="text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-lg border border-violet-200 dark:border-violet-800/30 font-medium">
                        🎤 {t('exams.speakingHint', 'Студент запишет аудио-ответ при прохождении экзамена. Оценка происходит вручную.')}
                      </p>
                    </div>
                  )}

                  {q.type === 'short_answer' && (
                    <div className="pl-6 border-l-2 border-slate-100 dark:border-slate-800 pt-2">
                      <label className={labelClass}>{t('exams.keywords', 'Grading Keywords')}</label>
                      <input 
                        value={q.keywords.join(', ')} 
                        onChange={(e) => updateQuestion(qIdx, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} 
                        className={inputClass} 
                        placeholder={t('exams.keywordsPlaceholder', 'e.g. constant, O(1), algorithm')} 
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 p-3 rounded-lg border border-amber-200 dark:border-amber-800/30">
                        {t('exams.keywordsHint', 'Words separated by commas. Used by the automatic grader to evaluate short text answers.')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Floating Action Buffer */}
      <div className="h-20" />

      <AIGeneratorModal
        isOpen={showAIGen}
        onClose={() => setShowAIGen(false)}
        onSuccess={handleAIGenerateSuccess}
        type="exam"
      />
    </div>
  );
};

export default ExamEditPage;
