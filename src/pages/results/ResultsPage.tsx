import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetResults } from '../../lib/api';
import { Trophy, Search, Download } from 'lucide-react';
import type { ExamAttempt } from '../../types';

const ResultsPage: React.FC = () => {
  const { t } = useTranslation();
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { orgGetResults().then(setResults).finally(() => setLoading(false)); }, []);

  const filtered = results.filter((r) =>
    r.studentName?.toLowerCase().includes(search.toLowerCase()) ||
    r.examTitle?.toLowerCase().includes(search.toLowerCase())
  );

  const avgScore = filtered.length > 0
    ? Math.round(filtered.reduce((s, r) => s + (r.percentage || 0), 0) / filtered.length)
    : 0;
  const passRate = filtered.length > 0
    ? Math.round((filtered.filter((r) => r.passed).length / filtered.length) * 100)
    : 0;

  const exportCSV = () => {
    const header = 'Student,Exam,Score,Passed,Date\n';
    const rows = filtered.map((r) => `${r.studentName},${r.examTitle},${r.percentage}%,${r.passed ? 'Yes' : 'No'},${new Date(r.submittedAt).toLocaleDateString()}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'results.csv'; a.click();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.results')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{results.length} {t('org.results.total')}</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary text-sm flex items-center gap-1.5">
          <Download className="w-4 h-4" />{t('org.results.export')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
          <p className="text-xs text-slate-500">{t('org.results.totalAttempts')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{avgScore}%</p>
          <p className="text-xs text-slate-500">{t('org.results.avgScore')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{passRate}%</p>
          <p className="text-xs text-slate-500">{t('org.results.passRate')}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="input pl-10 text-sm" />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><Trophy className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>{t('org.results.empty')}</p></div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-3">{t('org.results.student')}</th>
              <th className="px-5 py-3">{t('org.results.exam')}</th>
              <th className="px-5 py-3">{t('org.results.score')}</th>
              <th className="px-5 py-3">{t('common.status')}</th>
              <th className="px-5 py-3">{t('org.results.date')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{r.studentName}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{r.examTitle}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${r.percentage >= 80 ? 'text-emerald-600' : r.percentage >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{r.percentage}%</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.passed ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                      {r.passed ? t('org.results.passed') : t('org.results.failed')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;
