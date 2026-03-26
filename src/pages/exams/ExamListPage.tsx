import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExams } from '../../services/exams.service';
import type { Exam } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, ClipboardList, Search, Clock, HelpCircle } from 'lucide-react';

const ExamListPage: React.FC = () => {
  const { t } = useTranslation();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getExams().then(setExams).catch(() => setExams([])).finally(() => setLoading(false));
  }, []);

  const filtered = exams.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.subject.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'badge-green';
      case 'draft': return 'badge-yellow';
      case 'archived': return 'badge-slate';
      default: return 'badge-slate';
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('exams.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{exams.length} {t('exams.total')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`} className="input pl-8 w-44 text-xs" />
          </div>
          <Link to="/exams/new" className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" />{t('exams.create')}
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('exams.noExams')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('exams.createFirst')}</p>
          <Link to="/exams/new" className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" />{t('exams.create')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((exam) => (
            <Link key={exam.id} to={`/exams/${exam.id}`}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">{exam.title}</h3>
                <span className={`${statusBadge(exam.status)} text-[10px] shrink-0 ml-2`}>{exam.status}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{exam.subject}</p>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" />{exam.questionCount || 0} {t('exams.questions')}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.durationMinutes} {t('exams.min')}</span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{formatDate(exam.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamListPage;
