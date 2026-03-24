import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetUsers, orgInviteUser } from '../../lib/api';
import { Search, Plus, RefreshCw } from 'lucide-react';
import type { UserProfile } from '../../types';

const ROLE_COLORS: Record<string, string> = { admin: 'bg-primary-500/10 text-primary-500', teacher: 'bg-violet-500/10 text-violet-500', student: 'bg-slate-500/10 text-slate-500' };

const OrgUsersPage: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('student');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => { setLoading(true); orgGetUsers().then(setUsers).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = users.filter((u) => u.displayName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return; setSaving(true); setError('');
    try { await orgInviteUser(inviteEmail, inviteRole); setShowInvite(false); setInviteEmail(''); setSuccess('Invite sent!'); setTimeout(() => setSuccess(''), 3000); load(); }
    catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };



  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.users')}</h1><p className="text-[11px] text-slate-500">{users.length} {t('org.users.total')}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button onClick={() => setShowInvite(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.users.invite')}</button>
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

        {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.name')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Email</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.users.role')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.users.joined')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((u) => (
                  <tr key={u.uid} onClick={() => navigate(`/org-users/${u.uid}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {u.avatarUrl ? (
                           <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0" />
                        ) : (
                           <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-[11px] text-white font-bold shadow-sm shrink-0">{u.displayName?.[0]?.toUpperCase() || '?'}</div>
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 truncate max-w-[180px]">{u.email}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.student}`}>{u.role}</span></td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('org.users.invite')}</h2>
            <p className="text-[10px] text-slate-500 mb-3">Assign role to existing user or send invite</p>
            <div className="space-y-2">
              <input type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                <option value="student">{t('org.users.roleStudent')}</option><option value="teacher">{t('org.users.roleTeacher')}</option><option value="admin">{t('org.users.roleAdmin')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowInvite(false)} className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50">{saving ? '...' : t('org.users.sendInvite')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgUsersPage;
