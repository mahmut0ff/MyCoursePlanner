import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { usePlanGate } from '../../contexts/PlanContext';
import {
  GraduationCap, UsersRound, Settings, Sparkles, GitBranch, MapPin,
  FileText, Gamepad2, TrendingUp, Bell, Bot, BarChart3, ChevronRight,
  ArrowUpRight, ArrowDownRight, Wallet, UserPlus, AlertTriangle, CreditCard, Inbox,
  CalendarClock, CheckCircle2, Target,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import OnboardingWizard, { useOnboardingProgress } from '../../components/onboarding/OnboardingWizard';
import {
  apiGetBranchAnalytics, apiGetOrganization, apiGetAIManagerSettings, orgGetDashboardStats,
  apiGetDashboardOverview, apiGetFinanceMetrics, orgGetTimetable, orgGetSchedule, apiAIInsightsAsk,
} from '../../lib/api';

type Period = 'current_month' | 'last_month' | 'quarter' | 'year';

const fmt = (n?: number | null) => Number(n || 0).toLocaleString('ru-RU');

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/** App weekday convention: 0 = Mon … 6 = Sun (JS getDay is 0 = Sun). */
const appDayOfWeek = (d = new Date()) => (d.getDay() + 6) % 7;

// ───────────────────────── small presentational helpers ─────────────────────────

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl ${className}`}>
    {children}
  </div>
);

const CardTitle: React.FC<{ icon?: React.ElementType; iconClass?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, iconClass = 'text-slate-400', children, right }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
      {Icon && <Icon className={`w-4 h-4 ${iconClass}`} />}
      {children}
    </h2>
    {right}
  </div>
);

const PctDelta: React.FC<{ cur: number; prev: number }> = ({ cur, prev }) => {
  if (!prev || prev <= 0) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return <span className="text-[11px] text-slate-400 font-medium">без изменений</span>;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      <Icon className="w-3 h-3" /> {Math.abs(pct)}% к прошлому
    </span>
  );
};

const KpiCard: React.FC<{
  label: string; value: string; icon: React.ElementType;
  iconBg: string; sub?: React.ReactNode; to?: string; highlight?: boolean;
}> = ({ label, value, icon: Icon, iconBg, sub, to, highlight }) => {
  const body = (
    <div className={`p-4 sm:p-5 rounded-2xl border h-full transition-all ${highlight
      ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/40'
      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
      <div className="flex items-start justify-between">
        <span className={`text-xs font-medium ${highlight ? 'text-amber-700 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}><Icon className="w-4 h-4" /></span>
      </div>
      <p className="text-2xl sm:text-[27px] font-bold text-slate-900 dark:text-white leading-none tracking-tight mt-3">{value}</p>
      <div className="mt-2 min-h-[16px] flex items-center justify-between">{sub}</div>
    </div>
  );
  return to ? <Link to={to} className="block group">{body}</Link> : body;
};

const Ring: React.FC<{ value: number | null; color: string; label: string }> = ({ value, color, label }) => {
  const r = 26, c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value ?? 0)) / 100) * c;
  return (
    <div className="text-center">
      <svg width="74" height="74" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" className="stroke-slate-100 dark:stroke-slate-700" strokeWidth="7" />
        {value != null && (
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`} transform="rotate(-90 36 36)" />
        )}
        <text x="36" y="41" textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize="16" fontWeight="700">
          {value != null ? `${value}%` : '—'}
        </text>
      </svg>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  );
};

// ───────────────────────────────── main component ─────────────────────────────────

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile, organizationId, role } = useAuth();
  const { canRead } = usePermissions();
  const { canAccess, loading: planLoading } = usePlanGate();
  const canSeeFinance = role === 'admin' || canRead('finances');

  const [loading, setLoading] = useState(true);
  const [branchData, setBranchData] = useState<any>(null);
  const [orgData, setOrgData] = useState<any>(null);
  const [dashStats, setDashStats] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [financeCur, setFinanceCur] = useState<any>(null);
  const [financePrev, setFinancePrev] = useState<any>(null);
  const [today, setToday] = useState<any[]>([]);
  const [aiFocus, setAiFocus] = useState<string>('');

  const [chartPeriod, setChartPeriod] = useState<Period>('current_month');
  const [chartMetrics, setChartMetrics] = useState<any>(null);

  useEffect(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const dow = appDayOfWeek();

    const loads: Promise<any>[] = [
      apiGetBranchAnalytics().then(setBranchData).catch(() => {}),
      orgGetDashboardStats().then(setDashStats).catch(() => {}),
      apiGetDashboardOverview().then(setOverview).catch(() => {}),
      Promise.all([
        orgGetTimetable().catch(() => []),
        orgGetSchedule(todayISO, todayISO).catch(() => []),
      ]).then(([recurring, dated]: any[]) => {
        const todays = [
          ...(Array.isArray(recurring) ? recurring : []).filter((e: any) => e.dayOfWeek === dow),
          ...(Array.isArray(dated) ? dated : []),
        ].sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''));
        setToday(todays);
      }).catch(() => {}),
    ];

    if (canSeeFinance) {
      loads.push(apiGetFinanceMetrics({ period: 'current_month' }).then(setFinanceCur).catch(() => setFinanceCur(null)));
      loads.push(apiGetFinanceMetrics({ period: 'last_month' }).then(setFinancePrev).catch(() => {}));
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cashflow chart period (separate from the at-a-glance KPIs which stay month-to-date).
  useEffect(() => {
    if (!canSeeFinance) return;
    if (chartPeriod === 'current_month') { setChartMetrics(null); return; }
    apiGetFinanceMetrics({ period: chartPeriod }).then(setChartMetrics).catch(() => {});
  }, [chartPeriod, canSeeFinance]);

  // Lazy, cached-per-day AI "focus of the day" — at most one call per owner per day.
  useEffect(() => {
    if (!organizationId || !overview) return;
    if (role !== 'admin' && role !== 'manager') return;
    const key = `dash_focus_${organizationId}_${new Date().toISOString().slice(0, 10)}`;
    const cached = localStorage.getItem(key);
    if (cached) { setAiFocus(cached); return; }
    let cancelled = false;
    apiAIInsightsAsk('Сформулируй один короткий совет владельцу учебного центра: на чём сфокусироваться сегодня. 1–2 предложения, по делу, с конкретными цифрами из данных. Без вступлений.')
      .then((res: any) => {
        const a = res?.data?.answer;
        if (a && !cancelled) { localStorage.setItem(key, a); setAiFocus(a); }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [organizationId, overview, role]);

  if (loading || planLoading) return <DashboardSkeleton />;

  const showFinance = canSeeFinance && canAccess('finances') && !!financeCur;

  // Like-for-like month-over-month: compare current month-to-date against last month
  // up to the same day, computed from last month's daily series.
  const dayOfMonth = new Date().getDate();
  const prevSeries: any[] = financePrev?.chartData || [];
  const prevMTD = prevSeries.filter(r => Number((r.date || '').slice(8, 10)) <= dayOfMonth)
    .reduce((acc, r) => ({ income: acc.income + (r.income || 0), expense: acc.expense + (r.expense || 0) }), { income: 0, expense: 0 });
  const prevMTDProfit = prevMTD.income - prevMTD.expense;

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t('dashboard.goodMorning', 'Доброе утро')
    : hour < 18
    ? t('dashboard.goodAfternoon', 'Добрый день')
    : t('dashboard.goodEvening', 'Добрый вечер');
  const dateLabel = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const studentsNew = overview?.students?.newThisMonth ?? 0;
  const studentsNewPrev = overview?.students?.newLastMonthToDate ?? overview?.students?.newLastMonth ?? 0;
  const studentsDelta = studentsNew - studentsNewPrev;

  // ── Deterministic "focus of the day" (instant; AI line replaces it when ready) ──
  const buildFocus = () => {
    const parts: string[] = [];
    const risk = overview?.risk?.total || 0;
    const overdue = showFinance ? (financeCur?.overdueCount || 0) : 0;
    const newLeads = overview?.leads?.new || 0;
    if (risk) parts.push(`${risk} ${plural(risk, 'ученик', 'ученика', 'учеников')} в зоне риска`);
    if (overdue) parts.push(`${overdue} ${plural(overdue, 'просроченный платёж', 'просроченных платежа', 'просроченных платежей')}`);
    if (!parts.length && newLeads) parts.push(`${newLeads} ${plural(newLeads, 'новая заявка ждёт', 'новые заявки ждут', 'новых заявок ждут')} ответа`);
    let s = parts.length
      ? `Стоит разобрать сегодня: ${parts.join(' и ')}.`
      : 'Всё под контролем — критичных задач на сегодня нет.';
    if (showFinance && prevMTD.income > 0) {
      const pct = Math.round(((financeCur.totalIncome - prevMTD.income) / prevMTD.income) * 100);
      if (pct > 0) s += ` Выручка на ${pct}% выше, чем на эту дату в прошлом месяце.`;
      else if (pct < 0) s += ` Выручка на ${Math.abs(pct)}% ниже, чем на эту дату в прошлом месяце.`;
    }
    return s;
  };
  const focusLine = aiFocus || buildFocus();

  // ── Attention center ──
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-500 dark:bg-red-900/20',
    orange: 'bg-orange-50 text-orange-500 dark:bg-orange-900/20',
    blue: 'bg-blue-50 text-blue-500 dark:bg-blue-900/20',
    slate: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  };
  const attention = [
    // ?tab=debts, а не голый /finances: плитка про долг, а голая ссылка роняла
    // директора на «Обзор», откуда до списка должников ещё один клик.
    showFinance && (financeCur?.overdueCount || 0) > 0 && { icon: CreditCard, color: 'red', label: 'Просроченные платежи', count: financeCur.overdueCount, to: '/finances?tab=debts' },
    // `attention` (churn + debt), not `total` (churn only): this tile links to the
    // students list filtered by the same rule, so the two must show one number.
    (overview?.risk?.attention ?? overview?.risk?.total ?? 0) > 0 && { icon: AlertTriangle, color: 'orange', label: 'Ученики в зоне риска', count: overview.risk.attention ?? overview.risk.total, to: '/students?risk=1' },
    (overview?.leads?.new || 0) > 0 && { icon: Inbox, color: 'blue', label: 'Новые заявки', count: overview.leads.new, to: '/leads' },
    (overview?.pendingHomework || 0) > 0 && { icon: FileText, color: 'slate', label: 'Непроверенные ДЗ', count: overview.pendingHomework, to: '/homework/review' },
  ].filter(Boolean) as { icon: React.ElementType; color: string; label: string; count: number; to: string }[];

  // ── Leads funnel ──
  const leads = overview?.leads || { new: 0, contacted: 0, resolved: 0, total: 0 };
  const funnel = [
    { label: 'Новые', v: leads.new, bar: 'bg-indigo-300 dark:bg-indigo-500/60' },
    { label: 'В работе', v: leads.contacted, bar: 'bg-indigo-400 dark:bg-indigo-500/80' },
    { label: 'Записаны', v: leads.resolved, bar: 'bg-indigo-600' },
  ];
  const funnelMax = Math.max(leads.new, leads.contacted, leads.resolved, 1);
  const conversion = leads.total ? Math.round((leads.resolved / leads.total) * 100) : 0;

  const chartData = (chartPeriod === 'current_month' ? financeCur : chartMetrics)?.chartData || [];
  const PERIODS: { id: Period; label: string }[] = [
    { id: 'current_month', label: 'Месяц' },
    { id: 'last_month', label: 'Прошлый' },
    { id: 'quarter', label: 'Квартал' },
    { id: 'year', label: 'Год' },
  ];

  const FunnelCard = (
    <Card className="p-4 sm:p-5">
      <CardTitle icon={Target} iconClass="text-indigo-500"
        right={<span className="text-[11px] text-slate-400">конверсия {conversion}%</span>}>
        Воронка заявок
      </CardTitle>
      {leads.total === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Заявок пока нет — подключите Telegram-бот для приёма лидов.</p>
      ) : (
        <div className="space-y-3 mt-1">
          {funnel.map(s => (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{s.v}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700/50 overflow-hidden">
                <div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${Math.max((s.v / funnelMax) * 100, s.v > 0 ? 6 : 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const quickLinks = [
    { to: '/leads', icon: Bot, label: 'Заявки' },
    { to: '/materials', icon: FileText, label: t('nav.materials', 'Материалы') },
    { to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary', 'Викторины') },
    { to: '/schedule', icon: CalendarClock, label: t('nav.schedule', 'Расписание') },
    { to: '/teacher-analytics', icon: BarChart3, label: t('nav.analytics', 'Аналитика') },
    { to: '/notifications', icon: Bell, label: t('nav.notifications', 'Уведомления') },
  ];

  const onboardingProps = {
    orgData, branchData, dashStats,
    orgCreatedAt: orgData?.createdAt || profile?.createdAt,
  };
  const onboarding = useOnboardingProgress(onboardingProps);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-800/80 p-6 sm:p-7 border border-slate-800 dark:border-slate-700">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(99,102,241,0.12),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {greeting}, {profile?.displayName?.split(' ')[0]}
              </h1>
              <p className="text-slate-400 text-xs mt-1 capitalize">{dateLabel}</p>
              <div className="mt-3 flex items-start gap-2 bg-slate-800/70 border border-slate-700/60 rounded-xl px-3.5 py-2.5 max-w-2xl">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  <span className="text-indigo-400 font-medium">Фокус дня. </span>{focusLine}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {typeof window !== 'undefined' && localStorage.getItem('planula_onboarding_admin_dismissed') && (
                <button
                  onClick={() => { localStorage.removeItem('planula_onboarding_admin_dismissed'); window.location.reload(); }}
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-all border border-slate-700"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Онбординг
                </button>
              )}
              <Link to="/org-settings" className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-all border border-slate-700">
                <Settings className="w-3.5 h-3.5" /> {t('dashboard.settings', 'Настройки')}
              </Link>
            </div>
          </div>

          {onboarding.visible && (
            <div className="flex items-center gap-4 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-medium text-slate-400">{t('onboarding.badge', 'Настройка')}</span>
              </div>
              <div className="flex-1 max-w-xs bg-slate-700 rounded-full h-1.5">
                <div className="bg-indigo-500 rounded-full h-1.5 transition-all duration-500" style={{ width: `${onboarding.progress}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-300">{onboarding.completedCount}/{onboarding.totalSteps}</span>
            </div>
          )}
        </div>
      </div>

      <OnboardingWizard {...onboardingProps} />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {showFinance ? (
          <>
            <KpiCard label="Выручка за месяц" value={`${fmt(financeCur.totalIncome)} с.`} icon={TrendingUp}
              iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"
              sub={<PctDelta cur={financeCur.totalIncome} prev={prevMTD.income} />} />
            <KpiCard label="Чистая прибыль" value={`${fmt(financeCur.netProfit)} с.`} icon={Wallet}
              iconBg="bg-blue-50 text-blue-600 dark:bg-blue-900/30"
              sub={<>
                <PctDelta cur={financeCur.netProfit} prev={prevMTDProfit} />
                {financeCur.totalIncome > 0 && <span className="text-[11px] text-slate-400">маржа {Math.round((financeCur.netProfit / financeCur.totalIncome) * 100)}%</span>}
              </>} />
            <KpiCard label="Новые ученики" value={fmt(studentsNew)} icon={UserPlus}
              iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30"
              sub={studentsDelta !== 0
                ? <span className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${studentsDelta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {studentsDelta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {studentsDelta > 0 ? '+' : ''}{studentsDelta} к прошлому
                  </span>
                : <span className="text-[11px] text-slate-400">в этом месяце</span>} />
            {/* Плитка про долг ведёт сразу на «Долги», а не на «Обзор». */}
            <KpiCard label="Долги" value={`${fmt(financeCur.outstandingDebt)} с.`} icon={AlertTriangle} highlight to="/finances?tab=debts"
              iconBg="bg-amber-100 text-amber-600 dark:bg-amber-900/40"
              sub={<>
                <span className="text-[11px] text-amber-700 dark:text-amber-500 font-medium">{financeCur.overdueCount || 0} {plural(financeCur.overdueCount || 0, 'просрочка', 'просрочки', 'просрочек')}</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-600/70" />
              </>} />
          </>
        ) : (
          <>
            <KpiCard label={t('dashboard.totalStudents', 'Студенты')} value={fmt(dashStats?.totalStudents ?? overview?.students?.active)} icon={GraduationCap}
              iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30"
              sub={<span className="text-[11px] text-slate-400">активных</span>} />
            <KpiCard label="Новые ученики" value={fmt(studentsNew)} icon={UserPlus}
              iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"
              sub={studentsDelta !== 0
                ? <span className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${studentsDelta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {studentsDelta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {studentsDelta > 0 ? '+' : ''}{studentsDelta} к прошлому
                  </span>
                : <span className="text-[11px] text-slate-400">в этом месяце</span>} />
            <KpiCard label="Средний балл" value={overview?.performance?.avgScore != null ? `${overview.performance.avgScore}%` : '—'} icon={BarChart3}
              iconBg="bg-blue-50 text-blue-600 dark:bg-blue-900/30"
              sub={<span className="text-[11px] text-slate-400">{overview?.performance?.attemptsThisMonth || 0} {plural(overview?.performance?.attemptsThisMonth || 0, 'тест', 'теста', 'тестов')} в этом месяце</span>} />
            <KpiCard label="Посещаемость" value={overview?.attendance?.rateAvg != null ? `${overview.attendance.rateAvg}%` : '—'} icon={UsersRound}
              iconBg="bg-amber-50 text-amber-600 dark:bg-amber-900/30"
              sub={<span className="text-[11px] text-slate-400">средняя по центру</span>} />
          </>
        )}
      </div>

      {/* ── Main row: signature visual + attention center ── */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-[2] min-w-0">
          {showFinance ? (
            <Card className="p-4 sm:p-5 h-full">
              <CardTitle icon={TrendingUp} iconClass="text-emerald-500"
                right={
                  <div className="flex bg-slate-100 dark:bg-slate-700/50 p-0.5 rounded-lg">
                    {PERIODS.map(p => (
                      <button key={p.id} onClick={() => setChartPeriod(p.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${chartPeriod === p.id ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                }>
                Движение средств
              </CardTitle>
              {chartData.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm gap-1">
                  <Wallet className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                  Нет операций за период
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="dExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.15} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={8}
                        tickFormatter={(v: string) => (v || '').slice(8, 10) || v} minTickGap={24} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={44}
                        tickFormatter={(v: any) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#f8fafc' }}
                        itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                        formatter={(v: any, n: any) => [`${fmt(Number(v))} с.`, n === 'income' ? 'Доход' : 'Расход']} />
                      <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} fill="url(#dIncome)" name="income" />
                      <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2.5} fill="url(#dExpense)" name="expense" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          ) : (
            FunnelCard
          )}
        </div>

        {/* Attention center */}
        <div className="flex-1 min-w-0">
          <Card className="p-4 sm:p-5 h-full">
            <CardTitle icon={Bell} iconClass="text-amber-500">Требует внимания</CardTitle>
            {attention.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Всё под контролем.<br />Срочных задач нет.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {attention.map(item => (
                  <Link key={item.label} to={item.to}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                    <span className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[item.color]}`}><item.icon className="w-4 h-4" /></span>
                      <span className="text-[13px] text-slate-700 dark:text-slate-300">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{item.count}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Bottom row: funnel (if finance) / today / learning ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {showFinance && FunnelCard}

        {/* Today */}
        <Card className="p-4 sm:p-5">
          <CardTitle icon={CalendarClock} iconClass="text-indigo-500"
            right={<Link to="/schedule" className="text-[11px] text-indigo-500 hover:text-indigo-600 font-medium">Всё →</Link>}>
            Сегодня
          </CardTitle>
          {today.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">На сегодня занятий нет.</p>
          ) : (
            <div className="space-y-3 mt-1 max-h-[220px] overflow-y-auto">
              {today.slice(0, 6).map((e: any, i: number) => (
                <div key={e.id || i} className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-md px-2 py-1 shrink-0 tabular-nums">{e.startTime || '—'}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{e.title || 'Занятие'}</p>
                    {(e.location || e.groupName || e.teacherName) && (
                      <p className="text-[11px] text-slate-400 truncate">{[e.location, e.groupName, e.teacherName].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Learning metrics */}
        <Card className="p-4 sm:p-5">
          <CardTitle icon={GraduationCap} iconClass="text-slate-400">Показатели обучения</CardTitle>
          <div className="flex items-center justify-around mt-1">
            <Ring value={overview?.performance?.avgScore ?? null} color="#10b981" label="Средний балл" />
            <Ring value={overview?.attendance?.rateAvg ?? null} color="#3b82f6" label="Посещаемость" />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Тестов сдано в этом месяце</span>
            <span className="font-semibold text-slate-900 dark:text-white">{overview?.performance?.attemptsThisMonth ?? 0}</span>
          </div>
        </Card>
      </div>

      {/* ── Branch analytics (secondary) ── */}
      {branchData && branchData.branches && branchData.branches.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.branchAnalytics', 'Аналитика по филиалам')}</h2>
              <p className="text-[11px] text-slate-400">{branchData.totalBranches} {t('dashboard.branches', 'филиалов')}</p>
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
                    <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-slate-900 dark:text-white">{b.students}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm font-semibold text-slate-900 dark:text-white">{b.teachers}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-600 dark:text-slate-300">{b.courses}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-600 dark:text-slate-300">{b.groups}</span></td>
                    <td className="px-4 py-2.5 text-center"><span className="text-sm text-slate-600 dark:text-slate-300">{b.exams}</span></td>
                  </tr>
                ))}
                {branchData.unassigned && (branchData.unassigned.students > 0 || branchData.unassigned.teachers > 0) && (
                  <tr className="bg-slate-50/80 dark:bg-slate-700/10">
                    <td className="px-4 py-2.5"><span className="text-sm font-medium text-slate-500 dark:text-slate-400">{branchData.unassigned.branchName}</span></td>
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
        </Card>
      )}

      {/* ── Quick access ── */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map(link => (
          <Link key={link.to} to={link.to}
            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors">
            <link.icon className="w-4 h-4 text-slate-400" /> {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
