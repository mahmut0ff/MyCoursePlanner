import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetUser, adminUpdateUserRole, adminDisableUser, adminEnableUser, adminResetPassword } from '../../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Mail, Calendar, Shield, Users, Ban, Check, Key } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = { super_admin: 'bg-red-100 text-red-700', admin: 'bg-violet-100 text-violet-700', teacher: 'bg-blue-100 text-blue-700', student: 'bg-emerald-100 text-emerald-700' };

const AdminUserDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try { setUser(await adminGetUser(uid)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [uid]);

  const handleRoleChange = async (role: string) => { await adminUpdateUserRole(uid!, role); load(); };
  const handleDisable = async () => { if (!confirm(t('admin.users.confirmDisable'))) return; await adminDisableUser(uid!); load(); };
  const handleEnable = async () => { await adminEnableUser(uid!); load(); };
  const handleReset = async () => {
    if (!user?.email) return;
    try { const res = await adminResetPassword(user.email); toast.success(`Password reset link generated:\n${res.link}`); } catch (e: any) { toast.error(`Error: ${e.message}`); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!user) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/admin/users')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Profile */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-20" />
        <div className="px-6 pb-6 -mt-8">
          <div className="flex items-end gap-4 mb-4">
            <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center text-2xl font-bold text-primary-700 shadow-lg ring-4 ring-white dark:ring-slate-800">
              {user.displayName?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="pb-1">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{user.displayName}</h1>
              <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || ''}`}>{user.role}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${user.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.disabled ? t('common.disabled') : t('common.active')}</span>
            {user.organizationName && <span className="text-[10px] text-slate-400">{t('admin.users.organization')}: {user.organizationName}</span>}
            {user.createdAt && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(user.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Role Change */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-primary-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('admin.users.changeRole')}</h2></div>
        <div className="flex gap-2 flex-wrap">
          {['admin', 'teacher', 'student'].map((r) => (
            <button key={r} disabled={user.role === r} onClick={() => handleRoleChange(r)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${user.role === r ? 'bg-primary-100 text-primary-700 cursor-not-allowed' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.users.actions')}</h2>
        <div className="flex flex-wrap gap-2">
          {user.disabled
            ? <button onClick={handleEnable} className="btn-primary text-xs flex items-center gap-1"><Check className="w-3.5 h-3.5" />{t('admin.users.enable')}</button>
            : <button onClick={handleDisable} className="btn-secondary text-xs flex items-center gap-1"><Ban className="w-3.5 h-3.5" />{t('admin.users.disable')}</button>
          }
          <button onClick={handleReset} className="btn-secondary text-xs flex items-center gap-1"><Key className="w-3.5 h-3.5" />{t('admin.users.resetPassword')}</button>
        </div>
      </div>

      {/* Recent Exams */}
      {user.recentAttempts?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.users.recentExams')}</h2>
          <div className="space-y-2">
            {user.recentAttempts.slice(0, 10).map((a: any) => (
              <div key={a.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-4 py-2.5 flex items-center justify-between">
                <div><p className="text-sm font-medium text-slate-900 dark:text-white">{a.examTitle}</p><p className="text-[10px] text-slate-400">{new Date(a.submittedAt).toLocaleDateString()}</p></div>
                <span className={`text-sm font-bold ${a.percentage >= 70 ? 'text-emerald-500' : 'text-red-500'}`}>{a.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserDetailPage;
