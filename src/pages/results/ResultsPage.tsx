import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { numericDateLocale } from '../../lib/locale';
import { useNavigate } from 'react-router-dom';
import { orgGetResults, orgGetStudents } from '../../lib/api';
import { Trophy, Search, Download, RefreshCw } from 'lucide-react';
import type { ExamAttempt, UserProfile } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';

const ResultsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    const rows = [`"${t('org.results.student')}","${t('org.results.exam')}","${t('org.results.score')}","${t('common.status')}","${t('org.results.date')}"`, ...filtered.map((r) => `"${r.studentName}","${r.examTitle}",${r.percentage}%,${r.passed ? t('org.results.passed') : t('org.results.failed')},${new Date(r.submittedAt).toLocaleDateString(numericDateLocale())}`)].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' })); a.download = 'results.csv'; a.click();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.results')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('results.totalCount', { count: results.length, defaultValue: '{{count}} результатов' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800" title={t('common.refresh', 'Обновить')}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={exportCSV} className="btn-secondary inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {t('results.export', 'Экспорт')}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.results.totalAttempts')}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 relative">
          <div className="absolute top-3 right-3"><Trophy className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /></div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.results.avgScore')}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{avgScore}%</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 relative">
          <div className="absolute top-3 right-3"><Trophy className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /></div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.results.passRate')}</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{passRate}%</p>
        </div>
      </div>

      <div className="mb-3 flex items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="input pl-8" />
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
           <Trophy className="w-6 h-6 text-slate-400 mx-auto mb-2" />
           <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('org.results.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead><tr className="h-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <th className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3">{t('org.results.student')}</th>
              <th className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3">{t('org.results.exam')}</th>
              <th className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3">{t('org.results.score')}</th>
              <th className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3">{t('common.status')}</th>
              <th className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3 hidden md:table-cell">{t('org.results.date')}</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const s = students.find(x => x.uid === r.studentId);
                return (
                <tr key={r.id} onClick={() => navigate(`/results/${r.id}`)} className="h-10 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group cursor-pointer click-action">
                  <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                       {s?.avatarUrl ? (
                          <img src={s.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                       ) : (
                          <div className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0">{r.studentName?.[0]?.toUpperCase() || '?'}</div>
                       )}
                       <span className="truncate flex items-center gap-2">{r.studentName} <PinnedBadgesDisplay className="hidden sm:flex" badges={s?.pinnedBadges} /></span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.examTitle}</td>
                  <td className="px-3 py-1.5"><span className={`font-semibold tabular-nums ${r.percentage >= 80 ? 'text-emerald-600 dark:text-emerald-400' : r.percentage >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{r.percentage}%</span></td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${r.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {r.passed ? t('org.results.passed') : t('org.results.failed')}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">{new Date(r.submittedAt).toLocaleDateString(numericDateLocale())}</td>
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
