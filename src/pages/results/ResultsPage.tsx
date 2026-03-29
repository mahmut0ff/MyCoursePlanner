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
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.results')}</h1><p className="text-[11px] text-slate-500">{results.length} {t('org.results.total')}</p></div>
        <div className="flex items-center gap-1.5">
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={exportCSV} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><Download className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl p-2.5 text-center"><p className="text-lg font-bold text-slate-900 dark:text-white">{filtered.length}</p><p className="text-[9px] text-slate-500 uppercase">{t('org.results.totalAttempts')}</p></div>
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl p-2.5 text-center"><p className="text-lg font-bold text-primary-500">{avgScore}%</p><p className="text-[9px] text-slate-500 uppercase">{t('org.results.avgScore')}</p></div>
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl p-2.5 text-center"><p className="text-lg font-bold text-emerald-500">{passRate}%</p><p className="text-[9px] text-slate-500 uppercase">{t('org.results.passRate')}</p></div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="w-full bg-transparent border-0 pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : filtered.length === 0 ? (
        <div className="text-center py-16"><Trophy className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.results.empty')}</p></div>
      ) : (
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.results.student')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.results.exam')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.results.score')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.status')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">{t('org.results.date')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
              {filtered.map((r) => {
                const s = students.find(x => x.uid === r.studentId);
                return (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                       {s?.avatarUrl ? (
                          <img src={s.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                       ) : (
                          <div className="w-6 h-6 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-[9px] text-slate-500 shrink-0">{r.studentName?.[0]?.toUpperCase() || '?'}</div>
                       )}
                       <span className="truncate flex items-center gap-1.5">{r.studentName} <PinnedBadgesDisplay className="hidden sm:flex" badges={s?.pinnedBadges} /></span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{r.examTitle}</td>
                  <td className="px-4 py-2"><span className={`font-bold ${r.percentage >= 80 ? 'text-emerald-500' : r.percentage >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{r.percentage}%</span></td>
                  <td className="px-4 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.passed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{r.passed ? t('org.results.passed') : t('org.results.failed')}</span></td>
                  <td className="px-4 py-2 text-[10px] text-slate-400 hidden md:table-cell">{new Date(r.submittedAt).toLocaleDateString()}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;
