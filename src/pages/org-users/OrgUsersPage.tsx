import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetUsers, orgUpdateUserRole, orgInviteUser } from '../../lib/api';
import { Search, Plus } from 'lucide-react';
import type { UserProfile } from '../../types';

const OrgUsersPage: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('student');
  const [saving, setSaving] = useState(false);

  useEffect(() => { orgGetUsers().then(setUsers).finally(() => setLoading(false)); }, []);

  const filtered = users.filter((u) =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      await orgInviteUser(inviteEmail, inviteRole);
      setShowInvite(false); setInviteEmail('');
      orgGetUsers().then(setUsers);
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (uid: string, role: string) => {
    await orgUpdateUserRole(uid, role);
    setUsers((p) => p.map((u) => u.uid === uid ? { ...u, role: role as any } : u));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400',
    teacher: 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400',
    student: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.users')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{users.length} {t('org.users.total')}</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />{t('org.users.invite')}</button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input pl-10 text-sm" />
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.users.invite')}</h2>
            <div className="space-y-3">
              <input type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input text-sm" autoFocus />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input text-sm">
                <option value="student">{t('org.users.roleStudent')}</option>
                <option value="teacher">{t('org.users.roleTeacher')}</option>
                <option value="admin">{t('org.users.roleAdmin')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowInvite(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('org.users.sendInvite')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wider">
            <th className="px-5 py-3">{t('common.name')}</th>
            <th className="px-5 py-3">Email</th>
            <th className="px-5 py-3">{t('org.users.role')}</th>
            <th className="px-5 py-3">{t('org.users.joined')}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
                    {u.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  {u.displayName}
                </td>
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                <td className="px-5 py-3">
                  <select value={u.role} onChange={(e) => handleRoleChange(u.uid, e.target.value)}
                    className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${ROLE_COLORS[u.role] || ROLE_COLORS.student}`}>
                    <option value="student">student</option>
                    <option value="teacher">teacher</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-5 py-3 text-xs text-slate-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrgUsersPage;
