import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getLessonPlans } from '../../services/lessons.service';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonPlan } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, BookOpen, Clock, Search } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const LessonListPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isAdmin = role === 'admin';

  useEffect(() => {
    getLessonPlans().then(setLessons).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = lessons.filter(
    (l) => l.title.toLowerCase().includes(search.toLowerCase()) || l.subject.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('lessons.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{lessons.length} {t('lessons.title').toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`} className="input pl-9 w-44 text-xs" />
          </div>
          {isAdmin && (
            <Link to="/lessons/new" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{t('lessons.create')}</Link>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('lessons.noLessons')}
          description={t('lessons.addFirst')}
          actionLabel={isAdmin ? t('lessons.create') : undefined}
          actionLink={isAdmin ? '/lessons/new' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((lesson) => (
            <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl group hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all overflow-hidden">
              {lesson.coverImageUrl ? (
                <div className="h-40 bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              ) : (
                <div className="h-40 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-primary-300 dark:text-primary-600" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-primary">{lesson.subject}</span>
                  <span className="badge-slate">{lesson.level}</span>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">{lesson.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{lesson.description}</p>
                <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{lesson.duration} min</span>
                  <span>{formatDate(lesson.createdAt)}</span>
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
