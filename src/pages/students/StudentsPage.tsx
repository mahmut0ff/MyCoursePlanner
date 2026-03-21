import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetStudents, orgGetResults } from '../../lib/api';
import { Users, Search, X, Trophy, Mail, ChevronRight } from 'lucide-react';
import type { UserProfile, ExamAttempt } from '../../types';

const StudentsPage: React.FC = () => {
  const { t } = useTranslation();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    orgGetStudents()
      .then(setStudents)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const selectStudent = async (s: UserProfile) => {
    setSelected(s);
    setLoadingResults(true);
    try {
      const r = await orgGetResults({ studentId: s.uid });
      setResults(r);
    } catch { setResults([]); }
    finally { setLoadingResults(false); }
  };

  const filtered = students.filter((s) =>
    s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length) : 0;
  const passRate = results.length > 0
    ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 0;

  return (
    <div className="flex gap-5 h-full">
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.students')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{students.length} {t('org.students.total')}</p>
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><Users className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm text-slate-500">{t('org.students.empty')}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((s) => (
                <div key={s.uid} onClick={() => selectStudent(s)} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group">
                  <div className="w-7 h-7 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                    {s.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{s.displayName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{s.email}</p>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-medium">{t('common.active')}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selected && (
        <div className="w-full lg:w-80 xl:w-96 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden shrink-0 backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{t('org.students.profile')}</h3>
            <button onClick={() => setSelected(null)} className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors lg:hidden"><X className="w-3.5 h-3.5 text-slate-400" /></button>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center text-sm text-white font-bold">
                {selected.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{selected.displayName}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{selected.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-slate-900 dark:text-white">{results.length}</p>
                <p className="text-[9px] text-slate-500">{t('org.students.examsTaken')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-primary-600 dark:text-primary-400">{avgScore}%</p>
                <p className="text-[9px] text-slate-500">{t('org.students.avgScore')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{passRate}%</p>
                <p className="text-[9px] text-slate-500">{t('org.results.passRate')}</p>
              </div>
            </div>

            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Trophy className="w-3 h-3" />{t('org.students.recentResults')}</h4>
            {loadingResults ? <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" /></div> : (
              <div className="space-y-1.5">
                {results.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/20 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-900 dark:text-white truncate">{r.examTitle}</p>
                      <p className="text-[9px] text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-bold ${r.passed ? 'text-emerald-600' : 'text-red-500'}`}>{r.percentage}%</span>
                  </div>
                ))}
                {results.length === 0 && <p className="text-[11px] text-slate-400 text-center py-4">{t('org.students.noResults')}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsPage;
