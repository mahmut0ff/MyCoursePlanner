import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExams } from '../../services/exams.service';
import type { Exam } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, ClipboardList, Search, Clock, HelpCircle, FileText, ChevronRight } from 'lucide-react';
import { usePlanGate } from '../../contexts/PlanContext';
import toast from 'react-hot-toast';

const ExamListPage: React.FC = () => {
  const { t } = useTranslation();
  const { limits } = usePlanGate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getExams().then(setExams).catch(() => setExams([])).finally(() => setLoading(false));
  }, []);

  const handleCreate = (e: React.MouseEvent) => {
    if (limits.maxExams !== -1 && exams.length >= limits.maxExams) {
      e.preventDefault();
      toast.error(t('org.settings.maxExamsReached', 'Достигнут лимит экзаменов для вашего тарифа'));
    }
  };

  const filtered = exams.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.subject.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'draft': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'archived': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12 font-sans animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <FileText className="w-6 h-6 text-slate-700 dark:text-slate-300" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('exams.title', 'Exams Library')}</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">
            {t('exams.total', 'Manage your formal assessments')} • {exams.length} {t('exams.totalCount', 'total exams')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder={`${t('common.search', 'Search exams')}...`} 
              className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none w-full sm:w-64 transition-all shadow-sm" 
            />
          </div>
          <Link to="/exams/new" onClick={handleCreate} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
            <Plus className="w-4 h-4" />{t('exams.create', 'Create Exam')}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>
      ) : filtered.length === 0 ? (
        <div className="exam-slide-up bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('exams.noExams', 'No exams found')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">{t('exams.createFirst', 'Get started by creating your first formal assessment. Exams are strict, graded, and designed for serious evaluation.')}</p>
          <Link to="/exams/new" onClick={handleCreate} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-all shadow-md">
            <Plus className="w-5 h-5" />{t('exams.create', 'Create New Exam')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((exam, i) => (
            <Link 
              key={exam.id} 
              to={`/exams/${exam.id}`}
              className="exam-slide-up exam-card-hover bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 group flex flex-col justify-between h-full relative overflow-hidden"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 dark:bg-slate-800/20 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
              
              <div>
                <div className="flex items-start justify-between mb-4">
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${statusBadge(exam.status)} shrink-0`}>
                    {exam.status}
                  </span>
                  <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{formatDate(exam.createdAt)}</p>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors leading-snug mb-2 line-clamp-2">{exam.title}</h3>
                
                {exam.subject && (
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">{exam.subject}</p>
                )}
              </div>

              <div className="mt-auto pt-5 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {exam.questionCount || 0} {t('exams.questions', 'Questions')}
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5" />
                      {exam.durationMinutes} {t('exams.min', 'Min')}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors">
                    <ChevronRight className="w-4 h-4 ml-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamListPage;
