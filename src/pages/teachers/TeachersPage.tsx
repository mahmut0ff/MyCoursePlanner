import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgInviteUser } from '../../lib/api';
import { UserPlus, Search, Mail, RefreshCw, Send } from 'lucide-react';
import type { UserProfile } from '../../types';

const TeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    orgGetTeachers()
      .then((data: any) => {
        // Filter to show only teachers (extra safety)
        const teachersOnly = (Array.isArray(data) ? data : []).filter(
          (u: any) => u.role === 'teacher'
        );
        setTeachers(teachersOnly);
      })
      .catch((e: any) => setError(e.message || 'Error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = teachers.filter((t) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));



  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true); setError('');
    try {
      await orgInviteUser(inviteEmail.trim(), 'teacher');
      setShowInvite(false); setInviteEmail('');
      setSuccess(t('org.teachers.inviteSent')); setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) { setError(e.message || t('common.loadError', 'Ошибка')); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.teachers')}</h1><p className="text-[11px] text-slate-500">{teachers.length} {t('org.teachers.total')}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button onClick={() => setShowInvite(true)} className="bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Mail className="w-3 h-3" />{t('org.teachers.invite')}</button>
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
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">{t('common.email', 'Email')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.users.role')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((teacher) => (
                  <tr key={teacher.uid} onClick={() => navigate(`/teachers/${teacher.uid}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {teacher.avatarUrl ? (
                          <img src={teacher.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 hover:scale-110 transition-transform" />
                        ) : (
                          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-[11px] text-white font-bold shadow-sm">{teacher.displayName?.[0]?.toUpperCase() || '?'}</div>
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{teacher.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 truncate max-w-[200px] hidden sm:table-cell">{teacher.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-500/10 text-violet-500">{t('org.teachers.roleTeacher')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Invite Teacher Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.invite')}</h2>
            <p className="text-[10px] text-slate-500 mb-3">{t('org.teachers.inviteDesc')}</p>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('org.teachers.inviteEmailPlaceholder')}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-violet-500 text-slate-900 dark:text-white"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowInvite(false)} className="px-2.5 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail.trim()}
                className="bg-violet-500 hover:bg-violet-600 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                <Send className="w-3 h-3" />
                {saving ? '...' : t('org.teachers.sendInvite')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeachersPage;
