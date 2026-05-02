import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExams } from '../../services/exams.service';
import type { Exam } from '../../types';

import { Plus, ClipboardList, Search, Clock, HelpCircle, FileText, Filter } from 'lucide-react';
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
    <div className="max-w-7xl mx-auto pb-10">

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('exams.title', 'Экзамены')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{filtered.length} {t('exams.totalCount', 'доступных экзаменов')}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link
            to="/exams/new"
            onClick={handleCreate}
            className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" />{t('exams.create', 'Создать')}
          </Link>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или предмету..."
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
          {uniqueSubjects.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-4 h-4 text-slate-400" />
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none">
                <option value="all">Все предметы</option>
                {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {isStaff && (
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0 ml-2">
              {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
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
          title={search || subjectFilter !== 'all' ? 'Ничего не найдено' : t('exams.noExams', 'Экзаменов пока нет')}
          description={search || subjectFilter !== 'all' ? 'Попробуйте изменить фильтры поиска' : t('exams.createFirst', 'Создайте первый экзамен')}
          actionLabel={t('exams.create', 'Создать')}
          actionLink="/exams/new"
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_90px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Название</span>
            <span>Предмет</span>
            <span>Вопросы</span>
            <span>Длительность</span>
            {isStaff && <span>Статус</span>}
          </div>

          {filtered.map((exam) => (
            <Link
              key={exam.id}
              to={`/exams/${exam.id}`}
              className="group flex flex-col md:grid md:grid-cols-[1fr_120px_100px_100px_90px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors relative"
            >
              {/* Title + icon */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary-50 dark:bg-primary-900/20 text-primary-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {exam.title}
                  </h3>
                  {/* Mobile-only meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {exam.subject && <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{exam.subject}</span>}
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><HelpCircle className="w-3 h-3" />{exam.questionCount || 0}</span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{exam.durationMinutes} мин</span>
                    {isStaff && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${exam.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : exam.status === 'archived' ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {exam.status === 'published' ? t('common.published') : exam.status === 'archived' ? t('common.archived', 'Архив') : t('common.draft')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="hidden md:flex flex-col gap-1 min-w-0">
                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider truncate text-center">{exam.subject || '—'}</span>
              </div>

              {/* Questions */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>{exam.questionCount || 0}</span>
              </div>

              {/* Duration */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{exam.durationMinutes} мин</span>
              </div>

              {/* Status (staff only) */}
              {isStaff && (
                <div className="hidden md:block">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${exam.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : exam.status === 'archived' ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
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
