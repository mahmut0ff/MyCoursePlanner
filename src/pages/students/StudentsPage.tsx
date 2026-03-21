import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetStudents, orgGetResults } from '../../lib/api';
import { Users, Search, X, Trophy, Mail } from 'lucide-react';
import type { UserProfile, ExamAttempt } from '../../types';

const StudentsPage: React.FC = () => {
  const { t } = useTranslation();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    orgGetStudents().then(setStudents).finally(() => setLoading(false));
  }, []);

  const selectStudent = async (s: UserProfile) => {
    setSelected(s);
    setLoadingResults(true);
    try {
      const r = await orgGetResults({ studentId: s.uid });
      setResults(r);
    } finally { setLoadingResults(false); }
  };

  const filtered = students.filter((s) =>
    s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length)
    : 0;

  return (
    <div className="flex gap-6">
      {/* Main Table */}
      <div className={`flex-1 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.students')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{students.length} {t('org.students.total')}</p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')} className="input pl-10 text-sm" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400"><Users className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>{t('org.students.empty')}</p></div>
        ) : (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3">{t('common.name')}</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">{t('common.status')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((s) => (
                  <tr key={s.uid} onClick={() => selectStudent(s)} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
                        {s.displayName?.[0]?.toUpperCase() || '?'}
                      </div>
                      {s.displayName}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{s.email}</td>
                    <td className="px-5 py-3"><span className="badge-green text-xs">{t('common.active')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selected && (
        <div className="w-full lg:w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shrink-0">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">{t('org.students.profile')}</h3>
            <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-lg text-white font-bold">
                {selected.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{selected.displayName}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{selected.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{results.length}</p>
                <p className="text-[10px] text-slate-500">{t('org.students.examsTaken')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{avgScore}%</p>
                <p className="text-[10px] text-slate-500">{t('org.students.avgScore')}</p>
              </div>
            </div>

            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1"><Trophy className="w-3 h-3" />{t('org.students.recentResults')}</h4>
            {loadingResults ? <p className="text-sm text-slate-400">...</p> : (
              <div className="space-y-2">
                {results.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-slate-900 dark:text-white">{r.examTitle}</p>
                      <p className="text-[10px] text-slate-500">{new Date(r.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-sm font-bold ${r.passed ? 'text-emerald-600' : 'text-red-500'}`}>{r.percentage}%</span>
                  </div>
                ))}
                {results.length === 0 && <p className="text-xs text-slate-400">{t('org.students.noResults')}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsPage;
