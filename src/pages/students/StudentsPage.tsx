import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetStudents, orgCreateStudent, orgGetResults } from '../../lib/api';
import { Users, Search, X, Trophy, Mail, Plus, RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { UserProfile, ExamAttempt } from '../../types';

const StudentsPage: React.FC = () => {
  const { t } = useTranslation();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [loadingR, setLoadingR] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const load = () => { setLoading(true); setError(''); orgGetStudents().then(setStudents).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const selectStudent = async (s: UserProfile) => {
    setSelected(s); setLoadingR(true);
    try { const r = await orgGetResults({ studentId: s.uid }); setResults(r); } catch { setResults([]); } finally { setLoadingR(false); }
  };

  const filtered = students.filter((s) => s.displayName?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase()));
  const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length) : 0;
  const passRate = results.length > 0 ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 0;

  const handleCreate = async () => {
    if (!form.displayName.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateStudent(form);
      setStudents((p) => [created, ...p]);
      setShowCreate(false); setForm({ displayName: '', email: '', password: '', phone: '' });
      setSuccess('Student created!'); setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) { setError(e.message || 'Failed to create student'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex gap-0 h-full">
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.students')}</h1><p className="text-[11px] text-slate-500">{students.length} {t('org.students.total')}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button onClick={() => setShowCreate(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.students.create')}</button>
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}
        {success && <div className="mb-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-500">{success}</div>}

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
              className="w-full bg-transparent border-0 pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
          </div>
        </div>

        {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : filtered.length === 0 ? (
          <div className="text-center py-16"><Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.students.empty')}</p></div>
        ) : (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.results.student')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Email</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.status')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((s) => (
                  <tr key={s.uid} onClick={() => selectStudent(s)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-primary-400 to-primary-600 rounded-md flex items-center justify-center text-[9px] text-white font-bold">{s.displayName?.[0]?.toUpperCase() || '?'}</div>
                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{s.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[180px]">{s.email}</span></td>
                    <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">{t('common.active')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-full lg:w-[340px] bg-white dark:bg-slate-800/90 border-l border-slate-200/80 dark:border-slate-700/40 overflow-y-auto shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/40 flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-800/90 z-10">
            <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{selected.displayName}</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center text-sm text-white font-bold">{selected.displayName?.[0]?.toUpperCase() || '?'}</div>
              <div><p className="text-xs font-medium text-slate-900 dark:text-white">{selected.displayName}</p><p className="text-[10px] text-slate-500">{selected.email}</p></div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-2 text-center"><p className="text-sm font-bold text-slate-900 dark:text-white">{results.length}</p><p className="text-[8px] text-slate-500 uppercase">{t('nav.exams')}</p></div>
              <div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-2 text-center"><p className="text-sm font-bold text-primary-500">{avgScore}%</p><p className="text-[8px] text-slate-500 uppercase">Avg</p></div>
              <div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-2 text-center"><p className="text-sm font-bold text-emerald-500">{passRate}%</p><p className="text-[8px] text-slate-500 uppercase">Pass</p></div>
            </div>
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Trophy className="w-3 h-3" />{t('org.students.recentResults')}</h4>
            {loadingR ? <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" /></div> : (
              <div className="space-y-1">
                {results.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/20 rounded-lg px-2.5 py-1.5">
                    <div><p className="text-[11px] font-medium text-slate-900 dark:text-white truncate">{r.examTitle}</p><p className="text-[9px] text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</p></div>
                    <span className={`text-xs font-bold ${r.passed ? 'text-emerald-500' : 'text-red-500'}`}>{r.percentage}%</span>
                  </div>
                ))}
                {results.length === 0 && <p className="text-[11px] text-slate-400 text-center py-3">{t('org.students.noResults')}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Student Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('org.students.create')}</h2>
            <p className="text-[10px] text-slate-500 mb-3">{t('org.students.createDesc')}</p>
            <div className="space-y-2">
              <input placeholder={t('org.students.namePlaceholder')} value={form.displayName} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <input type="email" placeholder="student@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} placeholder={t('org.students.passwordPlaceholder')} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 pr-8 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input placeholder={t('org.students.phonePlaceholder')} value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowCreate(false)} className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.displayName.trim() || !form.email.trim() || !form.password.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsPage;
