import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { createExam, getExam, updateExam, saveQuestions, getQuestions } from '../../services/exams.service';
import type { Question, QuestionType } from '../../types';
import { generateId } from '../../utils/grading';
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react';

const EMPTY_QUESTION = (): Question => ({
  id: generateId(),
  type: 'single_choice',
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

  useEffect(() => {
    if (isEdit && id) {
      Promise.all([getExam(id), getQuestions(id)]).then(([exam, qs]) => {
        if (exam) {
          setTitle(exam.title);
          setDescription(exam.description);
          setSubject(exam.subject);
          setDurationMinutes(exam.durationMinutes);
          setPassScore(exam.passScore);
          setRandomize(exam.randomizeQuestions);
          setShowResults(exam.showResultsImmediately);
          setStatus(exam.status as any);
        }
        if (qs.length > 0) setQuestions(qs);
        setLoading(false);
      });
    }
  }, [id, isEdit]);

  const addQuestion = () => {
    setQuestions([...questions, { ...EMPTY_QUESTION(), order: questions.length }]);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, updates: Partial<Question>) => {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  };

  const addOption = (idx: number) => {
    const q = questions[idx];
    updateQuestion(idx, { options: [...q.options, ''] });
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    const q = questions[qIdx];
    if (q.options.length <= 2) return;
    updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) });
  };

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    const q = questions[qIdx];
    const opts = [...q.options];
    opts[oIdx] = value;
    updateQuestion(qIdx, { options: opts });
  };

  const handleSave = async () => {
    if (!title || !subject) { alert('Title and subject are required'); return; }
    setSaving(true);
    try {
      const examData = {
        title, description, subject, durationMinutes, passScore,
        randomizeQuestions: randomize, showResultsImmediately: showResults,
        status, questionCount: questions.length,
        authorId: profile?.uid || '', authorName: profile?.displayName || '',
      };
      let examId = id;
      if (isEdit && id) {
        await updateExam(id, examData);
      } else {
        examId = await createExam(examData as any);
      }
      const orderedQs = questions.map((q, i) => ({ ...q, order: i }));
      await saveQuestions(examId!, orderedQs);
      navigate(`/exams/${examId}`);
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save exam');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Exam' : 'New Exam'}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}</button>
      </div>

      <div className="space-y-6">
        {/* Metadata */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Exam Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><label className="label">Title *</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Exam title" /></div>
            <div className="md:col-span-2"><label className="label">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[80px]" /></div>
            <div><label className="label">Subject *</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" /></div>
            <div><label className="label">Duration (min)</label><input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(+e.target.value)} className="input" min={1} /></div>
            <div><label className="label">Pass Score (%)</label><input type="number" value={passScore} onChange={(e) => setPassScore(+e.target.value)} className="input" min={0} max={100} /></div>
            <div><label className="label">Status</label><select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input"><option value="draft">Draft</option><option value="published">Published</option></select></div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" /><span className="text-sm text-slate-700">Randomize Questions</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" /><span className="text-sm text-slate-700">Show Results Immediately</span></label>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Questions ({questions.length})</h2>
            <button onClick={addQuestion} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" />Add Question</button>
          </div>
          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <div key={q.id} className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">{qIdx + 1}</span>
                    <select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value as QuestionType })} className="input w-auto">
                      <option value="single_choice">Single Choice</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="text">Text Answer</option>
                    </select>
                    <input type="number" value={q.points} onChange={(e) => updateQuestion(qIdx, { points: +e.target.value })} className="input w-20" min={1} placeholder="Points" />
                  </div>
                  <button onClick={() => removeQuestion(qIdx)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="mb-4">
                  <label className="label">Question Text</label>
                  <textarea value={q.text} onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} className="input min-h-[60px]" placeholder="Enter your question..." />
                </div>

                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div className="space-y-2">
                    <label className="label">Options</label>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        {q.type === 'single_choice' ? (
                          <input type="radio" name={`q-${q.id}`} checked={q.correctAnswer === opt && opt !== ''} onChange={() => updateQuestion(qIdx, { correctAnswer: opt })} className="w-4 h-4 text-primary-600" />
                        ) : (
                          <input type="checkbox" checked={q.correctAnswers.includes(opt) && opt !== ''} onChange={(e) => {
                            const ca = e.target.checked
                              ? [...q.correctAnswers, opt]
                              : q.correctAnswers.filter((a) => a !== opt);
                            updateQuestion(qIdx, { correctAnswers: ca });
                          }} className="w-4 h-4 rounded text-primary-600" />
                        )}
                        <input value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} className="input flex-1" placeholder={`Option ${oIdx + 1}`} />
                        <button onClick={() => removeOption(qIdx, oIdx)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <button onClick={() => addOption(qIdx)} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add Option</button>
                    <p className="text-xs text-slate-400 mt-1">
                      {q.type === 'single_choice' ? 'Select the correct answer' : 'Check all correct answers'}
                    </p>
                  </div>
                )}

                {q.type === 'text' && (
                  <div>
                    <label className="label">Keywords (for basic scoring, comma separated)</label>
                    <input value={q.keywords.join(', ')} onChange={(e) => updateQuestion(qIdx, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} className="input" placeholder="key concept, important term" />
                    <p className="text-xs text-slate-400 mt-1">If ≥50% keywords match, auto-graded as correct. Otherwise marked for manual review.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamEditPage;
