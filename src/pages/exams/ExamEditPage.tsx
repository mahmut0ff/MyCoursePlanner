import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { createExam, getExam, updateExam, saveQuestions, getQuestions } from '../../services/exams.service';
import type { Question, QuestionType } from '../../types';
import { generateId } from '../../utils/grading';
import { Save, ArrowLeft, Plus, Trash2, Sparkles } from 'lucide-react';
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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passScore, setPassScore] = useState(60);
  const [randomize, setRandomize] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [questions, setQuestions] = useState<Question[]>([EMPTY_QUESTION()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [showAIGen, setShowAIGen] = useState(false);

  const handleAIGenerateSuccess = (data: any[]) => {
    const startOrder = questions.length;
    const newQuestions = data.map((q, i) => {
      const opts = q.options || [];
      const correctOpt = opts[q.correctOptionIndex || 0] || '';
      return {
        id: generateId(),
        type: 'multiple_choice' as QuestionType,
        text: q.question || '',
        options: opts,
        correctAnswer: correctOpt,
        correctAnswers: [],
        keywords: [],
        points: q.points || 1,
        order: startOrder + i,
      };
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
    if (!title || !subject) { toast.error(t('exams.titleSubjectRequired')); return; }
    setSaving(true);
    try {
      const examData = {
        title, description, subject, durationMinutes, passScore,
        randomizeQuestions: randomize, showResultsImmediately: showResults,
        status, questionCount: questions.length,
        authorId: profile?.uid || '', authorName: profile?.displayName || '',
      };
      let examId = id;
      if (isEdit && id) { await updateExam(id, examData); } else { examId = await createExam(examData as any); }
      await saveQuestions(examId!, questions.map((q, i) => ({ ...q, order: i })));
      navigate(`/exams/${examId}`);
    } catch (e) { console.error(e); toast.error(t('exams.saveFailed')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const labelClass = "block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{isEdit ? t('exams.editExam') : t('exams.newExam')}</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50">
          <Save className="w-3.5 h-3.5" />{saving ? '...' : t('common.save')}
        </button>
      </div>

      <div className="space-y-3">
        {/* Metadata */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelClass}>{t('exams.titleLabel')} *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm" placeholder={t('exams.titlePlaceholder')} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>{t('exams.descriptionLabel')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[60px] text-sm" />
            </div>
            <div><label className={labelClass}>{t('exams.subjectLabel')} *</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className="input text-sm" /></div>
            <div><label className={labelClass}>{t('exams.durationLabel')}</label><input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(+e.target.value)} className="input text-sm" min={1} /></div>
            <div><label className={labelClass}>{t('exams.passScoreLabel')}</label><input type="number" value={passScore} onChange={(e) => setPassScore(+e.target.value)} className="input text-sm" min={0} max={100} /></div>
            <div><label className={labelClass}>{t('common.status')}</label><select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input text-sm"><option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option></select></div>
            <div className="md:col-span-2 flex items-center gap-5">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-primary-600" /><span className="text-xs text-slate-700 dark:text-slate-300">{t('exams.randomize')}</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-primary-600" /><span className="text-xs text-slate-700 dark:text-slate-300">{t('exams.showResults')}</span></label>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('exams.questions')} ({questions.length})</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAIGen(true)} className="text-xs bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-primary-500/20">
                <Sparkles className="w-3.5 h-3.5" />{t('ai.generateButton', 'Сгенерировать ИИ')}
              </button>
              <button onClick={addQuestion} className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" />{t('exams.addQuestion')}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {questions.map((q, qIdx) => (
              <div key={q.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-medium">{qIdx + 1}</span>
                    <select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value as QuestionType })} className="input w-auto text-xs !py-1">
                      <option value="multiple_choice">{t('exams.singleChoice')}</option>
                      <option value="multi_select">{t('exams.multipleChoice')}</option>
                      <option value="short_answer">{t('exams.textAnswer')}</option>
                    </select>
                    <input type="number" value={q.points} onChange={(e) => updateQuestion(qIdx, { points: +e.target.value })} className="input w-16 text-xs !py-1" min={1} placeholder={t('exams.points')} />
                  </div>
                  <button onClick={() => removeQuestion(qIdx)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                <div className="mb-3">
                  <textarea value={q.text} onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} className="input min-h-[50px] text-sm" placeholder={t('exams.questionPlaceholder')} />
                </div>

                {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        {q.type === 'multiple_choice' ? (
                          <input type="radio" name={`q-${q.id}`} checked={q.correctAnswer === opt && opt !== ''} onChange={() => updateQuestion(qIdx, { correctAnswer: opt })} className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <input type="checkbox" checked={q.correctAnswers.includes(opt) && opt !== ''} onChange={(e) => {
                            const ca = e.target.checked ? [...q.correctAnswers, opt] : q.correctAnswers.filter((a) => a !== opt);
                            updateQuestion(qIdx, { correctAnswers: ca });
                          }} className="w-3.5 h-3.5 rounded text-primary-600" />
                        )}
                        <input value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} className="input flex-1 text-xs" placeholder={`${t('exams.option')} ${oIdx + 1}`} />
                        <button onClick={() => removeOption(qIdx, oIdx)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => addOption(qIdx)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ {t('exams.addOption')}</button>
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <div>
                    <label className={labelClass}>{t('exams.keywords')}</label>
                    <input value={q.keywords.join(', ')} onChange={(e) => updateQuestion(qIdx, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} className="input text-xs" placeholder={t('exams.keywordsPlaceholder')} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{t('exams.keywordsHint')}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

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
