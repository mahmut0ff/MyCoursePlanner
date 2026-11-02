import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetLessons, apiGetLesson, apiCreateLesson, apiTransferRequest, orgGetGroups } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import type { LessonPlan } from '../../types';
import { Plus, BookOpen, Clock, Search, Paperclip, ClipboardList, Sparkles, Filter, CheckCircle2, Copy } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import { AILessonFactoryModal } from '../../components/ui/AILessonFactoryModal';
import { toast } from 'react-hot-toast';

type StatusFilter = 'all' | 'published' | 'draft';


const LessonListPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { canAccess } = usePlanGate();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupNameById, setGroupNameById] = useState<Record<string, string>>({});
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';
  const isStudent = role === 'student';

  const loadLessons = () => {
    setLoading(true);
    apiGetLessons()
      .then((data) => setLessons(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to load lessons:', err);
        toast.error(t('lessons.loadFailed', 'Ошибка загрузки уроков. Попробуйте обновить страницу.'));
      })
      .finally(() => setLoading(false));
  };

  // The live catalog beats the copy stored on the lesson: it survives a rename,
  // and it names groups on lessons saved before the server started deriving
  // `groupNames` itself. Failure is silent — the stored names still work.
  const loadGroupNames = () => {
    orgGetGroups()
      .then((data) => {
        const map: Record<string, string> = {};
        (Array.isArray(data) ? data : []).forEach((g: { id: string; name?: string }) => {
          if (g?.id && g.name) map[g.id] = g.name;
        });
        setGroupNameById(map);
      })
      .catch(() => { /* silent */ });
  };

  useEffect(() => {
    loadLessons();
    loadGroupNames();
  }, []);

  /**
   * Group labels for one lesson: live catalog first, then the copy stored on the
   * lesson, and never the raw id.
   *
   * The stored copy is only consulted when it is the same length as `groupIds` —
   * older lessons were saved with a shorter names array, and pairing those by
   * index hands each group its neighbour's name. Better no name than a wrong one.
   */
  const lessonGroupLabels = useCallback((l: LessonPlan): { id: string; label: string }[] => {
    const ids = l.groupIds || [];
    const stored = l.groupNames || [];
    const storedIsUsable = stored.length === ids.length;
    return ids.map((gid, i) => ({
      id: gid,
      label: groupNameById[gid] || (storedIsUsable ? stored[i] : '') || t('lessons.groupGone', 'Группа удалена'),
    }));
  }, [groupNameById, t]);

  const handleDuplicate = async (e: React.MouseEvent, lesson: LessonPlan) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDuplicatingId(lesson.id!);
    try {
      if (profile?.activeOrgId && lesson.organizationId) {
        // Мы в организации, дублируем чей-то корпоративный урок СЕБЕ
        // Это требует одобрения (Security check)
        await apiTransferRequest({
          transferType: 'lesson_to_personal',
          sourceId: lesson.id!,
          targetId: 'personal',
          orgId: profile.activeOrgId,
          sourceTitle: lesson.title
        });
        toast.success(t('lessons.transferRequested', 'Запрос на копирование отправлен администратору'));
      } else {
        // Обычное дублирование (Личное -> Личное, или Личное -> Организация, или внутри Организации, 
        // хотя внутри организации обычно не дублируют, но пусть так)
        const fullLesson = await apiGetLesson(lesson.id!);
        // @ts-ignore
        const { id, createdAt, updatedAt, ...rest } = fullLesson;
        const newLessonData = { ...rest, title: t('lessons.copyTitle', '{{title}} (Копия)', { title: rest.title }), status: 'draft' };
        
        // Если автор делает копию своего урока В организацию, добавляем orgId
        if (profile?.activeOrgId && !lesson.organizationId) {
          (newLessonData as any).organizationId = profile.activeOrgId;
        }

        await apiCreateLesson(newLessonData);
        toast.success(t('lessons.duplicated', 'Урок успешно скопирован'));
        loadLessons();
      }
    } catch (err: any) {
      toast.error(err.message || t('lessons.view.copyFailed', 'Ошибка копирования'));
    } finally {
      setDuplicatingId(null);
    }
  };

  const uniqueSubjects = useMemo(() => Array.from(new Set(lessons.map(l => l.subject))).filter(Boolean), [lessons]);
  const uniqueLevels = useMemo(() => Array.from(new Set(lessons.map(l => l.level))).filter(Boolean), [lessons]);
  const uniqueGroups = useMemo(() => {
    const map = new Map<string, string>();
    lessons.forEach(l => {
      lessonGroupLabels(l).forEach(({ id, label }) => {
        if (!map.has(id)) map.set(id, label);
      });
    });
    return Array.from(map.entries()); // [[id, label], ...]
  }, [lessons, lessonGroupLabels]);

  const filtered = useMemo(() => {
    return lessons.filter((l) => {
      const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase()) || l.description?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || (l.status || 'draft') === statusFilter;
      const matchesSubject = subjectFilter === 'all' || l.subject === subjectFilter;
      const matchesLevel = levelFilter === 'all' || l.level === levelFilter;
      const matchesGroup = groupFilter === 'all' || (l.groupIds || []).includes(groupFilter);
      
      // Non-staff users only see published
      if (!isStaff && (l.status || 'draft') !== 'published') return false;
      return matchesSearch && matchesStatus && matchesSubject && matchesLevel && matchesGroup;
    });
  }, [lessons, search, statusFilter, subjectFilter, levelFilter, groupFilter, isStaff]);

  const isCompleted = (lessonId: string) => {
    if (!isStudent) return false;
    return !!localStorage.getItem(`viewed_lesson_${lessonId}`);
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="pb-10">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('lessons.title', 'Уроки')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('lessons.list.available', { count: filtered.length })}</p>
        </div>
        
        {isStaff && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {canAccess('ai') && (
              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex-1 sm:flex-none btn-secondary flex justify-center items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> 
                <span>{t('lessons.list.aiBuilder', 'AI Конструктор')}</span>
              </button>
            )}
            <Link to="/lessons/new" className="flex-1 sm:flex-none btn-primary flex justify-center items-center gap-1.5 shrink-0">
              <Plus className="w-3.5 h-3.5" />
              {t('lessons.create', 'Создать')}
            </Link>
          </div>
        )}
      </div>

      {/* Advanced Filters */}
      <div className="mb-3 flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('lessons.list.searchPlaceholder', 'Поиск по названию или описанию...')} 
            className="input pl-8 w-full" 
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input w-auto">
              <option value="all">{t('lessons.list.allSubjects', 'Все предметы')}</option>
              {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input w-auto">
              <option value="all">{t('lessons.list.allLevels', 'Все уровни')}</option>
              {uniqueLevels.map(l => <option key={l} value={l}>{t(`lessons.${String(l).toLowerCase()}`, l)}</option>)}
            </select>
          </div>

          {uniqueGroups.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="input w-auto">
                <option value="all">{t('rating.allGroups', 'Все группы')}</option>
                {uniqueGroups.map(([gid, gname]) => <option key={gid} value={gid}>{gname}</option>)}
              </select>
            </div>
          )}

          {isStaff && (
            <div className="flex gap-1 shrink-0 ml-1">
              {(['all', 'published', 'draft'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`h-7 px-2 rounded-md text-sm transition-colors ${statusFilter === s ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {s === 'all' ? t('common.all', 'Все') : s === 'published' ? t('common.published', 'Опубликован') : t('common.draft', 'Черновик')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || subjectFilter !== 'all' ? t('finances.nothingFound', 'Ничего не найдено') : t('lessons.noLessons', 'Уроков пока нет')}
          description={search || subjectFilter !== 'all' ? t('lessons.list.tryOtherFilters', 'Попробуйте изменить фильтры поиска') : t('lessons.addFirst', 'Добавьте первый урок')}
          actionLabel={isStaff ? t('lessons.create', 'Создать') : undefined}
          actionLink={isStaff ? '/lessons/new' : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_90px_60px] gap-3 items-center h-8 px-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t('lessons.titleLabel', 'Название')}</span>
            <span>{t('lessons.list.subjectLevel', 'Предмет / Уровень')}</span>
            <span>{t('nav.groups', 'Группы')}</span>
            <span>{t('exams.duration', 'Длительность')}</span>
            {isStaff && <span>{t('common.status', 'Статус')}</span>}
            <span></span>
          </div>

          {filtered.map((lesson) => {
            const completed = isCompleted(lesson.id!);
            return (
              <Link 
                key={lesson.id} 
                to={`/lessons/${lesson.id}`} 
                className={`group flex flex-col md:grid md:grid-cols-[1fr_120px_100px_100px_90px_60px] gap-2 md:gap-3 items-center min-h-[40px] px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative`}
              >
                {/* Title + cover thumbnail */}
                <div className="flex items-center gap-2 min-w-0 w-full">
                  {lesson.coverImageUrl ? (
                    <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                      <img src={lesson.coverImageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                      {completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {lesson.title}
                    </h3>
                    {/* Mobile-only meta */}
                    <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                      <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">{lesson.subject}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t(`lessons.${String(lesson.level).toLowerCase()}`, lesson.level)}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-1"><Clock className="w-3 h-3" />{lesson.duration} {t('common.minutes', 'мин')}</span>
                      {isStaff && (
                        <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                          {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject / Level */}
                <div className="hidden md:flex flex-col gap-0.5 min-w-0 items-start">
                  <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 truncate max-w-full">{lesson.subject}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t(`lessons.${String(lesson.level).toLowerCase()}`, lesson.level)}</span>
                </div>

                {/* Groups — labelled through the same resolver as the filter, so a
                    badge and the dropdown can never disagree about a group. */}
                <div className="hidden md:flex flex-wrap gap-1 justify-start">
                  {(() => {
                    const labels = lessonGroupLabels(lesson).map(g => g.label);
                    if (labels.length === 0) return <span className="text-xs text-slate-400">—</span>;
                    return (
                      <>
                        {labels.slice(0, 2).map((label, i) => (
                          <span key={i} className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 truncate max-w-[90px]">{label}</span>
                        ))}
                        {labels.length > 2 && (
                          <span className="text-xs text-slate-400 tabular-nums">+{labels.length - 2}</span>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Duration */}
                <div className="hidden md:flex items-center gap-1.5 text-sm tabular-nums text-slate-700 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{lesson.duration} {t('common.minutes', 'мин')}</span>
                </div>

                {/* Status (staff only) */}
                {isStaff && (
                  <div className="hidden md:block">
                    <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                      {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="hidden md:flex items-center gap-1.5 justify-end">
                  {(lesson.attachments?.length || 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-slate-400 tooltip" data-tip={t('lessons.attachments', 'Вложения')}>
                      <Paperclip className="w-3.5 h-3.5" /> <span className="text-xs tabular-nums">{lesson.attachments!.length}</span>
                    </span>
                  )}
                  {lesson.homework?.title && (
                    <span className="text-amber-500 tooltip" data-tip={t('lessons.homework', 'Домашнее задание')}>
                      <ClipboardList className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {isStaff && (
                    <button 
                      onClick={(e) => handleDuplicate(e, lesson)}
                      disabled={duplicatingId === lesson.id}
                      className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors tooltip"
                      data-tip={t('common.copy', 'Копировать')}
                    >
                      {duplicatingId === lesson.id ? <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin"/> : <Copy className="w-3.5 h-3.5" /> }
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AILessonFactoryModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onSuccess={() => loadLessons()} 
      />
    </div>
  );
};

export default LessonListPage;
