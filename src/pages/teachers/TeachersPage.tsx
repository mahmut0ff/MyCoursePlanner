import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgInviteUser } from '../../lib/api';
import { UserPlus, Search, Plus, Mail } from 'lucide-react';
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

  useEffect(() => { orgGetTeachers().then(setTeachers).finally(() => setLoading(false)); }, []);

  const filtered = teachers.filter((t) =>
    t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      await orgInviteUser(inviteEmail, inviteRole);
      setShowInvite(false); setInviteEmail('');
      orgGetTeachers().then(setTeachers);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.teachers')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{teachers.length} {t('org.teachers.total')}</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />{t('org.teachers.invite')}
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="input pl-10 text-sm" />
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.teachers.invite')}</h2>
            <div className="space-y-3">
              <input type="email" placeholder="teacher@example.com" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} className="input text-sm" autoFocus />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input text-sm">
                <option value="teacher">{t('org.teachers.roleTeacher')}</option>
                <option value="admin">{t('org.teachers.roleAdmin')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowInvite(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('org.teachers.sendInvite')}</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><UserPlus className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>{t('org.teachers.empty')}</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.uid} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-600 rounded-full flex items-center justify-center text-sm text-white font-bold">
                  {t.displayName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{t.displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{t.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.role === 'admin' ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  {t.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeachersPage;
