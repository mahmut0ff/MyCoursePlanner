import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiOrgGetHomeworks, apiGradeHomework, apiAIGradeHomework, apiUpdateHomeworkStatus } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { Sparkles, CheckCircle, Clock, XCircle, GripVertical, FileVideo, ImageIcon, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { DndContext, useSensor, useSensors, PointerSensor, DragOverlay, closestCorners } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

// ─── DND KANBAN COMPONENTS ───

const KanbanColumn: React.FC<{ id: string; title: string; count: number; children: React.ReactNode }> = ({ id, title, count, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[300px] md:w-auto md:flex-1 md:min-w-[320px] shrink-0 bg-slate-100/50 dark:bg-slate-800/20 border-2 rounded-2xl p-4 transition-all ${
        isOver ? 'border-accent-teal bg-accent-teal/5' : 'border-slate-200 dark:border-slate-700/50'
      }`}
    >
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">{title}</h3>
        <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold">{count}</span>
      </div>
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1 pb-4">
        {children}
      </div>
    </div>
  );
};

const KanbanCard: React.FC<{ sub: HomeworkSubmission; onClick: () => void }> = ({ sub, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sub.id,
    data: sub,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white dark:bg-slate-800 rounded-xl p-4 border transition-all ${
        isDragging ? 'opacity-50 ring-2 ring-accent-teal border-transparent shadow-2xl scale-105 z-50' : 'border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
         <div className="flex-1 min-w-0 pr-6">
            <h4 className="font-bold text-slate-900 dark:text-white truncate">{sub.studentName}</h4>
            <p className="text-xs text-slate-500 truncate" title={sub.lessonTitle}>{sub.lessonTitle}</p>
         </div>
      </div>

      {sub.attachments && sub.attachments.length > 0 && (
         <div className="flex gap-2 mb-3">
           {sub.attachments.some(a => a.type === 'video') && <span className="flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded-md"><FileVideo className="w-3 h-3"/> {sub.attachments.filter(a => a.type === 'video').length} Видео</span>}
           {sub.attachments.some(a => a.type === 'image') && <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 rounded-md"><ImageIcon className="w-3 h-3"/> {sub.attachments.filter(a => a.type === 'image').length} Фото</span>}
         </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-slate-400 font-medium">{new Date(sub.submittedAt).toLocaleDateString()}</span>
        {sub.status === 'graded' && typeof sub.finalScore === 'number' && (
           <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
             Оценка: {sub.finalScore}
           </span>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
         <div {...listeners} {...attributes} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing bg-slate-100 dark:bg-slate-700 rounded transition-colors tooltip" data-tip="Move">
           <GripVertical className="w-4 h-4" />
         </div>
         <button onClick={onClick} className="p-1 text-slate-400 hover:text-accent-teal bg-slate-100 dark:bg-slate-700 rounded transition-colors tooltip" data-tip="View Details">
           <Eye className="w-4 h-4" />
         </button>
      </div>
    </div>
  );
};

// ─── MAIN PAGE COMPONENT ───

const HomeworkReviewPage: React.FC = () => {
  const { organizationId, role, profile } = useAuth();
  const { canAccess } = usePlanGate();
  
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedSubmission, setSelectedSubmission] = useState<HomeworkSubmission | null>(null);
  const [activeDragItem, setActiveDragItem] = useState<HomeworkSubmission | null>(null);
  
  const [gradeInput, setGradeInput] = useState<number>(0);
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  
  const [isAIGrading, setIsAIGrading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 }})
  );

  const loadSubmissions = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const data = await apiOrgGetHomeworks(organizationId);
      let filteredData = data;
      
      // If user is a teacher, only show submissions for students in their assigned groups
      if (role === 'teacher' && profile?.uid) {
        const { orgGetGroups } = await import('../../lib/api');
        const groups = await orgGetGroups();
        const teacherGroups = (groups as any[]).filter(g => g.teacherIds?.includes(profile.uid));
        const studentIds = new Set<string>();
        teacherGroups.forEach(g => g.studentIds?.forEach((id: string) => studentIds.add(id)));
        
        filteredData = data.filter((sub: HomeworkSubmission) => studentIds.has(sub.studentId));
      }
      
      setSubmissions(filteredData);
    } catch (e) {
      toast.error('Failed to load homework submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [organizationId]);

  const handleDragStart = (e: DragStartEvent) => {
    const { active } = e;
    const sub = submissions.find(s => s.id === active.id);
    if (sub) setActiveDragItem(sub);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDragItem(null);
    const { active, over } = e;
    
    if (!over) return;
    
    const subId = active.id as string;
    const newStatus = over.id as 'pending' | 'reviewing' | 'graded';
    const sub = submissions.find(s => s.id === subId);
    
    if (!sub || sub.status === newStatus) return;

    // Optimistic update
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: newStatus } : s));

    try {
      // If moving to 'graded' without setting a score, we might pop up the modal, but let's just let them drop it to reviewing.
      // Or require opening modal to officially grade it. We can still save status.
      await apiUpdateHomeworkStatus(subId, newStatus);
      if (newStatus === 'graded' && typeof sub.finalScore !== 'number') {
         // Auto open modal so they can grade
         handleSelect({ ...sub, status: newStatus });
         toast('Пожалуйста, выставьте оценку', { icon: '📝' });
      } else {
         toast.success('Статус обновлён');
      }
    } catch (err: any) {
      // Revert on error
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: sub.status } : s));
      toast.error(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleSelect = (sub: HomeworkSubmission) => {
    setSelectedSubmission(sub);
    setGradeInput(sub.finalScore || 0);
    setFeedbackInput(sub.teacherFeedback || '');
  };

  const closeSidebar = () => {
    setSelectedSubmission(null);
  };

  const handleAIAssist = async () => {
    if (!selectedSubmission) return;
    setIsAIGrading(true);
    try {
      const aiData = await apiAIGradeHomework(selectedSubmission.id);
      
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

  const pendingSubs = submissions.filter(s => s.status === 'pending');
  const reviewingSubs = submissions.filter(s => s.status === 'reviewing');
  const gradedSubs = submissions.filter(s => s.status === 'graded');

  if (loading) return <div className="h-full flex flex-col items-center justify-center p-12"><div className="w-10 h-10 border-4 border-accent-teal border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-slate-500 font-medium">Загрузка доски...</p></div>;

  return (
    <div className="relative flex flex-col h-[calc(100vh-80px)] max-w-[1600px] mx-auto overflow-hidden">
      
      <div className="flex items-center justify-between mb-6 px-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Доска проверки работ</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Организуйте проверку в формате Kanban. Перетаскивайте карточки для изменения статуса.</p>
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 overflow-x-auto custom-scrollbar px-6 pb-6">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-6 h-full items-stretch min-w-max md:min-w-0 md:w-full">
            
            <KanbanColumn id="pending" title="Ожидает проверки" count={pendingSubs.length}>
              {pendingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} />)}
              {pendingSubs.length === 0 && <div className="text-center p-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Нет новых работ</div>}
            </KanbanColumn>
            
            <KanbanColumn id="reviewing" title="На проверке" count={reviewingSubs.length}>
               {reviewingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} />)}
               {reviewingSubs.length === 0 && <div className="text-center p-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Перетащите работы сюда</div>}
            </KanbanColumn>

            <KanbanColumn id="graded" title="Оценено" count={gradedSubs.length}>
               {gradedSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} />)}
               {gradedSubs.length === 0 && <div className="text-center p-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Оценённые работы</div>}
            </KanbanColumn>

          </div>

          <DragOverlay>
            {activeDragItem ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-2xl opacity-90 scale-105 border-2 border-accent-teal ring-4 ring-accent-teal/20 w-[300px]">
                 <h4 className="font-bold text-slate-900 dark:text-white truncate">{activeDragItem.studentName}</h4>
                 <p className="text-xs text-slate-500 truncate">{activeDragItem.lessonTitle}</p>
                 <span className="text-[10px] text-slate-400 font-medium mt-2 inline-block">{new Date(activeDragItem.submittedAt).toLocaleDateString()}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Grading Sidebar/Drawer (Slide From Right) */}
      <div className={`absolute top-0 right-0 w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] dark:shadow-[-20px_0_40px_rgba(0,0,0,0.5)] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 flex flex-col ${selectedSubmission ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedSubmission && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
               <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedSubmission.studentName}</h3>
                  <p className="text-slate-500">{selectedSubmission.lessonTitle}</p>
               </div>
               <div className="flex items-center gap-3">
                 {canAccess('ai') && (
                    <button 
                      onClick={handleAIAssist}
                      disabled={isAIGrading}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white rounded-lg font-medium transition-all disabled:opacity-70 disabled:grayscale"
                    >
                      {isAIGrading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isAIGrading ? 'AI Думает...' : 'AI Оценка'}
                    </button>
                 )}
                 <button onClick={closeSidebar} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                 </button>
               </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              {/* Info Bar */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-slate-400" /> Сдано: {new Date(selectedSubmission.submittedAt).toLocaleString()}
                </div>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 hidden sm:block"></div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
                  Статус: <span className={`px-2 py-0.5 rounded-full text-xs uppercase tracking-wider text-white ${selectedSubmission.status === 'graded' ? 'bg-emerald-500' : selectedSubmission.status === 'reviewing' ? 'bg-amber-500' : 'bg-slate-500'}`}>{selectedSubmission.status === 'graded' ? 'Оценено' : selectedSubmission.status === 'reviewing' ? 'Проверяется' : 'Ожидает'}</span>
                </div>
              </div>

              {/* Text submission */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Текстовый ответ</h4>
                <div className="p-5 bg-white dark:bg-slate-900 rounded-xl text-slate-800 dark:text-slate-300 text-[15px] whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-800 shadow-sm">
                  {selectedSubmission.content || <span className="text-slate-400 italic">Студент не оставил текстового ответа</span>}
                </div>
              </div>

              {/* Attachments */}
              {selectedSubmission.attachments && selectedSubmission.attachments.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">Вложения <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 rounded-full text-xs">{selectedSubmission.attachments.length}</span></h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     {selectedSubmission.attachments.map((att, i) => (
                       <a key={i} href={att.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 relative hover:border-accent-teal hover:ring-2 hover:ring-accent-teal/20 transition-all">
                          {att.type === 'video' ? (
                            <div className="aspect-video bg-black relative flex items-center justify-center">
                              <video src={att.url} className="w-full h-full object-cover opacity-80" controls />
                              {!att.url.endsWith('mp4') && <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-4 text-center pointer-events-none group-hover:opacity-0 transition-opacity"><FileVideo className="w-8 h-8 mb-2"/><span className="text-xs font-bold">{att.name}</span></div>}
                            </div>
                          ) : (
                            <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative">
                               <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3"><p className="text-white text-xs font-medium truncate">{att.name}</p></div>
                            </div>
                          )}
                       </a>
                     ))}
                  </div>
                </div>
              )}

              {/* AI Analysis Block */}
              {selectedSubmission.aiAnalysis && (
                <div className={`p-6 rounded-2xl border bg-white dark:bg-slate-900 ${selectedSubmission.aiAnalysis.isPlagiarism ? 'border-red-300 dark:border-red-900/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'border-indigo-200 dark:border-indigo-900/50 shadow-[0_0_20px_rgba(99,102,241,0.05)]'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className={`w-6 h-6 ${selectedSubmission.aiAnalysis.isPlagiarism ? 'text-red-500' : 'text-indigo-500'}`} />
                    <h4 className="text-lg font-bold text-slate-800 dark:text-white">Отчёт Нейросети</h4>
                  </div>
                  
                  {selectedSubmission.aiAnalysis.isPlagiarism ? (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-800 dark:text-red-300 rounded-xl flex items-start gap-3">
                       <XCircle className="w-6 h-6 shrink-0 text-red-500" />
                       <div>
                         <p className="font-bold text-[15px]">Высокая вероятность плагиата / ИИ ({selectedSubmission.aiAnalysis.plagiarismProbability}%)</p>
                         <p className="text-sm mt-1">Текст выглядит неестественно или скопирован из внешних источников.</p>
                       </div>
                    </div>
                  ) : (
                    <div className="mb-4 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400 text-sm rounded-lg inline-block font-bold items-center gap-2 flex w-max">
                      <CheckCircle className="w-4 h-4" />Оригинальный текст
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Рекомендуемый балл</p>
                      <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{selectedSubmission.aiAnalysis.grade} <span className="text-lg text-slate-400 font-medium">/ {selectedSubmission.maxPoints || 10}</span></p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Анализ решения</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{selectedSubmission.aiAnalysis.suggestions}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Grading Footer form */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex flex-col gap-5">
                <div className="flex gap-4 items-end">
                  <div className="w-32 shrink-0">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Балл (из {selectedSubmission.maxPoints || 10})</label>
                    <input 
                      type="number" 
                      min={0}
                      max={selectedSubmission.maxPoints || 10}
                      value={gradeInput}
                      onChange={e => setGradeInput(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-accent-teal focus:ring-4 focus:ring-accent-teal/10 rounded-xl text-lg font-bold text-slate-900 dark:text-white transition-all outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Отзыв для студента</label>
                    <input 
                      type="text" 
                      value={feedbackInput}
                      onChange={e => setFeedbackInput(e.target.value)}
                      placeholder="Например: Отличная работа, так держать!"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-accent-teal focus:ring-4 focus:ring-accent-teal/10 rounded-xl text-sm font-medium text-slate-900 dark:text-white transition-all outline-none placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveGrade}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-accent-teal text-white rounded-xl font-bold shadow-[0_0_20px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] transition-all disabled:opacity-50 disabled:grayscale hover:-translate-y-0.5 text-lg"
                >
                  {isSaving ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сохранение...</> : <>Одобрить оценку и завершить <CheckCircle className="w-6 h-6" /></>}
                </button>
              </div>
            </div>
            
          </>
        )}
      </div>
      
      {/* Overlay for sidebar */}
      {selectedSubmission && (
         <div onClick={closeSidebar} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 animate-in fade-in transition-all"></div>
      )}

    </div>
  );
};

export default HomeworkReviewPage;
