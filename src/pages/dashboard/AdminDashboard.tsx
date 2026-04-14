import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap, Users, BookOpen, UsersRound, Settings, Sparkles, GitBranch, MapPin, FileText, Gamepad2, TrendingDown, ClipboardCheck, Bell, Bot, BarChart3 } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import OnboardingWizard, { useOnboardingProgress } from '../../components/onboarding/OnboardingWizard';
import { apiGetBranchAnalytics, apiGetOrganization, apiGetAIManagerSettings, orgGetDashboardStats } from '../../lib/api';

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [branchData, setBranchData] = useState<any>(null);
  const [orgData, setOrgData] = useState<any>(null);
  const [dashStats, setDashStats] = useState<any>(null);

  useEffect(() => {
    const loads: Promise<any>[] = [
      apiGetBranchAnalytics().then(setBranchData).catch(() => {}),
      orgGetDashboardStats().then(setDashStats).catch(() => {}),
    ];
    if (organizationId) {
      loads.push(
        apiGetOrganization(organizationId).then(data => {
          setOrgData(data);
          apiGetAIManagerSettings(organizationId).then(res => {
            if (res.data?.isActive || !!res.data?.telegramBotToken || !!res.data?.customInstructions || !!res.data?.aboutOrganization) {
               setOrgData((prev: any) => ({ ...prev, aiConfigured: true }));
            }
          }).catch(() => {});
        }).catch(() => {})
      );
    }
    Promise.all(loads).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  const stats = [
    { label: t('dashboard.totalStudents', 'Студенты'), value: dashStats?.totalStudents ?? 0, icon: GraduationCap, bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-800/40', iconBg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
    { label: t('dashboard.totalTeachers', 'Преподаватели'), value: dashStats?.totalTeachers ?? 0, icon: Users, bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/50 dark:border-violet-800/40', iconBg: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
    { label: t('dashboard.totalCourses', 'Курсы'), value: dashStats?.totalCourses ?? 0, icon: BookOpen, bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/50 dark:border-emerald-800/40', iconBg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('dashboard.totalGroups', 'Группы'), value: dashStats?.totalGroups ?? 0, icon: UsersRound, bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/50 dark:border-amber-800/40', iconBg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅 ' + t('dashboard.goodMorning', 'Доброе утро') : hour < 18 ? '☀️ ' + t('dashboard.goodAfternoon', 'Добрый день') : '🌙 ' + t('dashboard.goodEvening', 'Добрый вечер');

  const onboardingProps = {
    orgData,
    branchData,
    orgCreatedAt: orgData?.createdAt || profile?.createdAt,
  };
  const onboarding = useOnboardingProgress(onboardingProps);

  return (
    <div className="space-y-6">
      {/* ═══ Unified Hero Banner ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 sm:p-8 text-white">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="relative z-10 flex flex-col gap-5">
          {/* Top row: greeting + create button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{greeting}, {profile?.displayName?.split(' ')[0]}!</h1>
              <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                {t('dashboard.subtitle', 'Управляйте вашим учебным центром')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {typeof window !== 'undefined' && localStorage.getItem('planula_onboarding_admin_dismissed') && (
                <button
                  onClick={() => { localStorage.removeItem('planula_onboarding_admin_dismissed'); window.location.reload(); }}
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] w-fit"
                >
                  <Sparkles className="w-4 h-4" /> Вернуть онбординг
                </button>
              )}
              <Link to="/org-settings" className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] w-fit">
                <Settings className="w-4 h-4" /> Настройки платформы
              </Link>
            </div>
          </div>

          {/* Onboarding progress row (shown only if not all steps done) */}
          {onboarding.visible && (
            <div className="border-t border-white/15 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-medium text-white/80">{t('onboarding.badge')}</span>
              </div>
              <p className="text-white/90 font-semibold text-base">{t('onboarding.title')}</p>
              <p className="text-white/60 text-xs mt-0.5">{t('onboarding.subtitle')}</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 max-w-xs bg-white/20 rounded-full h-2">
                  <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${onboarding.progress}%` }} />
                </div>
                <span className="text-sm font-semibold">{onboarding.completedCount}/{onboarding.totalSteps}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Onboarding step cards */}
      <OnboardingWizard {...onboardingProps} />

      {/* ═══ Quick Links (pages not in sidebar) ═══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">{t('dashboard.quickLinks', 'Быстрый доступ')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[
            { to: '/leads', icon: Bot, label: 'Заявки', color: 'text-primary-500' },
            { to: '/groups', icon: UsersRound, label: t('nav.groups'), color: 'text-violet-500' },
            { to: '/materials', icon: FileText, label: t('nav.materials'), color: 'text-blue-500' },
            { to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary'), color: 'text-pink-500' },
            { to: '/results', icon: BarChart3, label: t('nav.results'), color: 'text-emerald-500' },
            { to: '/risk-dashboard', icon: TrendingDown, label: t('nav.riskDashboard', 'Светофор рисков'), color: 'text-amber-500' },
            { to: '/homework/review', icon: ClipboardCheck, label: t('nav.homeworkReview', 'Проверка ДЗ'), color: 'text-orange-500' },
            { to: '/notifications', icon: Bell, label: t('nav.notifications', 'Уведомления'), color: 'text-rose-500' },
          ].map(link => (
            <Link key={link.to} to={link.to} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors">
              <link.icon className={`w-4 h-4 ${link.color}`} />{link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ═══ Stat Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 sm:p-5 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]`}>
            <div className="flex items-start gap-3">
              <div className={`${s.iconBg} w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-none">{s.value}</p>
                <p className={`text-xs mt-1 ${s.text} font-medium`}>{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Branch Analytics ═══ */}
      {branchData && branchData.branches && branchData.branches.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-500" />
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('dashboard.branchAnalytics', 'Аналитика по филиалам')}</h2>
            </div>
            <span className="text-xs text-slate-400">{branchData.totalBranches} {t('dashboard.branches', 'филиалов')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/50">
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('branches.name', 'Филиал')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('branches.city', 'Город')}</th>
                  <th className="text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('dashboard.students', 'Студенты')}</th>
                  <th className="text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('dashboard.teachers', 'Преподаватели')}</th>
                  <th className="text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('dashboard.courses', 'Курсы')}</th>
                  <th className="text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('dashboard.groups', 'Группы')}</th>
                  <th className="text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('dashboard.exams', 'Экзамены')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {branchData.branches.map((b: any) => (
                  <tr key={b.branchId} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{b.branchName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500">
                      {b.city && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {b.city}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{b.students}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{b.teachers}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{b.courses}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{b.groups}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{b.exams}</span>
                    </td>
                  </tr>
                ))}
                {/* Unassigned row */}
                {branchData.unassigned && (branchData.unassigned.students > 0 || branchData.unassigned.teachers > 0) && (
                  <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{branchData.unassigned.branchName}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-amber-500">—</td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{branchData.unassigned.students}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{branchData.unassigned.teachers}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-amber-600 dark:text-amber-400">{branchData.unassigned.courses}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-amber-600 dark:text-amber-400">{branchData.unassigned.groups}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-amber-600 dark:text-amber-400">{branchData.unassigned.exams}</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}



    </div>
  );
};

export default AdminDashboard;
