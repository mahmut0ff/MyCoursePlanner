import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiOrgGetHomeworks, apiGradeHomework, apiAIGradeHomework, apiUpdateHomeworkStatus } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { Sparkles, CheckCircle, Clock, XCircle, GripVertical, FileVideo, ImageIcon, X, FileAudio, FileArchive, FileText, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { DndContext, useSensor, useSensors, PointerSensor, DragOverlay, closestCorners } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

// ─── DND KANBAN COMPONENTS ───

const KanbanColumn: React.FC<{ id: string; title: string; count: number; color: string; children: React.ReactNode }> = ({ id, title, count, color, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-0 bg-slate-50/80 dark:bg-slate-800/30 border rounded-2xl transition-all ${
        isOver ? `border-2 ${color} bg-opacity-10` : 'border-slate-200/80 dark:border-slate-700/40'
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/40">
        <div className={`w-2.5 h-2.5 rounded-full ${color.replace('border-', 'bg-')}`} />
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-[13px] tracking-wide">{title}</h3>
        <span className="ml-auto bg-slate-200/80 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-bold">{count}</span>
      </div>
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto custom-scrollbar p-3 pb-4">
        {children}
      </div>
    </div>
  );
};

const KanbanCard: React.FC<{ sub: HomeworkSubmission; onClick: () => void; isActive: boolean }> = ({ sub, onClick, isActive }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sub.id,
    data: sub,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`group relative bg-white dark:bg-slate-800 rounded-xl p-3.5 border cursor-pointer transition-all duration-200 ${
        isDragging
          ? 'opacity-50 ring-2 ring-accent-teal border-transparent shadow-2xl scale-105 z-50'
          : isActive
            ? 'border-accent-teal ring-2 ring-accent-teal/20 shadow-md bg-accent-teal/[0.03] dark:bg-accent-teal/5'
            : 'border-slate-200/80 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
         <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{sub.studentName}</h4>
            <p className="text-[11px] text-slate-500 truncate mt-0.5" title={sub.lessonTitle}>{sub.lessonTitle}</p>
         </div>
         <div {...listeners} {...attributes} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
           <GripVertical className="w-3.5 h-3.5" />
         </div>
      </div>

      {sub.attachments && sub.attachments.length > 0 && (
         <div className="flex gap-1.5 mb-2 mt-2">
           {sub.attachments.some(a => a.type === 'video') && <span className="flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded-md"><FileVideo className="w-2.5 h-2.5"/> {sub.attachments.filter(a => a.type === 'video').length}</span>}
           {sub.attachments.some(a => a.type === 'image') && <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 rounded-md"><ImageIcon className="w-2.5 h-2.5"/> {sub.attachments.filter(a => a.type === 'image').length}</span>}
         </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/40">
        <span className="text-[10px] text-slate-400 font-medium">{new Date(sub.submittedAt).toLocaleDateString()}</span>
        {sub.status === 'graded' && typeof sub.finalScore === 'number' && (
           <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-lg">
             {sub.finalScore}/{sub.maxPoints || 10}
           </span>
        )}
      </div>
    </div>
  );
};

// ─── STATUS BADGE ───

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    graded: { label: 'Оценено', cls: 'bg-emerald-500' },
    reviewing: { label: 'Проверяется', cls: 'bg-amber-500' },
    pending: { label: 'Ожидает', cls: 'bg-slate-400' },
  }[status] || { label: status, cls: 'bg-slate-400' };

  return <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest text-white font-bold ${config.cls}`}>{config.label}</span>;
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
      await apiUpdateHomeworkStatus(subId, newStatus);
      if (newStatus === 'graded' && typeof sub.finalScore !== 'number') {
         // Auto open detail panel so they can grade
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

  const closeDetail = () => {
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
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-[1800px] mx-auto">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Доска проверки работ</h1>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] mt-0.5">Перетаскивайте карточки для изменения статуса</p>
        </div>
      </div>

      {/* Main Content — Kanban + Detail Panel side by side */}
      <div className="flex-1 flex gap-0 overflow-hidden min-h-0">
        
        {/* Kanban Board */}
        <div className={`flex-1 min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar px-6 pb-4 transition-all duration-300 ${selectedSubmission ? 'hidden lg:block lg:max-w-[55%] xl:max-w-[60%]' : ''}`}>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full items-stretch min-w-max lg:min-w-0 lg:w-full">
              
              <KanbanColumn id="pending" title="Ожидает проверки" count={pendingSubs.length} color="border-slate-400">
                {pendingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                {pendingSubs.length === 0 && <div className="text-center py-8 text-slate-400 text-[12px] border border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Нет новых работ</div>}
              </KanbanColumn>
              
              <KanbanColumn id="reviewing" title="На проверке" count={reviewingSubs.length} color="border-amber-400">
                 {reviewingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                 {reviewingSubs.length === 0 && <div className="text-center py-8 text-slate-400 text-[12px] border border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Перетащите сюда</div>}
              </KanbanColumn>

              <KanbanColumn id="graded" title="Оценено" count={gradedSubs.length} color="border-emerald-400">
                 {gradedSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                 {gradedSubs.length === 0 && <div className="text-center py-8 text-slate-400 text-[12px] border border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl">Оценённые работы</div>}
              </KanbanColumn>

            </div>

            <DragOverlay>
              {activeDragItem ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-3.5 shadow-2xl opacity-90 scale-105 border-2 border-accent-teal ring-4 ring-accent-teal/20 w-[280px]">
                   <h4 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{activeDragItem.studentName}</h4>
                   <p className="text-[11px] text-slate-500 truncate">{activeDragItem.lessonTitle}</p>
                   <span className="text-[10px] text-slate-400 font-medium mt-2 inline-block">{new Date(activeDragItem.submittedAt).toLocaleDateString()}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Detail Panel — Inline, no modal */}
        {selectedSubmission && (
          <div className="w-full lg:w-[45%] xl:w-[40%] lg:max-w-[560px] shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right-4 duration-300">
            
            {/* Detail Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
               <button onClick={closeDetail} className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Назад">
                  <ArrowLeft className="w-5 h-5" />
               </button>
               <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{selectedSubmission.studentName}</h3>
                  <p className="text-[13px] text-slate-500 truncate">{selectedSubmission.lessonTitle}</p>
               </div>
               <div className="flex items-center gap-2 shrink-0">
                 {canAccess('ai') && (
                    <button 
                      onClick={handleAIAssist}
                      disabled={isAIGrading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white rounded-lg text-[12px] font-semibold transition-all disabled:opacity-70 disabled:grayscale"
                    >
                      {isAIGrading ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {isAIGrading ? 'Думает...' : 'AI Оценка'}
                    </button>
                 )}
                 <button onClick={closeDetail} className="hidden lg:flex p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                 </button>
               </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-5 space-y-5">
              
                {/* Info Bar */}
                <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> {new Date(selectedSubmission.submittedAt).toLocaleString()}
                  </div>
                  <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
                  <StatusBadge status={selectedSubmission.status} />
                </div>

                {/* Text submission */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Текстовый ответ</h4>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-800 dark:text-slate-300 text-[14px] whitespace-pre-wrap leading-relaxed border border-slate-100 dark:border-slate-800">
                    {selectedSubmission.content || <span className="text-slate-400 italic text-[13px]">Студент не оставил текстового ответа</span>}
                  </div>
                </div>

                {/* Attachments */}
                {selectedSubmission.attachments && selectedSubmission.attachments.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                      Вложения <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 w-5 h-5 flex items-center justify-center rounded-md text-[10px] font-bold">{selectedSubmission.attachments.length}</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                       {selectedSubmission.attachments.map((att, i) => (
                         <a key={i} href={att.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 relative hover:border-accent-teal hover:ring-2 hover:ring-accent-teal/20 transition-all">
                            {att.type === 'video' ? (
                              <div className="aspect-video bg-black relative flex items-center justify-center">
                                <video src={att.url} className="w-full h-full object-cover opacity-80" controls />
                                {!att.url.endsWith('mp4') && <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-4 text-center pointer-events-none group-hover:opacity-0 transition-opacity"><FileVideo className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">{att.name}</span></div>}
                              </div>
                            ) : att.type === 'audio' ? (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative flex flex-col items-center justify-center p-3">
                                 <FileAudio className="w-8 h-8 text-amber-500 mb-2" />
                                 <audio src={att.url} controls className="w-full h-8 z-10 relative" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none"><p className="text-white text-[10px] font-medium truncate w-full text-center">{att.name}</p></div>
                              </div>
                            ) : att.type === 'archive' || att.type === 'document' ? (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative flex flex-col items-center justify-center p-3 text-center group-hover:bg-slate-200 dark:group-hover:bg-slate-800 transition-colors">
                                {att.type === 'archive' ? <FileArchive className="w-8 h-8 text-red-500 mb-2" /> : <FileText className="w-8 h-8 text-blue-500 mb-2" />}
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 break-all line-clamp-2">{att.name}</p>
                                <span className="mt-1 px-2 py-0.5 bg-white dark:bg-slate-800 rounded-full text-[9px] font-bold text-accent-teal uppercase tracking-wider shadow-sm">Скачать</span>
                              </div>
                            ) : (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative">
                                 <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"><p className="text-white text-[10px] font-medium truncate">{att.name}</p></div>
                              </div>
                            )}
                         </a>
                       ))}
                    </div>
                  </div>
                )}

                {/* AI Analysis Block */}
                {selectedSubmission.aiAnalysis && (
                  <div className={`p-5 rounded-xl border ${selectedSubmission.aiAnalysis.isPlagiarism ? 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/5' : 'border-indigo-200/80 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-900/5'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className={`w-5 h-5 ${selectedSubmission.aiAnalysis.isPlagiarism ? 'text-red-500' : 'text-indigo-500'}`} />
                      <h4 className="text-[14px] font-bold text-slate-800 dark:text-white">Отчёт Нейросети</h4>
                    </div>
                    
                    {selectedSubmission.aiAnalysis.isPlagiarism ? (
                      <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-800 dark:text-red-300 rounded-xl flex items-start gap-2.5">
                         <XCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                         <div>
                           <p className="font-bold text-[13px]">Высокая вероятность плагиата / ИИ ({selectedSubmission.aiAnalysis.plagiarismProbability}%)</p>
                           <p className="text-[12px] mt-0.5 opacity-80">Текст выглядит неестественно или скопирован.</p>
                         </div>
                      </div>
                    ) : (
                      <div className="mb-3 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400 text-[12px] rounded-lg inline-flex font-bold items-center gap-1.5 w-max">
                        <CheckCircle className="w-3.5 h-3.5" />Оригинальный текст
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div className="bg-white/60 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Рекомендуемый балл</p>
                        <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{selectedSubmission.aiAnalysis.grade} <span className="text-sm text-slate-400 font-medium">/ {selectedSubmission.maxPoints || 10}</span></p>
                      </div>
                      <div className="bg-white/60 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Анализ решения</p>
                        <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">{selectedSubmission.aiAnalysis.suggestions}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Grading Footer */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex gap-3 items-end mb-3">
                <div className="w-28 shrink-0">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Балл (из {selectedSubmission.maxPoints || 10})</label>
                  <input 
                    type="number" 
                    min={0}
                    max={selectedSubmission.maxPoints || 10}
                    value={gradeInput}
                    onChange={e => setGradeInput(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-accent-teal focus:ring-2 focus:ring-accent-teal/10 rounded-xl text-lg font-bold text-slate-900 dark:text-white transition-all outline-none"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Отзыв</label>
                  <input 
                    type="text" 
                    value={feedbackInput}
                    onChange={e => setFeedbackInput(e.target.value)}
                    placeholder="Отличная работа, так держать!"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-accent-teal focus:ring-2 focus:ring-accent-teal/10 rounded-xl text-[13px] font-medium text-slate-900 dark:text-white transition-all outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveGrade}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-accent-teal text-white rounded-xl font-bold shadow-[0_0_20px_rgba(45,212,191,0.2)] hover:shadow-[0_0_30px_rgba(45,212,191,0.4)] transition-all disabled:opacity-50 disabled:grayscale hover:-translate-y-0.5"
              >
                {isSaving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сохранение...</> : <>Сохранить оценку <CheckCircle className="w-5 h-5" /></>}
              </button>
            </div>
            
          </div>
        )}
      </div>

    </div>
  );
};

export default HomeworkReviewPage;
