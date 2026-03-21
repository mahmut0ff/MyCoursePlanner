import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgCreateTeacher } from '../../lib/api';
import { UserPlus, Search, Plus, Mail, X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { UserProfile } from '../../types';

const TeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ displayName: '', email: '', password: '', phone: '' });
  const [showPw, setShowPw] = useState(false);

  const load = () => { setLoading(true); setError(''); orgGetTeachers().then(setTeachers).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = teachers.filter((t) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.displayName.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateTeacher(form);
      setTeachers((p) => [created, ...p]);
      setShowCreate(false); setForm({ displayName: '', email: '', password: '', phone: '' });
      setSuccess('Teacher created!'); setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) { setError(e.message || 'Failed to create teacher'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex gap-0 h-full">
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.teachers')}</h1><p className="text-[11px] text-slate-500">{teachers.length} {t('org.teachers.total')}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button onClick={() => setShowCreate(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.teachers.create')}</button>
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
          <div className="text-center py-16"><UserPlus className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.teachers.empty')}</p></div>
        ) : (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('nav.teachers')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Email</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.users.role')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((teacher) => (
                  <tr key={teacher.uid} onClick={() => setSelected(teacher)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-violet-400 to-purple-600 rounded-md flex items-center justify-center text-[9px] text-white font-bold">{teacher.displayName?.[0]?.toUpperCase() || '?'}</div>
                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{teacher.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 truncate max-w-[200px]">{teacher.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${teacher.role === 'admin' ? 'bg-primary-500/10 text-primary-500' : 'bg-violet-500/10 text-violet-500'}`}>{teacher.role}</span>
                    </td>
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
          <div className="p-5 text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-sm text-white font-bold mx-auto mb-2">{selected.displayName?.[0]?.toUpperCase() || '?'}</div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{selected.displayName}</p>
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mb-2"><Mail className="w-3 h-3" />{selected.email}</p>
            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${selected.role === 'admin' ? 'bg-primary-500/10 text-primary-500' : 'bg-violet-500/10 text-violet-500'}`}>{selected.role}</span>
          </div>
          <div className="px-5 pb-5"><div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-2.5"><p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{t('org.users.joined')}</p><p className="text-xs text-slate-700 dark:text-slate-300">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</p></div></div>
        </div>
      )}

      {/* Create Teacher Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.create')}</h2>
            <p className="text-[10px] text-slate-500 mb-3">{t('org.teachers.createDesc')}</p>
            <div className="space-y-2">
              <input placeholder={t('org.teachers.namePlaceholder')} value={form.displayName} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <input type="email" placeholder="teacher@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} placeholder={t('org.teachers.passwordPlaceholder')} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 pr-8 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input placeholder={t('org.teachers.phonePlaceholder')} value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
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

export default TeachersPage;
