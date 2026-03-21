import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExams } from '../../services/exams.service';
import type { Exam } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, ClipboardList, Search } from 'lucide-react';

const ExamListPage: React.FC = () => {
  const { t } = useTranslation();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getExams().then(setExams).finally(() => setLoading(false));
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('exams.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{exams.length} exams total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`} className="input pl-10 w-64" />
          </div>
          <Link to="/exams/new" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{t('exams.create')}</Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">{t('exams.noExams')}</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Create your first exam to get started.</p>
          <Link to="/exams/new" className="btn-primary inline-flex items-center gap-2 mt-4"><Plus className="w-4 h-4" />{t('exams.create')}</Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Title</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Subject</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Questions</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Duration</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((exam) => (
                <tr key={exam.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/exams/${exam.id}`} className="font-medium text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">{exam.title}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{exam.subject}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{exam.questionCount || 0}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{exam.durationMinutes} min</td>
                  <td className="px-6 py-4"><span className={statusBadge(exam.status)}>{exam.status}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(exam.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExamListPage;
