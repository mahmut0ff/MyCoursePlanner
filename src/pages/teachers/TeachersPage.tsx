import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  orgGetTeachers, 
  orgInviteUser,
  apiGetOrgMembers,
  apiAcceptMembership,
  apiRejectMembership,
  orgGetGroups
} from '../../lib/api';
import { usePlanGate } from '../../contexts/PlanContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, Search, Mail, RefreshCw, Send, Phone, CheckCircle, XCircle, Lightbulb, Link as LinkIcon, Copy, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { UserProfile } from '../../types';

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

  // Onboarding hint
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem('teachers_invite_hint_dismissed') === '1');
  const [hintCopied, setHintCopied] = useState(false);

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem('teachers_invite_hint_dismissed', '1');
  };

  // Public invite URL for teachers
  const orgSlug = organizationId || '';
  const publicInviteUrl = orgSlug ? `${window.location.origin}/org/${orgSlug}?role=teacher` : '';

  const copyInviteLink = () => {
    if (!publicInviteUrl) return;
    navigator.clipboard.writeText(publicInviteUrl);
    setHintCopied(true);
    toast.success(t('common.copied', 'Ссылка скопирована!'));
    setTimeout(() => setHintCopied(false), 2000);
  };

  const loadTeachers = async () => {
    setLoading(true);
    setError('');
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
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    if (!organizationId) return;
    setLoadingApps(true);
    try {
      const apps = await apiGetOrgMembers(organizationId, 'pending', 'teacher');
      setApplications(apps);
    } catch (e: any) {
      toast.error(e.message || t('common.loadError', 'Ошибка загрузки'));
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    loadTeachers();
    loadApplications();
  }, [organizationId]);

  const filtered = teachers.filter((t) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));

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
      toast.success(t('directory.applicationApproved', 'Заявка одобрена!'));
      loadApplications();
      loadTeachers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async (userId: string) => {
    if (!organizationId) return;
    try {
      await apiRejectMembership(userId, organizationId);
      toast.success(t('directory.applicationRejected', 'Заявка отклонена'));
      loadApplications();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.teachers')}</h1>
            <p className="text-[11px] text-slate-500">
              {activeTab === 'teachers' ? `${teachers.length} ${t('org.teachers.total')}` : `${applications.length} заявок`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { loadTeachers(); loadApplications(); }} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowInvite(true)} className="bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Mail className="w-3 h-3" />{t('org.teachers.invite')}</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-4">
          <button
            onClick={() => setActiveTab('teachers')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'teachers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Активные преподаватели
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'applications' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
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
          <div className="mb-4 relative overflow-hidden bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 dark:from-violet-900/20 dark:via-purple-900/15 dark:to-indigo-900/10 border border-violet-200/80 dark:border-violet-700/40 rounded-2xl p-4 shadow-sm">
            <button
              onClick={dismissHint}
              className="absolute top-3 right-3 p-1 text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-800/30 rounded-lg transition-colors"
              title={t('common.close', 'Закрыть')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-400/20 dark:bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <h3 className="text-sm font-bold text-violet-900 dark:text-violet-200 mb-2">
                  {t('org.teachers.hintTitle', 'Как пригласить преподавателя?')}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-400/20 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">1</span>
                    <p className="text-xs text-violet-800/80 dark:text-violet-300/80">
                      <span className="font-semibold text-violet-800 dark:text-violet-200">{t('org.teachers.hintWay1Title', 'Пригласить по Email')}</span> — {t('org.teachers.hintWay1Desc', 'нажмите кнопку «Пригласить» вверху и введите email преподавателя. Он получит приглашение в личном кабинете.')}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-400/20 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">2</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-violet-800/80 dark:text-violet-300/80">
                        <span className="font-semibold text-violet-800 dark:text-violet-200">{t('org.teachers.hintWay2Title', 'Отправить ссылку')}</span> — {t('org.teachers.hintWay2Desc', 'поделитесь ссылкой для преподавателей, и они зарегистрируются сами:')}
                      </p>
                      {publicInviteUrl && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="flex items-center gap-1.5 bg-white/80 dark:bg-slate-800/60 border border-violet-200/60 dark:border-violet-700/30 rounded-lg px-2.5 py-1.5 min-w-0 flex-1">
                            <LinkIcon className="w-3 h-3 text-violet-500 shrink-0" />
                            <span className="text-[11px] text-violet-700 dark:text-violet-300 truncate font-mono">{publicInviteUrl}</span>
                          </div>
                          <button
                            onClick={copyInviteLink}
                            className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300/50 dark:border-violet-600/30 transition-colors"
                          >
                            {hintCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {hintCopied ? t('common.copied', 'Скопировано') : t('common.copy', 'Копировать')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-400/20 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">3</span>
                    <p className="text-xs text-violet-800/80 dark:text-violet-300/80">
                      <span className="font-semibold text-violet-800 dark:text-violet-200">{t('org.teachers.hintWay3Title', 'Заявки')}</span> — {t('org.teachers.hintWay3Desc', 'преподаватели, перешедшие по ссылке, появятся во вкладке «Заявки», где вы сможете одобрить или отклонить их.')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}
        {success && <div className="mb-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-500">{success}</div>}

        {activeTab === 'teachers' && (
          <>
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
                    <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">{t('common.phone')}</th>
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
                        <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden md:table-cell">{teacher.phone ? <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{teacher.phone}</div> : <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-500/10 text-violet-500">{t('org.teachers.roleTeacher')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'applications' && (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            {loadingApps ? (
               <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
            ) : applications.length === 0 ? (
               <div className="text-center py-16">
                 <UserPlus className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                 <p className="text-xs text-slate-400">Нет входящих заявок</p>
               </div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Сотрудник</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">{t('common.email', 'Email')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.date')}</th>
                  <th className="text-right text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.actions')}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {(app as any).userAvatarUrl ? (
                            <img src={(app as any).userAvatarUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                          ) : (
                            <div className="w-6 h-6 bg-violet-500 rounded-md flex items-center justify-center text-[9px] text-white font-bold">{app.userName?.[0]?.toUpperCase() || '?'}</div>
                          )}
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{app.userName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden sm:table-cell"><div className="flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[180px]">{app.userEmail}</span></div></td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-500">{new Date(app.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 flex justify-end gap-2">
                        <button onClick={() => handleApprove(app.userId)} className="p-1 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors" title={t('common.accept')}>
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleReject(app.userId)} className="p-1 text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors" title={t('common.reject')}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
