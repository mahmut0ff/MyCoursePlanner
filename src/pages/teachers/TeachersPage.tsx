import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  orgGetTeachers,
  orgCreateTeacher,
  orgInviteUser,
  apiGetOrgMembers,
  apiAcceptMembership,
  apiRejectMembership,
  orgGetGroups
} from '../../lib/api';
import { usePlanGate } from '../../contexts/PlanContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, Search, Mail, RefreshCw, Send, Phone, CheckCircle, XCircle, Lightbulb, Copy, X, Plus, KeyRound, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import type { UserProfile } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const TeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const { limits } = usePlanGate();
  const { profile, role, organizationId } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'teachers' | 'applications'>('teachers');

  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  // Direct add (create a teacher account with credentials) — mirrors the student add flow
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ displayName: '', phone: '', username: '', password: '' });
  const [giveLogin, setGiveLogin] = useState(true);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);
  // Holds the generated credentials so the manager can hand them to the teacher (shown once).
  const [createdInfo, setCreatedInfo] = useState<{ name: string; username?: string; password?: string } | null>(null);

  // Onboarding hint
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem('teachers_invite_hint_dismissed') === '1');

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem('teachers_invite_hint_dismissed', '1');
  };

  const loadTeachers = async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const data: any = await orgGetTeachers();
      let teachersOnly = (Array.isArray(data) ? data : []).filter(
        (u: any) => u.role === 'teacher'
      );
      if (role === 'student' && profile?.uid) {
        const groups: any[] = await orgGetGroups().catch(() => []);
        const myGroups = groups.filter((g: any) => g.studentIds?.includes(profile.uid));
        const myTeacherIds = new Set(myGroups.flatMap((g: any) => g.teacherIds || []));
        teachersOnly = teachersOnly.filter((t: any) => myTeacherIds.has(t.uid));
      }
      setTeachers(teachersOnly);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadApplications = async (silent = false) => {
    if (!organizationId) return;
    if (!silent) setLoadingApps(true);
    try {
      const apps = await apiGetOrgMembers(organizationId, 'pending', 'teacher');
      setApplications(apps);
    } catch (e: any) {
      if (!silent) toast.error(e.message || t('common.loadError', 'Ошибка загрузки'));
    } finally {
      if (!silent) setLoadingApps(false);
    }
  };

  useEffect(() => {
    loadTeachers();
    loadApplications();
  }, [organizationId]);

  const filtered = teachers.filter((t) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));

  const resetCreateForm = () => {
    setCreateForm({ displayName: '', phone: '', username: '', password: '' });
    setGiveLogin(true);
    setShowCreatePassword(false);
  };

  const handleCreateTeacher = async () => {
    if (!createForm.displayName.trim()) return;

    if (limits.maxTeachers !== -1 && teachers.length >= limits.maxTeachers) {
      toast.error(t('org.settings.maxTeachersReached', 'Достигнут лимит преподавателей для вашего тарифа'));
      return;
    }
    if (giveLogin) {
      if (createForm.username.trim().length < 3) { toast.error(t('org.teachers.usernameTooShort', 'Логин — минимум 3 символа')); return; }
      if (createForm.password.length < 6) { toast.error(t('org.teachers.passwordTooShort', 'Пароль — минимум 6 символов')); return; }
    }
    setCreating(true);
    try {
      const payload: any = {
        displayName: createForm.displayName.trim(),
        phone: createForm.phone,
      };
      if (giveLogin) {
        payload.username = createForm.username.trim().toLowerCase();
        payload.password = createForm.password;
      }
      const res: any = await orgCreateTeacher(payload);
      toast.success(t('org.teachers.created', 'Преподаватель создан!'));
      loadTeachers();
      if (res?.login) {
        // Keep the modal open to show the login the manager can hand to the teacher.
        setCreatedInfo({ name: payload.displayName, username: res.login.username || createForm.username.trim().toLowerCase(), password: createForm.password });
      } else {
        setShowCreateModal(false);
        resetCreateForm();
      }
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    if (limits.maxTeachers !== -1 && teachers.length >= limits.maxTeachers) {
      toast.error(t('org.settings.maxTeachersReached', 'Достигнут лимит преподавателей для вашего тарифа'));
      return;
    }

    setSaving(true); setError('');
    try {
      await orgInviteUser(inviteEmail.trim(), 'teacher');
      setShowInvite(false); setInviteEmail('');
      setSuccess(t('org.teachers.inviteSent')); setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) { setError(e.message || t('common.loadError', 'Ошибка')); }
    finally { setSaving(false); }
  };

  const handleApprove = async (userId: string) => {
    if (!organizationId) return;

    if (limits.maxTeachers !== -1 && teachers.length >= limits.maxTeachers) {
      toast.error(t('org.settings.maxTeachersReached', 'Достигнут лимит преподавателей для вашего тарифа'));
      return;
    }

    try {
      await apiAcceptMembership(userId, organizationId);
      // Optimistic: remove from local list immediately
      setApplications(prev => prev.filter(a => a.userId !== userId));
      toast.success(t('directory.applicationApproved', 'Заявка одобрена!'));
      // Silent background refresh
      loadTeachers(true);
    } catch (e: any) {
      toast.error(e.message);
      loadApplications(true); // Restore real state on error
    }
  };

  const handleReject = async (userId: string) => {
    if (!organizationId) return;
    try {
      await apiRejectMembership(userId, organizationId);
      // Optimistic: remove from local list immediately
      setApplications(prev => prev.filter(a => a.userId !== userId));
      toast.success(t('directory.applicationRejected', 'Заявка отклонена'));
    } catch (e: any) {
      toast.error(e.message);
      loadApplications(true); // Restore real state on error
    }
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('nav.teachers')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {activeTab === 'teachers' ? `${teachers.length} ${t('org.teachers.total')}` : `${applications.length} заявок`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => { loadTeachers(); loadApplications(); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowInvite(true)} className="flex-1 sm:flex-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shrink-0">
            <Mail className="w-4 h-4" />
            {t('org.teachers.invite')}
          </button>
          <button onClick={() => setShowCreateModal(true)} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
            <Plus className="w-4 h-4" />
            {t('org.teachers.add', 'Добавить')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('teachers')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'teachers' ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          Активные преподаватели
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'applications' ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          Заявки
          {applications.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {applications.length}
            </span>
          )}
        </button>
      </div>

      {/* Onboarding Hint for Managers */}
      {!hintDismissed && (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'super_admin') && (
        <div className="mb-6 relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
          <button
            onClick={dismissHint}
            className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={t('common.close', 'Закрыть')}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                {t('org.teachers.hintTitle', 'Как добавить преподавателя?')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">1</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{t('org.teachers.hintAddTitle', 'Добавить напрямую')}</span> — {t('org.teachers.hintAddDesc', 'нажмите «Добавить», введите ФИО и задайте логин с паролем. Передайте эти данные преподавателю — самому регистрироваться не нужно.')}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">2</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{t('org.teachers.hintInviteTitle', 'Пригласить по Email')}</span> — {t('org.teachers.hintInviteDesc', 'если у преподавателя уже есть аккаунт в системе, отправьте приглашение по email кнопкой «Пригласить».')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}
      {success && <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-600 dark:text-emerald-400">{success}</div>}

      {activeTab === 'teachers' && (
        <>
          {/* Unified Filter Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
                className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={search ? 'Преподаватели не найдены' : t('org.teachers.empty')}
              description={search ? 'Попробуйте изменить поисковый запрос' : t('org.teachers.emptyDesc', 'Добавьте первого преподавателя')}
              actionLabel={t('org.teachers.add', 'Добавить')}
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_200px_140px_100px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>{t('nav.teachers')}</span>
                <span>{t('common.email', 'Email')}</span>
                <span>{t('common.phone')}</span>
                <span>{t('org.users.role')}</span>
              </div>

              {filtered.map((teacher) => (
                <div
                  key={teacher.uid}
                  onClick={() => navigate(`/teachers/${teacher.uid}`)}
                  className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_200px_140px_100px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
                >
                  {/* Name + avatar */}
                  <div className="flex items-center gap-3 min-w-0 w-full">
                    {teacher.avatarUrl ? (
                      <img src={teacher.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0 hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">{teacher.displayName?.[0]?.toUpperCase() || '?'}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{teacher.displayName}</h3>
                      {/* Mobile meta */}
                      <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                        {teacher.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{teacher.email}</span>}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">{t('org.teachers.roleTeacher')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{teacher.email}</span>
                  </div>

                  {/* Phone */}
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {teacher.phone ? (
                      <><Phone className="w-3.5 h-3.5 text-slate-400" /><span>{teacher.phone}</span></>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </div>

                  {/* Role */}
                  <div className="hidden md:block">
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">{t('org.teachers.roleTeacher')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'applications' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {loadingApps ? (
            <ListSkeleton rows={4} />
          ) : applications.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="Нет входящих заявок"
              description="Когда преподаватели подадут заявки, они появятся здесь"
            />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_200px_120px_100px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>Сотрудник</span>
                <span>{t('common.email', 'Email')}</span>
                <span>{t('common.date')}</span>
                <span className="text-right">{t('common.actions')}</span>
              </div>
              {applications.map((app) => (
                <div key={app.id} className="flex flex-col md:grid md:grid-cols-[1fr_200px_120px_100px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 w-full">
                    {(app as any).userAvatarUrl ? (
                      <img src={(app as any).userAvatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 bg-violet-500 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0">{app.userName?.[0]?.toUpperCase() || '?'}</div>
                    )}
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{app.userName}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{app.userEmail}</span>
                  </div>
                  <div className="hidden md:block text-[11px] text-slate-500">{new Date(app.createdAt).toLocaleDateString()}</div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleApprove(app.userId)} className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title={t('common.accept')}>
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleReject(app.userId)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors" title={t('common.reject')}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Create Teacher Modal — add a teacher directly, no self-registration */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { if (!creating) { setShowCreateModal(false); setCreatedInfo(null); resetCreateForm(); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {createdInfo ? (
              /* ─── Credentials result: show the login to hand to the teacher ─── */
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.createdTitle', 'Преподаватель создан')}</h2>
                <p className="text-xs text-slate-500 mb-5">{t('org.teachers.createdDesc', 'Передайте преподавателю эти данные для входа. Пароль показывается только сейчас.')}</p>

                {createdInfo.username && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('org.students.loginLabel', 'Логин')}</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{createdInfo.username}</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.username || ''); toast.success(t('common.copied', 'Скопировано')); }} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('auth.password', 'Пароль')}</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{createdInfo.password}</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.password || ''); toast.success(t('common.copied', 'Скопировано')); }} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${t('org.students.loginLabel', 'Логин')}: ${createdInfo.username}\n${t('auth.password', 'Пароль')}: ${createdInfo.password}`); toast.success(t('common.copied', 'Скопировано')); }}
                      className="w-full text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1.5 pt-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> {t('org.students.copyBoth', 'Скопировать логин и пароль')}
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => { setCreatedInfo(null); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('org.students.addAnother', 'Добавить ещё')}</button>
                  <button onClick={() => { setShowCreateModal(false); setCreatedInfo(null); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all">{t('common.done', 'Готово')}</button>
                </div>
              </div>
            ) : (
            <>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-500" />
              {t('org.teachers.createTitle', 'Добавить преподавателя')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">{t('org.teachers.createDescV2', 'Создайте аккаунт преподавателя с логином и паролем. Отключите «Дать доступ», чтобы завести только запись без входа.')}</p>
            <div className="space-y-4">
              {/* ФИО */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.fullName', 'ФИО')} *</label>
                <input autoFocus value={createForm.displayName} onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} placeholder={t('org.teachers.namePlaceholder', 'ФИО преподавателя')} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              {/* Телефон */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('common.phone', 'Телефон')}</label>
                <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>

              {/* ─── Optional login access ─── */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <KeyRound className="w-4 h-4 text-primary-500" />
                    {t('org.teachers.giveLogin', 'Дать доступ в систему')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={giveLogin}
                    onClick={() => setGiveLogin(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${giveLogin ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${giveLogin ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>
                {giveLogin && (
                  <div className="space-y-3 mt-3">
                    <p className="text-[11px] text-slate-400">{t('org.teachers.giveLoginHint', 'Преподаватель сможет войти по этому логину и паролю на странице входа.')}</p>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.loginLabel', 'Логин')} *</label>
                      <input value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="aibek_t" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('auth.password', 'Пароль')} *</label>
                      <div className="relative">
                        <input type={showCreatePassword ? 'text' : 'password'} value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-11 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                        <button type="button" onClick={() => setShowCreatePassword(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                          {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel', 'Отмена')}</button>
              <button onClick={handleCreateTeacher} disabled={creating || !createForm.displayName.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? t('common.loading', 'Добавление...') : t('org.teachers.add', 'Добавить')}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Invite Teacher Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.invite')}</h2>
            <p className="text-xs text-slate-500 mb-6">{t('org.teachers.inviteDesc')}</p>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('org.teachers.inviteEmailPlaceholder')}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowInvite(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                <Send className="w-4 h-4" />
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
