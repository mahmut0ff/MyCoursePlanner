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
  const [error, setError] = useState('');

  useEffect(() => {
    orgGetResults()
      .then(setResults)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = results.filter((r) =>
    r.studentName?.toLowerCase().includes(search.toLowerCase()) ||
    r.examTitle?.toLowerCase().includes(search.toLowerCase())
  );

  const avgScore = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + (r.percentage || 0), 0) / filtered.length) : 0;
  const passRate = filtered.length > 0 ? Math.round((filtered.filter((r) => r.passed).length / filtered.length) * 100) : 0;

  const exportCSV = () => {
    const header = 'Student,Exam,Score,Passed,Date\n';
    const rows = filtered.map((r) => `"${r.studentName}","${r.examTitle}",${r.percentage}%,${r.passed ? 'Yes' : 'No'},${new Date(r.submittedAt).toLocaleDateString()}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'results.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.results')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{results.length} {t('org.results.total')}</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1">
          <Download className="w-3.5 h-3.5" />{t('org.results.export')}
        </button>
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-3 text-center backdrop-blur-sm">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{t('org.results.totalAttempts')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-3 text-center backdrop-blur-sm">
          <p className="text-xl font-bold text-primary-600 dark:text-primary-400">{avgScore}%</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{t('org.results.avgScore')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-3 text-center backdrop-blur-sm">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{passRate}%</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{t('org.results.passRate')}</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><Trophy className="w-6 h-6 text-slate-400" /></div>
          <p className="text-sm text-slate-500">{t('org.results.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700/50 text-left text-[10px] text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">{t('org.results.student')}</th>
              <th className="px-4 py-2.5">{t('org.results.exam')}</th>
              <th className="px-4 py-2.5">{t('org.results.score')}</th>
              <th className="px-4 py-2.5">{t('common.status')}</th>
              <th className="px-4 py-2.5">{t('org.results.date')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{r.studentName}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.examTitle}</td>
                  <td className="px-4 py-2">
                    <span className={`font-bold ${r.percentage >= 80 ? 'text-emerald-600' : r.percentage >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{r.percentage}%</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${r.passed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                      {r.passed ? t('org.results.passed') : t('org.results.failed')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[10px] text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</td>
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
