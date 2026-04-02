import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetLessons, apiGetLesson, apiCreateLesson, apiTransferRequest } from '../../lib/api';
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

  useEffect(() => {
    loadLessons();
  }, []);

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
        const newLessonData = { ...rest, title: `${rest.title} (Копия)`, status: 'draft' };
        
        // Если автор делает копию своего урока В организацию, добавляем orgId
        if (profile?.activeOrgId && !lesson.organizationId) {
          (newLessonData as any).organizationId = profile.activeOrgId;
        }

        await apiCreateLesson(newLessonData);
        toast.success(t('lessons.duplicated', 'Урок успешно скопирован'));
        loadLessons();
      }
    } catch (err: any) {
      toast.error(err.message || 'Error duplicating');
    } finally {
      setDuplicatingId(null);
    }
  };

  const uniqueSubjects = useMemo(() => Array.from(new Set(lessons.map(l => l.subject))).filter(Boolean), [lessons]);
  const uniqueLevels = useMemo(() => Array.from(new Set(lessons.map(l => l.level))).filter(Boolean), [lessons]);

  const filtered = useMemo(() => {
    return lessons.filter((l) => {
      const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase()) || l.description?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || (l.status || 'draft') === statusFilter;
      const matchesSubject = subjectFilter === 'all' || l.subject === subjectFilter;
      const matchesLevel = levelFilter === 'all' || l.level === levelFilter;
      
      // Non-staff users only see published
      if (!isStaff && (l.status || 'draft') !== 'published') return false;
      return matchesSearch && matchesStatus && matchesSubject && matchesLevel;
    });
  }, [lessons, search, statusFilter, subjectFilter, levelFilter, isStaff]);

  const isCompleted = (lessonId: string) => {
    if (!isStudent) return false;
    return !!localStorage.getItem(`viewed_lesson_${lessonId}`);
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">
      
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('lessons.title', 'Уроки')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{filtered.length} доступных уроков</p>
        </div>
        
        {isStaff && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {canAccess('ai') && (
              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex-1 sm:flex-none btn-secondary flex justify-center items-center gap-2 border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-300 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              >
                <Sparkles className="w-4 h-4" /> 
                <span>AI Конструктор</span>
              </button>
            )}
            <Link to="/lessons/new" className="flex-1 sm:flex-none btn-primary flex justify-center items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('lessons.create', 'Создать')}
            </Link>
          </div>
        )}
      </div>

      {/* Advanced Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Поиск по названию или описанию..." 
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" 
          />
        </div>
        
        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-4 h-4 text-slate-400" />
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none">
              <option value="all">Все предметы</option>
              {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none">
              <option value="all">Все уровни</option>
              {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {isStaff && (
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0 ml-2">
              {(['all', 'published', 'draft'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
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
          title={search || subjectFilter !== 'all' ? 'Ничего не найдено' : t('lessons.noLessons', 'Уроков пока нет')}
          description={search || subjectFilter !== 'all' ? 'Попробуйте изменить фильтры поиска' : t('lessons.addFirst', 'Добавьте первый урок')}
          actionLabel={isStaff ? t('lessons.create', 'Создать') : undefined}
          actionLink={isStaff ? '/lessons/new' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((lesson) => {
            const completed = isCompleted(lesson.id!);
            return (
              <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl group flex flex-col h-full hover:shadow-xl hover:shadow-primary-500/5 dark:hover:shadow-primary-500/5 hover:-translate-y-1 transition-all overflow-hidden duration-300 relative">
                
                {/* Completion Marker (Student only) */}
                {completed && (
                  <div className="absolute top-3 left-3 z-10 bg-emerald-500 text-white p-1 rounded-full shadow-md tooltip" data-tip="Урок пройден">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}

                {lesson.coverImageUrl ? (
                  <div className="h-44 bg-slate-100 dark:bg-slate-700 overflow-hidden relative shrink-0">
                    <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {isStaff && (
                      <span className={`absolute top-3 right-3 text-[10px] px-2.5 py-1 rounded-full font-bold backdrop-blur-md shadow-sm ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white'}`}>
                        {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    )}

                    {isStaff && (
                      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => handleDuplicate(e, lesson)}
                          disabled={duplicatingId === lesson.id}
                          className="p-2 bg-white/90 backdrop-blur hover:bg-white text-slate-700 hover:text-primary-600 rounded-lg shadow-sm transition-all flex items-center gap-1 tooltip"
                          data-tip="Копировать урок"
                        >
                          {duplicatingId === lesson.id ? <div className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin"/> : <Copy className="w-4 h-4" /> }
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-44 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center relative shrink-0 border-b border-slate-100 dark:border-slate-700/50">
                    <div className={`p-4 rounded-3xl mb-2 transition-transform duration-500 group-hover:scale-110 ${completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500' : 'bg-primary-50 dark:bg-primary-900/20 text-primary-400'}`}>
                      <BookOpen className="w-8 h-8" />
                    </div>
                    {isStaff && (
                      <span className={`absolute top-3 right-3 text-[10px] px-2.5 py-1 rounded-full font-bold shadow-sm ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    )}
                    
                    {isStaff && (
                      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => handleDuplicate(e, lesson)}
                          disabled={duplicatingId === lesson.id}
                          className="p-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg shadow-sm transition-all flex items-center gap-1 tooltip"
                          data-tip="Копировать урок"
                        >
                          {duplicatingId === lesson.id ? <div className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin"/> : <Copy className="w-4 h-4" /> }
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="p-5 flex flex-col flex-grow">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">{lesson.subject}</span>
                    <span className="text-[10px] text-slate-400 font-medium px-2 border border-slate-200 dark:border-slate-700 rounded-md py-0.5">{lesson.level}</span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-tight">{lesson.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 flex-grow">{lesson.description}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700/50 mt-auto">
                    <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md"><Clock className="w-3.5 h-3.5" />{lesson.duration} мин</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-slate-400">
                      {(lesson.attachments?.length || 0) > 0 && (
                        <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md tooltip" data-tip="Вложения">
                          <Paperclip className="w-3.5 h-3.5" /> <span className="text-[10px]">{lesson.attachments!.length}</span>
                        </span>
                      )}
                      {lesson.homework?.title && (
                        <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md text-amber-600 dark:text-amber-400 tooltip" data-tip="Домашнее задание">
                          <ClipboardList className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
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
