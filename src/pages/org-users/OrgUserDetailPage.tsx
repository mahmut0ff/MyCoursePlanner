import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetUsers, orgUpdateUserRole } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, Shield, Users } from 'lucide-react';
import type { UserProfile } from '../../types';

const OrgUserDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleChanging, setRoleChanging] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    orgGetUsers()
      .then((all: UserProfile[]) => setUser(all.find((u) => u.uid === uid) || null))
      .finally(() => setLoading(false));
  }, [uid]);

  const handleRoleChange = async (role: string) => {
    if (!user) return;
    setRoleChanging(true);
    try {
      await orgUpdateUserRole(user.uid, role);
      setUser({ ...user, role: role as any });
    } catch (e) { console.error(e); }
    finally { setRoleChanging(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!user) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/org-users')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  const roleBadge = (r: string) => {
    const colors: Record<string, string> = { admin: 'bg-primary-500/10 text-primary-500', teacher: 'bg-violet-500/10 text-violet-500', student: 'bg-emerald-500/10 text-emerald-500' };
    return colors[r] || 'bg-slate-500/10 text-slate-500';
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/org-users')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Profile */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-20" />
        <div className="px-6 pb-6 relative">
          <div className="absolute -top-8 left-6">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-16 h-16 bg-slate-600 rounded-xl flex items-center justify-center text-xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                {user.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="pt-10 sm:pt-1 sm:ml-20 pb-1 mb-4">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{user.displayName}</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleBadge(user.role)}`}>{user.role}</span>
            {user.createdAt && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{t('org.users.joined')}: {new Date(user.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Role Management */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('org.users.role')}</h2>
        </div>
        <div className="flex gap-2">
          {['admin', 'teacher', 'student'].map((r) => (
            <button
              key={r}
              onClick={() => handleRoleChange(r)}
              disabled={roleChanging || user.role === r}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${user.role === r ? 'bg-primary-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary-100 dark:hover:bg-primary-900/20'}`}
            >
              {t(`org.users.role_${r}`) || r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrgUserDetailPage;
