import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetLessons } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonPlan } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, BookOpen, Clock, Search, Paperclip, ClipboardList } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

type StatusFilter = 'all' | 'published' | 'draft';

const LessonListPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    apiGetLessons().then(setLessons).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = lessons.filter((l) => {
    const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase()) || l.subject.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (l.status || 'draft') === statusFilter;
    // Non-staff users only see published
    if (!isStaff && (l.status || 'draft') !== 'published') return false;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: lessons.length,
    published: lessons.filter((l) => (l.status || 'draft') === 'published').length,
    draft: lessons.filter((l) => (l.status || 'draft') === 'draft').length,
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('lessons.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{filtered.length} {t('lessons.title').toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`} className="input pl-9 w-44 text-xs" />
          </div>
          {isStaff && (
            <Link to="/lessons/new" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{t('lessons.create')}</Link>
          )}
        </div>
      </div>

      {/* Status filter tabs — only for staff */}
      {isStaff && (
        <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {s === 'all' ? t('common.all', 'Все') : s === 'published' ? t('common.published') : t('common.draft')} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('lessons.noLessons')}
          description={t('lessons.addFirst')}
          actionLabel={isStaff ? t('lessons.create') : undefined}
          actionLink={isStaff ? '/lessons/new' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((lesson) => (
            <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl group hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all overflow-hidden">
              {lesson.coverImageUrl ? (
                <div className="h-40 bg-slate-100 dark:bg-slate-700 overflow-hidden relative">
                  <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {/* Status badge overlay */}
                  <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold backdrop-blur-sm ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-500/80 text-white' : 'bg-amber-500/80 text-white'}`}>
                    {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                  </span>
                </div>
              ) : (
                <div className="h-40 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center relative">
                  <BookOpen className="w-10 h-10 text-primary-300 dark:text-primary-600" />
                  <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${(lesson.status || 'draft') === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                    {(lesson.status || 'draft') === 'published' ? t('common.published') : t('common.draft')}
                  </span>
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-primary">{lesson.subject}</span>
                  <span className="badge-slate">{lesson.level}</span>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">{lesson.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{lesson.description}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{lesson.duration} {t('common.minutes', 'мин')}</span>
                  <span>{formatDate(lesson.createdAt)}</span>
                  {(lesson.attachments?.length || 0) > 0 && (
                    <span className="flex items-center gap-0.5" title={t('lessons.attachments', 'Вложения')}>
                      <Paperclip className="w-3 h-3" />{lesson.attachments!.length}
                    </span>
                  )}
                  {lesson.homework?.title && (
                    <span title={t('lessons.homework', 'ДЗ')}>
                      <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default LessonListPage;
