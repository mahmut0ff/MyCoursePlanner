import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetAnalytics, adminGetAuditLogs } from '../../lib/api';
import {
  Building2, Users, DollarSign, TrendingUp, TrendingDown,
  BarChart3, Activity, Globe, Zap, RefreshCw, Minus,
} from 'lucide-react';

type Period = 'today' | 'week' | 'month';

/* ════════════════════════════════════════════════ */
/*  SPARKLINE SVG — neon glow effect               */
/* ════════════════════════════════════════════════ */
const Sparkline: React.FC<{
  data: number[];
  color: string;
  height?: number;
}> = ({ data, color, height = 48 }) => {
  if (!data.length) return null;
  const width = 120;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `grad-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <filter id={`glow-${id}`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${id})`} />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="1">
          <animate attributeName="r" values="3;4.5;3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
};

/* ════════════════════════════════════════════════ */
/*  CHART SVG — main area chart                    */
/* ════════════════════════════════════════════════ */
const AreaChart: React.FC<{
  datasets: { data: number[]; color: string; label: string }[];
  labels: string[];
  height?: number;
}> = ({ datasets, labels, height = 220 }) => {
  const width = 700;
  const allValues = datasets.flatMap((d) => d.data);
  const max = Math.max(...allValues, 1);

  const getPath = (data: number[]) => {
    const points = data.map((v, i) => ({
      x: (i / Math.max(data.length - 1, 1)) * width,
      y: height - (v / max) * (height - 20) - 10,
    }));
    return {
      line: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '),
      area: `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')} L${width},${height} L0,${height} Z`,
      points,
    };
  };

  const ySteps = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full min-w-[500px]" style={{ height: height + 30 }}>
        <defs>
          {datasets.map((ds, idx) => (
            <React.Fragment key={idx}>
              <linearGradient id={`chart-grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={ds.color} stopOpacity={0} />
              </linearGradient>
              <filter id={`chart-glow-${idx}`}>
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </React.Fragment>
          ))}
        </defs>

        {/* Grid lines */}
        {ySteps.map((step, i) => {
          const y = height - (step / max) * (height - 20) - 10;
          return (
            <React.Fragment key={i}>
              <line x1="0" y1={y} x2={width} y2={y} stroke="currentColor" strokeOpacity="0.06" strokeDasharray="4,4" />
              <text x={-4} y={y + 4} textAnchor="end" className="fill-slate-500 dark:fill-slate-500 text-[10px]">{step}</text>
            </React.Fragment>
          );
        })}

        {/* Datasets */}
        {datasets.map((ds, idx) => {
          const { line, area } = getPath(ds.data);
          return (
            <React.Fragment key={idx}>
              <path d={area} fill={`url(#chart-grad-${idx})`} />
              <path d={line} fill="none" stroke={ds.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter={`url(#chart-glow-${idx})`} />
            </React.Fragment>
          );
        })}

        {/* X labels */}
        {labels.map((lbl, i) => (
          <text key={i} x={(i / Math.max(labels.length - 1, 1)) * width} y={height + 20} textAnchor="middle" className="fill-slate-500 dark:fill-slate-500 text-[10px]">{lbl}</text>
        ))}
      </svg>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  MAIN PAGE                                      */
/* ════════════════════════════════════════════════ */
const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([adminGetAnalytics(), adminGetAuditLogs({ limit: '10' })]);
      setStats(s);
      setRecentLogs(l);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setUpdating(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refresh = () => { setUpdating(true); fetchData(); };

  /* ── Synthetic chart data from API stats ── */
  const chartData = useMemo(() => {
    if (!stats) return { labels: [], orgs: [], users: [], revenue: [] };
    const months = (stats.orgsByMonth || []).map((m: any) => m.month?.split('-')[1] || '');
    const orgCounts = (stats.orgsByMonth || []).map((m: any) => m.count);
    const userCounts = (stats.usersByMonth || []).map((m: any) => m.count);
    const revCounts = orgCounts.map((c: number) => c * (stats.mrr || 39));
    return { labels: months, orgs: orgCounts, users: userCounts, revenue: revCounts };
  }, [stats]);

  /* ── Metric change arrows ── */
  const change = (val: number) => {
    if (val > 0) return { icon: TrendingUp, cls: 'text-emerald-400', txt: `+${val}%` };
    if (val < 0) return { icon: TrendingDown, cls: 'text-red-400', txt: `${val}%` };
    return { icon: Minus, cls: 'text-slate-400', txt: '0%' };
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" />
    </div>
  );
  if (!stats) return <div className="text-center py-20 text-slate-400 dark:text-slate-500">{t('admin.health.failedLoad')}</div>;

  const sparklineData = {
    orgs: (stats.orgsByMonth || []).map((m: any) => m.count),
    users: (stats.usersByMonth || []).map((m: any) => m.count),
  };

  const metrics = [
    {
      label: t('admin.dashboard.organizations'),
      value: stats.totalOrganizations,
      icon: Building2,
      sub: `${stats.activeOrganizations} ${t('admin.dashboard.active')}`,
      chg: change(12),
      glow: 'shadow-primary-500/20 dark:shadow-primary-500/30',
      iconBg: 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-500',
      spark: sparklineData.orgs,
      sparkColor: '#818cf8',
    },
    {
      label: t('admin.dashboard.totalUsers'),
      value: stats.totalUsers,
      icon: Users,
      sub: `${stats.students} ${t('admin.dashboard.students')}`,
      chg: change(87),
      glow: 'shadow-emerald-500/20 dark:shadow-emerald-500/30',
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500',
      spark: sparklineData.users,
      sparkColor: '#34d399',
    },
    {
      label: t('admin.dashboard.mrr'),
      value: `$${stats.mrr}`,
      icon: DollarSign,
      sub: `${t('admin.dashboard.arr')}: $${stats.arr}`,
      chg: change(24),
      glow: 'shadow-amber-500/20 dark:shadow-amber-500/30',
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-500',
      spark: sparklineData.orgs.map((v: number) => v * 39),
      sparkColor: '#fbbf24',
    },
    {
      label: t('admin.dashboard.totalExams'),
      value: stats.totalExams,
      icon: Zap,
      sub: `${stats.totalAttempts} ${t('admin.dashboard.attempts')}`,
      chg: change(0),
      glow: 'shadow-violet-500/20 dark:shadow-violet-500/30',
      iconBg: 'bg-violet-500/10 dark:bg-violet-500/20 text-violet-500',
      spark: sparklineData.users.map((v: number) => v * 2),
      sparkColor: '#a78bfa',
    },
  ];

  const periods: { id: Period; label: string }[] = [
    { id: 'today', label: t('admin.dashboard.today') },
    { id: 'week', label: t('admin.dashboard.thisWeek') },
    { id: 'month', label: t('admin.dashboard.thisMonth') },
  ];

  const insights = [
    { cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '📈', text: `${t('admin.dashboard.insightGrowth')} +87%` },
    { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🎯', text: `${t('admin.dashboard.insightExams')} ${stats.totalAttempts}` },
    { cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '💰', text: `${t('admin.dashboard.insightMrr')} $${stats.mrr}` },
  ];

  return (
    <div>
      {/* ═══ Header with filters ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.dashboard.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('admin.dashboard.subtitle')} · <span className="text-slate-400 dark:text-slate-500">{t('admin.dashboard.lastUpdate')}: {new Date().toLocaleString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className={`p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all ${updating ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  period === p.id
                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Metric Cards — Neon glow ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => {
          const ChgIcon = m.chg.icon;
          return (
            <div key={m.label} className={`bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 hover:shadow-xl ${m.glow} transition-all group backdrop-blur-sm`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{m.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.iconBg} group-hover:scale-110 transition-transform`}>
                  <m.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ChgIcon className={`w-3.5 h-3.5 ${m.chg.cls}`} />
                  <span className={`text-xs font-medium ${m.chg.cls}`}>{m.chg.txt}</span>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{m.sub}</span>
              </div>
              <div className="mt-3 opacity-60 group-hover:opacity-100 transition-opacity">
                <Sparkline data={m.spark} color={m.sparkColor} height={32} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Main Chart ═══ */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 mb-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-500" />{t('admin.dashboard.growth')}
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#818cf8]" /><span className="text-slate-500 dark:text-slate-400">{t('admin.dashboard.organizations')}</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#34d399]" /><span className="text-slate-500 dark:text-slate-400">{t('admin.dashboard.totalUsers')}</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#fbbf24]" /><span className="text-slate-500 dark:text-slate-400">{t('admin.dashboard.mrr')}</span></span>
          </div>
        </div>
        <AreaChart
          datasets={[
            { data: chartData.orgs, color: '#818cf8', label: 'Orgs' },
            { data: chartData.users, color: '#34d399', label: 'Users' },
            { data: chartData.revenue, color: '#fbbf24', label: 'Revenue' },
          ]}
          labels={chartData.labels}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ═══ Plan Distribution ═══ */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-500" />{t('admin.dashboard.planDistribution')}
          </h3>
          <div className="space-y-4">
            {[
              { name: 'Starter', price: '$39', count: stats.planDistribution?.starter || 0, color: 'bg-blue-500', glow: '#3b82f6' },
              { name: 'Professional', price: '$79', count: stats.planDistribution?.professional || 0, color: 'bg-violet-500', glow: '#8b5cf6' },
              { name: 'Enterprise', price: '$99', count: stats.planDistribution?.enterprise || 0, color: 'bg-amber-500', glow: '#f59e0b' },
            ].map((p) => {
              const pct = stats.totalOrganizations > 0 ? Math.round((p.count / stats.totalOrganizations) * 100) : 0;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{p.name} <span className="text-slate-400 dark:text-slate-500 text-xs">({p.price})</span></span>
                    <span className="font-bold text-slate-900 dark:text-white">{p.count} <span className="text-slate-400 dark:text-slate-500 text-xs font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p.color} transition-all duration-700`}
                      style={{ width: `${pct}%`, boxShadow: `0 0 10px ${p.glow}40` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ Quick Stats ═══ */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary-500" />{t('admin.dashboard.platformOverview')}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: t('admin.dashboard.activeRooms'), value: stats.activeRooms, total: stats.totalRooms, color: 'text-sky-500', bg: 'bg-sky-500/10' },
              { label: t('admin.dashboard.trialOrgs'), value: stats.trialOrgs, total: stats.totalOrganizations, color: 'text-rose-500', bg: 'bg-rose-500/10' },
              { label: t('admin.dashboard.teachers'), value: stats.teachers, total: stats.totalUsers, color: 'text-violet-500', bg: 'bg-violet-500/10' },
              { label: t('admin.dashboard.suspended'), value: stats.suspendedOrganizations, total: stats.totalOrganizations, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl p-4`}>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">/ {item.total} {t('admin.dashboard.total')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Smart Insights ═══ */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 mb-6 backdrop-blur-sm">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">⚡ {t('admin.dashboard.smartInsights')}</h3>
        <div className="flex flex-wrap gap-3">
          {insights.map((ins, i) => (
            <span key={i} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${ins.cls}`}>
              <span>{ins.icon}</span>
              {ins.text}
            </span>
          ))}
        </div>
      </div>

      {/* ═══ Recent Activity ═══ */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-primary-500" />{t('admin.dashboard.recentActivity')}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {recentLogs.map((log) => (
            <div key={log.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-primary-500/20">
                {log.actorName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-white"><span className="font-medium">{log.actorName}</span> {log.action?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{log.entityType} · {new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {recentLogs.length === 0 && <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">{t('admin.dashboard.noActivity')}</div>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
