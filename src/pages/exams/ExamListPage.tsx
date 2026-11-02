import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExams } from '../../services/exams.service';
import type { Exam } from '../../types';

import { Plus, ClipboardList, Search, Clock, HelpCircle, FileText, Filter, BarChart3 } from 'lucide-react';
import { usePlanGate } from '../../contexts/PlanContext';
import { useAuth } from '../../contexts/AuthContext';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

type StatusFilter = 'all' | 'published' | 'draft' | 'archived';

const ExamListPage: React.FC = () => {
  const { t } = useTranslation();
  const { limits } = usePlanGate();
  const { role } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

  useEffect(() => {
    getExams().then(setExams).catch(() => setExams([])).finally(() => setLoading(false));
  }, []);

  const handleCreate = (e: React.MouseEvent) => {
    if (limits.maxExams !== -1 && exams.length >= limits.maxExams) {
      e.preventDefault();
      toast.error(t('org.settings.maxExamsReached', 'Достигнут лимит экзаменов для вашего тарифа'));
    }
  };

  const uniqueSubjects = useMemo(() => Array.from(new Set(exams.map(e => e.subject))).filter(Boolean), [exams]);

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      const matchesSubject = subjectFilter === 'all' || e.subject === subjectFilter;
      return matchesSearch && matchesStatus && matchesSubject;
    });
  }, [exams, search, statusFilter, subjectFilter]);

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="pb-10">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('exams.title', 'Экзамены')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('exams.availableCount', { count: filtered.length, defaultValue: '{{count}} доступных экзаменов' })}</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            to="/results"
            className="btn-secondary flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 shrink-0"
          >
            <BarChart3 className="w-3.5 h-3.5" />{t('nav.results', 'Результаты')}
          </Link>
          <Link
            to="/exams/new"
            onClick={handleCreate}
            className="btn-primary flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />{t('exams.create', 'Создать')}
          </Link>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="mb-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('exams.searchPlaceholder', 'Поиск по названию или предмету...')}
            className="input pl-8 w-full"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {uniqueSubjects.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input">
                <option value="all">{t('exams.allSubjects', 'Все предметы')}</option>
                {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {isStaff && (
            <div className="flex gap-1 shrink-0 ml-2">
              {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`h-7 px-2 rounded-md text-sm transition-colors ${statusFilter === s ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {s === 'all' ? t('common.all', 'Все') : s === 'published' ? t('common.published', 'Опубликован') : s === 'draft' ? t('common.draft', 'Черновик') : t('common.archived', 'Архив')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={search || subjectFilter !== 'all' ? t('directory.noResults', 'Ничего не найдено') : t('exams.noExams', 'Экзаменов пока нет')}
          description={search || subjectFilter !== 'all' ? t('exams.tryChangeFilters', 'Попробуйте изменить фильтры поиска') : t('exams.createFirst', 'Создайте первый экзамен')}
          actionLabel={t('exams.create', 'Создать')}
          actionLink="/exams/new"
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_90px] gap-3 items-center h-8 px-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t('exams.titleLabel', 'Название')}</span>
            <span>{t('exams.subjectLabel', 'Предмет')}</span>
            <span>{t('exams.questions', 'Вопросы')}</span>
            <span>{t('exams.duration', 'Длительность')}</span>
            {isStaff && <span>{t('common.status', 'Статус')}</span>}
          </div>

          {filtered.map((exam) => (
            <Link
              key={exam.id}
              to={`/exams/${exam.id}`}
              className="group flex flex-col md:grid md:grid-cols-[1fr_120px_100px_100px_90px] gap-2 md:gap-3 items-center min-h-[40px] px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative"
            >
              {/* Title + icon */}
              <div className="flex items-center gap-2 min-w-0 w-full">
                <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {exam.title}
                  </h3>
                  {/* Mobile-only meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {exam.subject && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{exam.subject}</span>}
                    <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums"><HelpCircle className="w-3 h-3" />{exam.questionCount || 0}</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3" />{exam.durationMinutes} {t('exams.min', 'мин')}</span>
                    {isStaff && (
                      <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${exam.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : exam.status === 'archived' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {exam.status === 'published' ? t('common.published') : exam.status === 'archived' ? t('common.archived', 'Архив') : t('common.draft')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="hidden md:flex flex-col gap-1 min-w-0">
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 truncate">{exam.subject || '—'}</span>
              </div>

              {/* Questions */}
              <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>{exam.questionCount || 0}</span>
              </div>

              {/* Duration */}
              <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{exam.durationMinutes} {t('exams.min', 'мин')}</span>
              </div>

              {/* Status (staff only) */}
              {isStaff && (
                <div className="hidden md:block">
                  <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${exam.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : exam.status === 'archived' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                    {exam.status === 'published' ? t('common.published') : exam.status === 'archived' ? t('common.archived', 'Архив') : t('common.draft')}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamListPage;
