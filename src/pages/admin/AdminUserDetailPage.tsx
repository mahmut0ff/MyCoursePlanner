import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetUser, adminUpdateUserRole, adminDisableUser, adminEnableUser, adminResetPassword, adminUpdateUserEmail, apiGetMemberRoles, apiSetMemberRoles } from '../../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Mail, Calendar, Shield, Users, Ban, Check, Key, Edit2, Layers, Loader2 } from 'lucide-react';

// Base roles that can be granted within an organization (multi-role membership).
const ASSIGNABLE_ROLES = ['admin', 'manager', 'teacher', 'student'] as const;
const ASSIGNABLE_ROLE_LABELS: Record<string, string> = {
  admin: 'Директор', manager: 'Менеджер', teacher: 'Преподаватель', student: 'Студент',
};

const ROLE_COLORS: Record<string, string> = { super_admin: 'bg-red-100 text-red-700', admin: 'bg-violet-100 text-violet-700', teacher: 'bg-blue-100 text-blue-700', student: 'bg-emerald-100 text-emerald-700' };

const AdminUserDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orgRoles, setOrgRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try { setUser(await adminGetUser(uid)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [uid]);

  // Load the member's role set for their org (multi-role assignment).
  const orgId: string | null = user ? (user.activeOrgId || user.organizationId || null) : null;
  useEffect(() => {
    setRolesLoaded(false);
    if (!uid || !orgId) { setOrgRoles([]); return; }
    apiGetMemberRoles(uid, orgId)
      .then((r) => setOrgRoles(r.roles || []))
      .catch(() => setOrgRoles([]))
      .finally(() => setRolesLoaded(true));
  }, [uid, orgId]);

  const toggleOrgRole = (r: string) => {
    setOrgRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  const saveOrgRoles = async () => {
    if (!uid || !orgId || orgRoles.length === 0) return;
    setSavingRoles(true);
    try {
      await apiSetMemberRoles(uid, orgId, orgRoles);
      toast.success(t('admin.users.rolesUpdated', 'Роли обновлены'));
      load();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setSavingRoles(false); }
  };

  const handleRoleChange = async (role: string) => { await adminUpdateUserRole(uid!, role); load(); };
  const handleDisable = async () => { if (!confirm(t('admin.users.confirmDisable'))) return; await adminDisableUser(uid!); load(); };
  const handleEnable = async () => { await adminEnableUser(uid!); load(); };
  const handleReset = async () => {
    if (!user?.email) return;
    try { const res = await adminResetPassword(user.email); toast.success(t('admin.users.resetLinkGenerated', 'Ссылка для сброса пароля создана:\n{{link}}', { link: res.link })); } catch (e: any) { toast.error(t('admin.users.errorWithMessage', 'Ошибка: {{message}}', { message: e.message })); }
  };
  const handleEmailChange = async () => {
    if (!user?.email) return;
    const newEmail = prompt(t('admin.users.emailPrompt', 'Введите новый email адрес (осторожно, это изменит email входа пользователя):'), user.email);
    if (!newEmail || newEmail === user.email || !newEmail.includes('@')) return;
    try {
      await adminUpdateUserEmail(uid!, newEmail);
      toast.success(t('admin.users.emailChanged', 'Email успешно изменен'));
      load();
    } catch (e: any) {
      toast.error(t('admin.users.emailChangeError', 'Ошибка при смене email: {{message}}', { message: e.message }));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!user) return <div className="text-center py-20"><Users className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/admin/users')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/admin/users')} className="btn-ghost inline-flex items-center gap-1.5 -ml-2 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}
      </button>

      {/* Profile */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-4">
        <div className="p-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
          <div className="row-span-2 self-start">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-base font-semibold text-slate-700 dark:text-slate-200">
                {user.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{user.displayName}</h1>
            <div className="text-xs text-slate-500 flex items-center gap-1 group w-fit">
              <Mail className="w-3 h-3" />
              <span>{user.email}</span>
              <button onClick={handleEmailChange} className="ml-1 opacity-0 group-hover:opacity-100 text-primary-500 hover:text-primary-600 transition-opacity" title={t('admin.users.changeEmail', 'Сменить Email')}>
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${ROLE_COLORS[user.role] || ''}`}>{t(`roles.${user.role}`, user.role) as string}</span>
            <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${user.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.disabled ? t('common.disabled') : t('common.active')}</span>
            {user.organizationName && <span className="text-xs text-slate-400">{t('admin.users.organization')}: {user.organizationName}</span>}
            {user.createdAt && <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(user.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Role Change */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3"><Shield className="w-3.5 h-3.5 text-slate-400" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('admin.users.changeRole')}</h2></div>
        <div className="flex gap-2 flex-wrap">
          {['admin', 'teacher', 'student'].map((r) => (
            <button key={r} disabled={user.role === r} onClick={() => handleRoleChange(r)}
              className={`h-8 px-3 rounded-md text-sm font-medium border transition-colors ${user.role === r ? 'bg-primary-100 dark:bg-primary-950 border-primary-200 dark:border-primary-900 text-slate-900 dark:text-slate-100 cursor-not-allowed' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Org roles (multi-role membership) */}
      {orgId && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><Layers className="w-3.5 h-3.5 text-slate-400" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('admin.users.orgRoles', 'Роли в организации')}</h2></div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {t('admin.users.orgRolesHint', 'Выберите одну или несколько ролей. При нескольких — участник сможет переключаться между ними.')}
            {user?.organizationName ? ` (${user.organizationName})` : ''}
          </p>
          {!rolesLoaded ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <>
              <div className="flex gap-2 flex-wrap mb-3">
                {ASSIGNABLE_ROLES.map((r) => {
                  const selected = orgRoles.includes(r);
                  return (
                    <button key={r} onClick={() => toggleOrgRole(r)}
                      className={`h-8 px-3 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${selected ? 'bg-primary-100 dark:bg-primary-950 border-primary-200 dark:border-primary-900 text-slate-900 dark:text-slate-100' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {t(`roles.${r}`, ASSIGNABLE_ROLE_LABELS[r] || r)}
                    </button>
                  );
                })}
              </div>
              <button onClick={saveOrgRoles} disabled={savingRoles || orgRoles.length === 0}
                className="btn-primary inline-flex items-center gap-1.5">
                {savingRoles && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('common.save', 'Сохранить')}
              </button>
              {orgRoles.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{t('admin.users.pickAtLeastOne', 'Выберите хотя бы одну роль.')}</p>}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.users.actions')}</h2>
        <div className="flex flex-wrap gap-2">
          {user.disabled
            ? <button onClick={handleEnable} className="btn-primary inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{t('admin.users.enable')}</button>
            : <button onClick={handleDisable} className="btn-secondary inline-flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />{t('admin.users.disable')}</button>
          }
          <button onClick={handleReset} className="btn-secondary inline-flex items-center gap-1.5"><Key className="w-3.5 h-3.5" />{t('admin.users.resetPassword')}</button>
        </div>
      </div>

      {/* Recent Exams */}
      {user.recentAttempts?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.users.recentExams')}</h2>
          <div className="space-y-2">
            {user.recentAttempts.slice(0, 10).map((a: any) => (
              <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 flex items-center justify-between">
                <div><p className="text-sm font-medium text-slate-900 dark:text-white">{a.examTitle}</p><p className="text-xs text-slate-400">{new Date(a.submittedAt).toLocaleDateString()}</p></div>
                <span className={`text-sm font-semibold tabular-nums ${a.percentage >= 70 ? 'text-emerald-500' : 'text-red-500'}`}>{a.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {user.recentActivity?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mt-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.users.recentActivity', 'Недавняя активность')}</h2>
          <div className="space-y-2">
            {user.recentActivity.slice(0, 10).map((a: any) => (
              <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{a.action}</p>
                  <p className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</p>
                </div>
                <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">{a.entityType}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserDetailPage;
