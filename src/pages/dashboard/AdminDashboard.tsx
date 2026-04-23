import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap, Users, BookOpen, UsersRound, Settings, Sparkles, GitBranch, MapPin, FileText, Gamepad2, TrendingDown, ClipboardCheck, Bell, Bot, BarChart3, ChevronRight, ArrowUpRight } from 'lucide-react';
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
    { label: t('dashboard.totalStudents', 'Студенты'), value: dashStats?.totalStudents ?? 0, icon: GraduationCap },
    { label: t('dashboard.totalTeachers', 'Преподаватели'), value: dashStats?.totalTeachers ?? 0, icon: Users },
    { label: t('dashboard.totalCourses', 'Курсы'), value: dashStats?.totalCourses ?? 0, icon: BookOpen },
    { label: t('dashboard.totalGroups', 'Группы'), value: dashStats?.totalGroups ?? 0, icon: UsersRound },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t('dashboard.goodMorning', 'Доброе утро')
    : hour < 18
    ? t('dashboard.goodAfternoon', 'Добрый день')
    : t('dashboard.goodEvening', 'Добрый вечер');

  const quickLinks = [
    { to: '/leads', icon: Bot, label: 'Заявки' },
    { to: '/groups', icon: UsersRound, label: t('nav.groups') },
    { to: '/materials', icon: FileText, label: t('nav.materials') },
    { to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') },
    { to: '/results', icon: BarChart3, label: t('nav.results') },
    { to: '/risk-dashboard', icon: TrendingDown, label: t('nav.riskDashboard', 'Светофор рисков') },
    { to: '/homework/review', icon: ClipboardCheck, label: t('nav.homeworkReview', 'Проверка ДЗ') },
    { to: '/notifications', icon: Bell, label: t('nav.notifications', 'Уведомления') },
  ];

  const onboardingProps = {
    orgData,
    branchData,
    orgCreatedAt: orgData?.createdAt || profile?.createdAt,
  };
  const onboarding = useOnboardingProgress(onboardingProps);

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ═══ LEFT: Main Content ═══ */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── Hero Banner (dark, professional) ── */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-800/80 p-6 sm:p-8 border border-slate-800 dark:border-slate-700">
            {/* Subtle grain overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(99,102,241,0.08),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(99,102,241,0.04),transparent_50%)]" />

            <div className="relative z-10 flex flex-col gap-4">
              {/* Greeting */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {greeting}, {profile?.displayName?.split(' ')[0]}
                  </h1>
                  <p className="text-slate-400 text-sm mt-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    {t('dashboard.subtitle', 'Управляйте вашим учебным центром')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {typeof window !== 'undefined' && localStorage.getItem('planula_onboarding_admin_dismissed') && (
                    <button
                      onClick={() => { localStorage.removeItem('planula_onboarding_admin_dismissed'); window.location.reload(); }}
                      className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-all border border-slate-700"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Онбординг
                    </button>
                  )}
                  <Link to="/org-settings" className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-all border border-slate-700">
                    <Settings className="w-3.5 h-3.5" /> Настройки
                  </Link>
                </div>
              </div>

              {/* Onboarding progress (inline, minimal) */}
              {onboarding.visible && (
                <div className="flex items-center gap-4 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-medium text-slate-400">{t('onboarding.badge')}</span>
                  </div>
                  <div className="flex-1 max-w-xs bg-slate-700 rounded-full h-1.5">
                    <div className="bg-indigo-500 rounded-full h-1.5 transition-all duration-500" style={{ width: `${onboarding.progress}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">{onboarding.completedCount}/{onboarding.totalSteps}</span>
                </div>
              )}
            </div>
          </div>

          {/* Onboarding wizard modal */}
          <OnboardingWizard {...onboardingProps} />

          {/* ── Stat Cards (unified dark/slate) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-200 dark:group-hover:bg-slate-600 transition-colors">
                    <s.icon className="w-4.5 h-4.5 text-slate-600 dark:text-slate-300" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">{s.value}</p>
                <p className="text-xs mt-1.5 text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Branch Analytics ── */}
          {branchData && branchData.branches && branchData.branches.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                    <GitBranch className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.branchAnalytics', 'Аналитика по филиалам')}</h2>
                    <p className="text-[11px] text-slate-400">{branchData.totalBranches} {t('dashboard.branches', 'филиалов')}</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700/50">
                      <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('branches.name', 'Филиал')}</th>
                      <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('branches.city', 'Город')}</th>
                      <th className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('dashboard.students', 'Студенты')}</th>
                      <th className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('dashboard.teachers', 'Преподаватели')}</th>
                      <th className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('dashboard.courses', 'Курсы')}</th>
                      <th className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('dashboard.groups', 'Группы')}</th>
                      <th className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{t('dashboard.exams', 'Экзамены')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                    {branchData.branches.map((b: any) => (
                      <tr key={b.branchId} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
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
                      <tr className="bg-slate-50/80 dark:bg-slate-700/10">
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{branchData.unassigned.branchName}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-400">—</td>
                        <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-slate-500">{branchData.unassigned.students}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-slate-500">{branchData.unassigned.teachers}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-400">{branchData.unassigned.courses}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-400">{branchData.unassigned.groups}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-400">{branchData.unassigned.exams}</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Sidebar (Quick Links) ═══ */}
        <div className="lg:w-[260px] xl:w-[280px] shrink-0">
          <div className="lg:sticky lg:top-4 space-y-4">
            {/* Quick Access Panel */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('dashboard.quickLinks', 'Быстрый доступ')}
                </h3>
              </div>
              <div className="p-1.5">
                {quickLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <link.icon className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                      <span>{link.label}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Platform Settings CTA */}
            <Link
              to="/org-settings"
              className="flex items-center justify-between w-full px-4 py-3 bg-slate-900 dark:bg-slate-700 rounded-xl text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-slate-400 group-hover:text-slate-300 transition-colors" />
                <span className="text-sm font-medium">Настройки</span>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
