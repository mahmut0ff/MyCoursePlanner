import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetResults, orgGetStudents } from '../../lib/api';
import { Trophy, Search, Download, RefreshCw } from 'lucide-react';
import type { ExamAttempt, UserProfile } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';

const ResultsPage: React.FC = () => {
  const { t } = useTranslation();
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = () => { 
    setLoading(true); 
    Promise.all([orgGetResults(), orgGetStudents().catch(() => [])])
      .then(([res, st]) => { setResults(res); setStudents(st); })
      .catch((e) => setError(e.message || 'Error'))
      .finally(() => setLoading(false)); 
  };
  useEffect(load, []);

  const filtered = results.filter((r) => r.studentName?.toLowerCase().includes(search.toLowerCase()) || r.examTitle?.toLowerCase().includes(search.toLowerCase()));
  const avgScore = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + (r.percentage || 0), 0) / filtered.length) : 0;
  const passRate = filtered.length > 0 ? Math.round((filtered.filter((r) => r.passed).length / filtered.length) * 100) : 0;

  const exportCSV = () => {
    const rows = [`"${t('org.results.student')}","${t('org.results.exam')}","${t('org.results.score')}","${t('common.status')}","${t('org.results.date')}"`, ...filtered.map((r) => `"${r.studentName}","${r.examTitle}",${r.percentage}%,${r.passed ? t('org.results.passed') : t('org.results.failed')},${new Date(r.submittedAt).toLocaleDateString()}`)].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' })); a.download = 'results.csv'; a.click();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">{t('nav.results')}</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{results.length} {t('org.results.total')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center justify-center p-2.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all duration-200" title="Обновить">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <Download className="w-4 h-4" />
            Экспорт
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-sm font-medium text-red-600 dark:text-red-400">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-[#151f2e] border border-slate-200/80 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">{filtered.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('org.results.totalAttempts')}</p>
        </div>
        <div className="bg-white dark:bg-[#151f2e] border border-slate-200/80 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy className="w-16 h-16 text-indigo-500 -mr-4 -mt-4" /></div>
          <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{avgScore}%</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('org.results.avgScore')}</p>
        </div>
        <div className="bg-white dark:bg-[#151f2e] border border-slate-200/80 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy className="w-16 h-16 text-emerald-500 -mr-4 -mt-4" /></div>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mb-1">{passRate}%</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('org.results.passRate')}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151f2e] border border-slate-200/80 dark:border-slate-700/50 rounded-2xl p-3 mb-4 shadow-sm flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="w-full bg-transparent border-0 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-0" />
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-indigo-400" /></div> : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white/50 dark:bg-[#151f2e]/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700/50">
           <Trophy className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
           <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('org.results.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#151f2e] border border-slate-200/80 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/20">
              <th className="font-semibold text-slate-500 dark:text-slate-400 px-6 py-4">{t('org.results.student')}</th>
              <th className="font-semibold text-slate-500 dark:text-slate-400 px-6 py-4">{t('org.results.exam')}</th>
              <th className="font-semibold text-slate-500 dark:text-slate-400 px-6 py-4">{t('org.results.score')}</th>
              <th className="font-semibold text-slate-500 dark:text-slate-400 px-6 py-4">{t('common.status')}</th>
              <th className="font-semibold text-slate-500 dark:text-slate-400 px-6 py-4 hidden md:table-cell">{t('org.results.date')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
              {filtered.map((r) => {
                const s = students.find(x => x.uid === r.studentId);
                return (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-3">
                       {s?.avatarUrl ? (
                          <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm" />
                       ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm">{r.studentName?.[0]?.toUpperCase() || '?'}</div>
                       )}
                       <span className="truncate flex items-center gap-2">{r.studentName} <PinnedBadgesDisplay className="hidden sm:flex" badges={s?.pinnedBadges} /></span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">{r.examTitle}</td>
                  <td className="px-6 py-4"><span className={`font-black text-lg ${r.percentage >= 80 ? 'text-emerald-500' : r.percentage >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{r.percentage}%</span></td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${r.passed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {r.passed ? t('org.results.passed') : t('org.results.failed')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-400 hidden md:table-cell">{new Date(r.submittedAt).toLocaleDateString()}</td>
                </tr>
              )})}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;
