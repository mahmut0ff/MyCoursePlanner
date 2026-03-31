import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiOrgGetHomeworks, apiGradeHomework, apiAIGradeHomework } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { ClipboardCheck, Sparkles, CheckCircle, Clock, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const HomeworkReviewPage: React.FC = () => {
  const { organizationId } = useAuth();
  const { canAccess } = usePlanGate();
  
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedSubmission, setSelectedSubmission] = useState<HomeworkSubmission | null>(null);
  
  const [gradeInput, setGradeInput] = useState<number>(0);
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  
  const [isAIGrading, setIsAIGrading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadSubmissions = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const data = await apiOrgGetHomeworks(organizationId);
      setSubmissions(data);
    } catch (e) {
      toast.error('Failed to load homework submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [organizationId]);

  const handleSelect = (sub: HomeworkSubmission) => {
    setSelectedSubmission(sub);
    setGradeInput(sub.finalScore || 0);
    setFeedbackInput(sub.teacherFeedback || '');
  };

  const handleAIAssist = async () => {
    if (!selectedSubmission) return;
    setIsAIGrading(true);
    try {
      const aiData = await apiAIGradeHomework(selectedSubmission.id);
      
      // Update local state smoothly
      const updatedSub = { ...selectedSubmission, aiAnalysis: aiData };
      setSelectedSubmission(updatedSub);
      setSubmissions(prev => prev.map(p => p.id === updatedSub.id ? updatedSub : p));
      
      setGradeInput(aiData.grade);
      setFeedbackInput(aiData.suggestions);
      
      toast.success('ИИ-проверка завершена!', { icon: '🤖' });
    } catch (e: any) {
      toast.error(e.message || 'Ошибка нейросети');
    } finally {
      setIsAIGrading(false);
    }
  };

  const handleSaveGrade = async () => {
    if (!selectedSubmission) return;
    setIsSaving(true);
    try {
      await apiGradeHomework(selectedSubmission.id, {
        finalScore: gradeInput,
        feedback: feedbackInput
      });
      toast.success('Оценка сохранена');
      const updatedSub = { ...selectedSubmission, finalScore: gradeInput, teacherFeedback: feedbackInput, status: 'graded' as const };
      setSelectedSubmission(updatedSub);
      setSubmissions(prev => prev.map(p => p.id === updatedSub.id ? updatedSub : p));
    } catch (e: any) {
      toast.error(e.message || 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col md:flex-row gap-6">
      
      {/* Left sidebar: List of submissions */}
      <div className="w-full md:w-1/3 flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-500" />
            Проверка ДЗ
          </h2>
          <p className="text-xs text-slate-500 mt-1">Ожидают проверки: {submissions.filter(s => s.status === 'pending').length}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {submissions.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Нет сдач</div>}
          {submissions.map(sub => (
            <button
              key={sub.id}
              onClick={() => handleSelect(sub)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${selectedSubmission?.id === sub.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-700/50 ring-1 ring-indigo-500' : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-sm text-slate-900 dark:text-white truncate pr-2">{sub.studentName}</span>
                {sub.status === 'pending' ? <span className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3"/> check</span> : <span className="bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> ok</span>}
              </div>
              <p className="text-xs text-slate-500 truncate mb-1" title={sub.lessonTitle}>{sub.lessonTitle}</p>
              <span className="text-[10px] text-slate-400">{new Date(sub.submittedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right area: Details & Grading */}
      <div className="w-full md:w-2/3 flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm relative">
        {!selectedSubmission ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <ClipboardCheck className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium text-slate-500">Выберите работу для проверки</p>
            <p className="text-sm mt-2">Вы можете поручить проверку автогрейдеру с ИИ.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Header info */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedSubmission.studentName}</h3>
                  <p className="text-sm text-slate-500">{selectedSubmission.lessonTitle}</p>
                </div>
                {selectedSubmission.status === 'pending' && canAccess('ai') && (
                  <button 
                    onClick={handleAIAssist}
                    disabled={isAIGrading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white rounded-lg font-medium shadow-md transition-all disabled:opacity-70 disabled:grayscale"
                  >
                    {isAIGrading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAIGrading ? 'Нейросеть читает...' : 'Проверить с AI'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
              {/* Submission Content */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Ответ студента ({new Date(selectedSubmission.submittedAt).toLocaleString()})</h4>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed border border-slate-100 dark:border-slate-800">
                  {selectedSubmission.content}
                </div>
              </div>

              {/* AI Analysis Block */}
              {selectedSubmission.aiAnalysis && (
                <div className={`p-4 rounded-xl border ${selectedSubmission.aiAnalysis.isPlagiarism ? 'bg-red-50 border-red-200 dark:bg-red-900/10' : 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/10'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className={`w-5 h-5 ${selectedSubmission.aiAnalysis.isPlagiarism ? 'text-red-500' : 'text-indigo-500'}`} />
                    <h4 className="font-bold text-slate-800 dark:text-white">AI Анализ</h4>
                  </div>
                  
                  {selectedSubmission.aiAnalysis.isPlagiarism ? (
                    <div className="mb-3 p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm rounded-lg flex items-start gap-2">
                       <XCircle className="w-5 h-5 shrink-0" />
                       <div>
                         <p className="font-bold">Высокая вероятность плагиата / ИИ-генерации ({selectedSubmission.aiAnalysis.plagiarismProbability}%)</p>
                         <p className="text-xs mt-1">Ответ выглядит неестественно или скопирован из источников.</p>
                       </div>
                    </div>
                  ) : (
                    <div className="mb-3 p-2 bg-emerald-100 text-emerald-800 text-xs rounded-lg inline-block font-medium">Плагиат не обнаружен ({selectedSubmission.aiAnalysis.plagiarismProbability}%)</div>
                  )}

                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Рекомендуемый балл:</strong> {selectedSubmission.aiAnalysis.grade} / {selectedSubmission.maxPoints || 10} <br/>
                    <strong>Аргументация нейросети:</strong> {selectedSubmission.aiAnalysis.suggestions}
                  </div>
                </div>
              )}
            </div>

            {/* Grading Footer form */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="w-32">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Балл (из {selectedSubmission.maxPoints || 10})</label>
                    <input 
                      type="number" 
                      min={0}
                      max={selectedSubmission.maxPoints || 10}
                      value={gradeInput}
                      onChange={e => setGradeInput(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Финальный комментарий для студента</label>
                    <input 
                      type="text" 
                      value={feedbackInput}
                      onChange={e => setFeedbackInput(e.target.value)}
                      placeholder="Например: Отличная работа, но обрати внимание на орфографию..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleSaveGrade}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold shadow-md hover:bg-slate-800 dark:hover:bg-slate-100 transition-all disabled:opacity-70"
                  >
                    {isSaving ? 'Сохранение...' : 'Одобрить балл'} <CheckCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        )}
      </div>

    </div>
  );
};

export default HomeworkReviewPage;
