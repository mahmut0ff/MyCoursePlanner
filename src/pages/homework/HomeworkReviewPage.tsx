import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiOrgGetHomeworks, apiGradeHomework, apiAIGradeHomework, apiUpdateHomeworkStatus } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { Sparkles, CheckCircle, Clock, XCircle, GripVertical, FileVideo, ImageIcon, X, FileAudio, FileArchive, FileText, ArrowLeft, Search, Filter, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { numericDateLocale } from '../../lib/locale';
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
      className={`flex flex-col flex-1 min-w-0 bg-slate-50 dark:bg-slate-800/30 border rounded-lg transition-colors ${
        isOver ? `${color}` : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 h-10 px-3 border-b border-slate-200 dark:border-slate-700">
        <div className={`w-1.5 h-1.5 rounded-full ${color.replace('border-', 'bg-')}`} />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{title}</h3>
        <span className="ml-auto inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-200/70 text-slate-700 dark:bg-slate-700 dark:text-slate-300">{count}</span>
      </div>
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar p-2 pb-3">
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
      className={`group relative bg-white dark:bg-slate-800 rounded-md p-3 border cursor-pointer transition-colors ${
        isDragging
          ? 'opacity-50 ring-2 ring-primary-500 border-transparent shadow-pop z-50'
          : isActive
            ? 'border-primary-500 ring-2 ring-primary-500/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
         <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{sub.studentName}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5" title={sub.lessonTitle}>{sub.lessonTitle}</p>
            {sub.groupName && <span className="inline-flex items-center mt-1 h-5 px-1.5 rounded text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 truncate max-w-full">{sub.groupName}</span>}
         </div>
         <div {...listeners} {...attributes} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
           <GripVertical className="w-3.5 h-3.5" />
         </div>
      </div>

      {sub.attachments && sub.attachments.length > 0 && (
         <div className="flex gap-1.5 mb-2 mt-2">
           {sub.attachments.some(a => a.type === 'video') && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"><FileVideo className="w-2.5 h-2.5"/> {sub.attachments.filter(a => a.type === 'video').length}</span>}
           {sub.attachments.some(a => a.type === 'image') && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"><ImageIcon className="w-2.5 h-2.5"/> {sub.attachments.filter(a => a.type === 'image').length}</span>}
         </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-400 tabular-nums">{new Date(sub.submittedAt).toLocaleDateString(numericDateLocale())}</span>
        {sub.status === 'graded' && typeof sub.finalScore === 'number' && (
           <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
             {sub.finalScore}/{sub.maxPoints || 10}
           </span>
        )}
      </div>
    </div>
  );
};

// ─── STATUS BADGE ───

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();
  const config = {
    graded: { label: t('lessons.view.statusGraded', 'Оценено'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    reviewing: { label: t('homework.review.statusReviewing', 'Проверяется'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    pending: { label: t('homework.panel.pending', 'Ожидает'), cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  }[status] || { label: status, cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };

  return <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${config.cls}`}>{config.label}</span>;
};

// ─── MAIN PAGE COMPONENT ───

const HomeworkReviewPage: React.FC = () => {
  const { t } = useTranslation();
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
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');

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
      toast.error(t('homework.panel.loadFailed', 'Не удалось загрузить списки работ'));
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
         toast(t('homework.review.setGradeFirst', 'Пожалуйста, выставьте оценку'), { icon: '📝' });
      } else {
         toast.success(t('homework.review.statusUpdated', 'Статус обновлён'));
      }
    } catch (err: any) {
      // Revert on error
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: sub.status } : s));
      toast.error(err.message || t('homework.review.statusFailed', 'Ошибка обновления статуса'));
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
      
      toast.success(t('homework.review.aiDone', 'ИИ-проверка завершена!'), { icon: '🤖' });
    } catch (e: any) {
      toast.error(e.message || t('homework.review.aiFailed', 'Ошибка нейросети'));
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
      toast.success(t('homework.review.gradeSaved', 'Оценка сохранена'));
      const updatedSub = { ...selectedSubmission, finalScore: gradeInput, teacherFeedback: feedbackInput, status: 'graded' as const };
      setSelectedSubmission(updatedSub);
      setSubmissions(prev => prev.map(p => p.id === updatedSub.id ? updatedSub : p));
    } catch (e: any) {
      toast.error(e.message || t('homework.review.saveFailed', 'Ошибка сохранения'));
    } finally {
      setIsSaving(false);
    }
  };

  const groups = useMemo(() => {
    const g = new Map<string, string>();
    submissions.forEach(s => { if (s.groupId && s.groupName) g.set(s.groupId, s.groupName); });
    return Array.from(g.entries());
  }, [submissions]);

  const filtered = useMemo(() => {
    let list = submissions;
    if (groupFilter !== 'all') list = list.filter(s => s.groupId === groupFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.studentName.toLowerCase().includes(q) || s.lessonTitle.toLowerCase().includes(q));
    }
    return list;
  }, [submissions, groupFilter, searchQuery]);

  const pendingSubs = filtered.filter(s => s.status === 'pending');
  const reviewingSubs = filtered.filter(s => s.status === 'reviewing');
  const gradedSubs = filtered.filter(s => s.status === 'graded');
  const avgScore = gradedSubs.length ? Math.round(gradedSubs.reduce((a, s) => a + (s.finalScore || 0), 0) / gradedSubs.length * 10) / 10 : 0;

  if (loading) return <div className="h-full flex flex-col items-center justify-center p-12"><div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div><p className="mt-3 text-sm text-slate-500">{t('homework.review.loading', 'Загрузка доски...')}</p></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      
      {/* Header */}
      <div className="pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('homework.review.title', 'Доска проверки работ')}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs">{t('homework.review.subtitle', 'Перетаскивайте карточки для изменения статуса')}</p>
            {/* ДЗ сдаётся только в Telegram-боте — без этой строки пустая доска не объясняет, откуда возьмутся работы. */}
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">{t('homework.review.telegramHint', 'Ученики сдают работы в Telegram-боте — они появятся здесь сами.')}</p>
          </div>
        </div>

        {/* Stats + Filters Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Stats pills */}
          <div className="flex items-center gap-1.5 mr-auto">
            <div className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title={t('lessons.view.statusPending', 'Ожидает проверки')}>
              <Clock className="w-3 h-3" /> {pendingSubs.length}
            </div>
            <div className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium tabular-nums bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title={t('lessons.view.statusReviewing', 'На проверке')}>
              <BarChart3 className="w-3 h-3" /> {reviewingSubs.length}
            </div>
            <div className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium tabular-nums bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" title={t('lessons.view.statusGraded', 'Оценено')}>
              <CheckCircle className="w-3 h-3" /> {gradedSubs.length}
            </div>
            {avgScore > 0 && <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums ml-1">Ø {avgScore}</span>}
          </div>

          {/* Group filter */}
          {groups.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="input w-auto pl-8 pr-3 appearance-none cursor-pointer">
                <option value="all">{t('rating.allGroups', 'Все группы')}</option>
                {groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t('homework.review.searchPh', 'Поиск...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 pr-3 w-44"
            />
          </div>
        </div>
      </div>

      {/* Main Content — Kanban + Detail Panel side by side */}
      <div className="flex-1 flex gap-3 overflow-hidden min-h-0">
        
        {/* Kanban Board */}
        <div className={`flex-1 min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar pb-3 transition-all duration-300 ${selectedSubmission ? 'hidden lg:block lg:max-w-[55%] xl:max-w-[60%]' : ''}`}>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 h-full items-stretch min-w-max lg:min-w-0 lg:w-full">
              
              <KanbanColumn id="pending" title={t('lessons.view.statusPending', 'Ожидает проверки')} count={pendingSubs.length} color="border-slate-400">
                {pendingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                {pendingSubs.length === 0 && <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-md"><Clock className="w-6 h-6 mx-auto mb-2 text-slate-400" /><p className="text-xs text-slate-500">{t('homework.review.noNew', 'Нет новых работ')}</p></div>}
              </KanbanColumn>
              
              <KanbanColumn id="reviewing" title={t('lessons.view.statusReviewing', 'На проверке')} count={reviewingSubs.length} color="border-amber-400">
                 {reviewingSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                 {reviewingSubs.length === 0 && <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-md"><BarChart3 className="w-6 h-6 mx-auto mb-2 text-slate-400" /><p className="text-xs text-slate-500">{t('homework.review.dropHere', 'Перетащите сюда')}</p></div>}
              </KanbanColumn>

              <KanbanColumn id="graded" title={t('lessons.view.statusGraded', 'Оценено')} count={gradedSubs.length} color="border-emerald-400">
                 {gradedSubs.map(s => <KanbanCard key={s.id} sub={s} onClick={() => handleSelect(s)} isActive={selectedSubmission?.id === s.id} />)}
                 {gradedSubs.length === 0 && <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-md"><CheckCircle className="w-6 h-6 mx-auto mb-2 text-slate-400" /><p className="text-xs text-slate-500">{t('homework.review.gradedWorks', 'Оценённые работы')}</p></div>}
              </KanbanColumn>

            </div>

            <DragOverlay>
              {activeDragItem ? (
                <div className="bg-white dark:bg-slate-800 rounded-md p-3 shadow-pop border border-primary-500 ring-2 ring-primary-500/20 w-[280px]">
                   <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{activeDragItem.studentName}</h4>
                   <p className="text-xs text-slate-500 truncate">{activeDragItem.lessonTitle}</p>
                   <span className="text-xs text-slate-400 tabular-nums mt-2 inline-block">{new Date(activeDragItem.submittedAt).toLocaleDateString(numericDateLocale())}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Detail Panel — Inline, no modal */}
        {selectedSubmission && (
          <div className="w-full lg:w-[45%] xl:w-[40%] lg:max-w-[560px] shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden animate-in slide-in-from-right-4 duration-300">
            
            {/* Detail Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
               <button onClick={closeDetail} className="lg:hidden w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors" title={t('common.back', 'Назад')}>
                  <ArrowLeft className="w-3.5 h-3.5" />
               </button>
               <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedSubmission.studentName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedSubmission.lessonTitle}</p>
               </div>
               <div className="flex items-center gap-2 shrink-0">
                 {canAccess('ai') && (
                    <button 
                      onClick={handleAIAssist}
                      disabled={isAIGrading}
                      className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-70"
                    >
                      {isAIGrading ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {isAIGrading ? t('homework.review.thinking', 'Думает...') : t('homework.review.aiGrade', 'AI Оценка')}
                    </button>
                 )}
                 <button onClick={closeDetail} className="hidden lg:flex w-7 h-7 items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
                    <X className="w-3.5 h-3.5" />
                 </button>
               </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-4 space-y-4">
              
                {/* Info Bar */}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> {new Date(selectedSubmission.submittedAt).toLocaleString(numericDateLocale())}
                  </div>
                  <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
                  <StatusBadge status={selectedSubmission.status} />
                </div>

                {/* Text submission */}
                <div>
                  <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('homework.review.textAnswer', 'Текстовый ответ')}</h4>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-md text-slate-800 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-700">
                    {selectedSubmission.content || <span className="text-slate-400 text-sm">{t('homework.review.noText', 'Студент не оставил текстового ответа')}</span>}
                  </div>
                </div>

                {/* Attachments */}
                {selectedSubmission.attachments && selectedSubmission.attachments.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2">
                      {t('lessons.attachments', 'Вложения')} <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{selectedSubmission.attachments.length}</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                       {selectedSubmission.attachments.map((att, i) => (
                         <a key={i} href={att.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 relative hover:border-slate-400 dark:hover:border-slate-500 transition-colors">
                            {att.type === 'video' ? (
                              <div className="aspect-video bg-black relative flex items-center justify-center">
                                <video src={att.url} className="w-full h-full object-cover opacity-80" controls />
                                {!att.url.endsWith('mp4') && <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-4 text-center pointer-events-none group-hover:opacity-0 transition-opacity"><FileVideo className="w-6 h-6 mb-1"/><span className="text-[11px] font-semibold">{att.name}</span></div>}
                              </div>
                            ) : att.type === 'audio' ? (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative flex flex-col items-center justify-center p-3">
                                 <FileAudio className="w-8 h-8 text-amber-500 mb-2" />
                                 <audio src={att.url} controls className="w-full h-8 z-10 relative" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none"><p className="text-white text-[11px] font-medium truncate w-full text-center">{att.name}</p></div>
                              </div>
                            ) : att.type === 'archive' || att.type === 'document' ? (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative flex flex-col items-center justify-center p-3 text-center group-hover:bg-slate-200 dark:group-hover:bg-slate-800 transition-colors">
                                {att.type === 'archive' ? <FileArchive className="w-8 h-8 text-red-500 mb-2" /> : <FileText className="w-8 h-8 text-blue-500 mb-2" />}
                                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 break-all line-clamp-2">{att.name}</p>
                                <span className="mt-1 inline-flex items-center h-5 px-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-medium text-slate-700 dark:text-slate-300">{t('lessons.view.download', 'Скачать')}</span>
                              </div>
                            ) : (
                              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative">
                                 <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"><p className="text-white text-[11px] font-medium truncate">{att.name}</p></div>
                              </div>
                            )}
                         </a>
                       ))}
                    </div>
                  </div>
                )}

                {/* AI Analysis Block */}
                {selectedSubmission.aiAnalysis && (
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('homework.review.aiReport', 'Отчёт нейросети')}</h4>
                    </div>

                    <div className="space-y-2">
                      {/* Recommended grade */}
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('homework.review.suggestedScore', 'Рекомендуемый балл')}</p>
                        <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{selectedSubmission.aiAnalysis.grade} <span className="text-sm text-slate-400 font-medium">/ {selectedSubmission.maxPoints || 10}</span></p>
                      </div>

                      {/* Summary */}
                      {selectedSubmission.aiAnalysis.summary && (
                        <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-slate-200 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('homework.review.overall', 'Общая оценка')}</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{selectedSubmission.aiAnalysis.summary}</p>
                        </div>
                      )}

                      {/* Strengths / Weaknesses */}
                      {((selectedSubmission.aiAnalysis.strengths?.length || 0) > 0 || (selectedSubmission.aiAnalysis.weaknesses?.length || 0) > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedSubmission.aiAnalysis.strengths && selectedSubmission.aiAnalysis.strengths.length > 0 && (
                            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-700">
                              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1.5 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> {t('homework.review.pros', 'Плюсы')}</p>
                              <ul className="space-y-1.5">
                                {selectedSubmission.aiAnalysis.strengths.map((s, i) => (
                                  <li key={i} className="text-sm text-slate-700 dark:text-slate-300 leading-snug flex gap-1.5"><span className="text-emerald-500 font-semibold shrink-0">+</span>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {selectedSubmission.aiAnalysis.weaknesses && selectedSubmission.aiAnalysis.weaknesses.length > 0 && (
                            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-700">
                              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1.5 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> {t('homework.review.cons', 'Минусы')}</p>
                              <ul className="space-y-1.5">
                                {selectedSubmission.aiAnalysis.weaknesses.map((s, i) => (
                                  <li key={i} className="text-sm text-slate-700 dark:text-slate-300 leading-snug flex gap-1.5"><span className="text-amber-500 font-semibold shrink-0">−</span>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Grammar issues */}
                      {selectedSubmission.aiAnalysis.grammarIssues && selectedSubmission.aiAnalysis.grammarIssues.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-slate-200 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('homework.review.issues', 'Замечания и правки ({{count}})', { count: selectedSubmission.aiAnalysis.grammarIssues.length })}</p>
                          <ul className="space-y-2.5">
                            {selectedSubmission.aiAnalysis.grammarIssues.map((g, i) => (
                              <li key={i} className="text-sm leading-snug">
                                <span className="text-red-500 line-through decoration-red-400/60">{g.fragment}</span>
                                <span className="mx-1.5 text-slate-400">→</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{g.correction}</span>
                                {g.explanation && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{g.explanation}</p>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Suggestions */}
                      {selectedSubmission.aiAnalysis.suggestions && (
                        <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-slate-200 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('homework.review.recommendations', 'Рекомендации')}</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{selectedSubmission.aiAnalysis.suggestions}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Grading Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 space-y-3">
              {/* Score section */}
              <div>
                <label className="label">{t('homework.review.score', 'Балл')}</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range"
                    min={0}
                    max={selectedSubmission.maxPoints || 10}
                    value={gradeInput}
                    onChange={e => setGradeInput(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex items-baseline gap-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2.5 py-1 min-w-[72px] justify-center">
                    <input 
                      type="number" 
                      min={0}
                      max={selectedSubmission.maxPoints || 10}
                      value={gradeInput}
                      onChange={e => setGradeInput(Number(e.target.value))}
                      className="w-8 text-center text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 bg-transparent outline-none"
                    />
                    <span className="text-xs text-slate-400 tabular-nums">/ {selectedSubmission.maxPoints || 10}</span>
                  </div>
                </div>
                {/* Visual bar */}
                <div className="mt-1.5 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      (gradeInput / (selectedSubmission.maxPoints || 10)) >= 0.7 ? 'bg-emerald-500' : 
                      (gradeInput / (selectedSubmission.maxPoints || 10)) >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, (gradeInput / (selectedSubmission.maxPoints || 10)) * 100)}%` }}
                  />
                </div>
              </div>
              
              {/* Feedback */}
              <div>
                <label className="label">{t('homework.review.feedback', 'Отзыв')}</label>
                <textarea 
                  value={feedbackInput}
                  onChange={e => setFeedbackInput(e.target.value)}
                  placeholder={t('homework.review.feedbackPh', 'Отличная работа, так держать!')}
                  rows={2}
                  className="input w-full resize-none"
                />
              </div>

              <button
                onClick={handleSaveGrade}
                disabled={isSaving}
                className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('common.saving', 'Сохранение...')}</> : <>{t('homework.review.saveGrade', 'Сохранить оценку')} <CheckCircle className="w-3.5 h-3.5" /></>}
              </button>
            </div>
            
          </div>
        )}
      </div>

    </div>
  );
};

export default HomeworkReviewPage;
