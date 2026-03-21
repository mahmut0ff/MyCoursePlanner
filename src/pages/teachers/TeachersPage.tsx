import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgInviteUser } from '../../lib/api';
import { UserPlus, Search, Plus, Mail, X } from 'lucide-react';
import type { UserProfile } from '../../types';

const TeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('teacher');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    orgGetTeachers()
      .then(setTeachers)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = teachers.filter((t) =>
    t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true); setError('');
    try {
      await orgInviteUser(inviteEmail, inviteRole);
      setShowInvite(false); setInviteEmail('');
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setTimeout(() => setSuccess(''), 3000);
      orgGetTeachers().then(setTeachers);
    } catch (e: any) { setError(e.message || 'Failed to invite'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div className="flex gap-5 h-full">
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.teachers')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{teachers.length} {t('org.teachers.total')}</p>
          </div>
          <button onClick={() => setShowInvite(true)} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />{t('org.teachers.invite')}
          </button>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}
        {success && <div className="mb-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-600 dark:text-emerald-400">{success}</div>}

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><UserPlus className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm text-slate-500">{t('org.teachers.empty')}</p>
            <button onClick={() => setShowInvite(true)} className="mt-3 btn-primary !py-1.5 !px-3 text-xs">{t('org.teachers.invite')}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((teacher) => (
              <div key={teacher.uid} onClick={() => setSelected(teacher)}
                className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-3.5 hover:shadow-md hover:shadow-primary-500/5 hover:border-primary-200 dark:hover:border-primary-800/50 transition-all cursor-pointer group backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-400 to-purple-600 rounded-lg flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                    {teacher.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs text-slate-900 dark:text-white truncate">{teacher.displayName}</p>
                    <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{teacher.email}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${teacher.role === 'admin' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'}`}>
                    {teacher.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-full lg:w-80 xl:w-96 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden shrink-0 backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{t('org.students.profile')}</h3>
            <button onClick={() => setSelected(null)} className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"><X className="w-3.5 h-3.5 text-slate-400" /></button>
          </div>
          <div className="p-5 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-lg text-white font-bold mx-auto mb-3">
              {selected.displayName?.[0]?.toUpperCase() || '?'}
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{selected.displayName}</p>
            <p className="text-xs text-slate-400 mb-1">{selected.email}</p>
            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${selected.role === 'admin' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600' : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600'}`}>
              {selected.role}
            </span>
          </div>
          <div className="px-5 pb-5 space-y-3">
            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('org.users.joined')}</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.invite')}</h2>
            <p className="text-[11px] text-slate-500 mb-4">Enter the email of an existing user or send an invite</p>
            <div className="space-y-2.5">
              <input type="email" placeholder="teacher@example.com" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" autoFocus />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white">
                <option value="teacher">{t('org.teachers.roleTeacher')}</option>
                <option value="admin">{t('org.teachers.roleAdmin')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowInvite(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail.trim()} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">{saving ? '...' : t('org.teachers.sendInvite')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeachersPage;
