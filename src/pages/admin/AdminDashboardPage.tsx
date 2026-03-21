import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetAnalytics, adminGetAuditLogs } from '../../lib/api';
import { Building2, Users, DollarSign, TrendingUp, BarChart3, Activity, Globe, Zap } from 'lucide-react';

const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, l] = await Promise.all([adminGetAnalytics(), adminGetAuditLogs({ limit: '10' })]);
        setStats(s);
        setRecentLogs(l);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;
  if (!stats) return <div className="text-center py-20 text-slate-400 dark:text-slate-500">{t('admin.health.failedLoad')}</div>;

  const metrics = [
    { label: t('admin.dashboard.organizations'), value: stats.totalOrganizations, icon: Building2, color: 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400', sub: `${stats.activeOrganizations} ${t('admin.dashboard.active')}` },
    { label: t('admin.dashboard.totalUsers'), value: stats.totalUsers, icon: Users, color: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', sub: `${stats.students} ${t('admin.dashboard.students')}` },
    { label: t('admin.dashboard.mrr'), value: `$${stats.mrr}`, icon: DollarSign, color: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400', sub: `${t('admin.dashboard.arr')}: $${stats.arr}` },
    { label: t('admin.dashboard.totalExams'), value: stats.totalExams, icon: Zap, color: 'bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400', sub: `${stats.totalAttempts} ${t('admin.dashboard.attempts')}` },
    { label: t('admin.dashboard.activeRooms'), value: stats.activeRooms, icon: Globe, color: 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400', sub: `${stats.totalRooms} ${t('admin.dashboard.total')}` },
    { label: t('admin.dashboard.trialOrgs'), value: stats.trialOrgs, icon: TrendingUp, color: 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400', sub: `${stats.suspendedOrganizations} ${t('admin.dashboard.suspended')}` },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.dashboard.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.dashboard.subtitle')}</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.color}`}><m.icon className="w-5 h-5" /></div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{m.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Plan Distribution */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary-500" />{t('admin.dashboard.planDistribution')}</h3>
          <div className="space-y-3">
            {[
              { name: 'Starter', price: '$39', count: stats.planDistribution?.starter || 0, color: 'bg-blue-500' },
              { name: 'Professional', price: '$79', count: stats.planDistribution?.professional || 0, color: 'bg-violet-500' },
              { name: 'Enterprise', price: '$99', count: stats.planDistribution?.enterprise || 0, color: 'bg-amber-500' },
            ].map((p) => {
              const pct = stats.totalOrganizations > 0 ? Math.round((p.count / stats.totalOrganizations) * 100) : 0;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700 dark:text-slate-300">{p.name} ({p.price})</span>
                    <span className="font-medium text-slate-900 dark:text-white">{p.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Growth Trends */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-500" />{t('admin.dashboard.growth')}</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('admin.dashboard.newOrganizations')}</p>
              <div className="flex items-end gap-1 h-16">
                {(stats.orgsByMonth || []).map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary-500 rounded-t" style={{ height: `${Math.max(4, (m.count / Math.max(...(stats.orgsByMonth || []).map((x: any) => x.count), 1)) * 60)}px` }} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{m.month.split('-')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('admin.dashboard.newUsers')}</p>
              <div className="flex items-end gap-1 h-16">
                {(stats.usersByMonth || []).map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${Math.max(4, (m.count / Math.max(...(stats.usersByMonth || []).map((x: any) => x.count), 1)) * 60)}px` }} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{m.month.split('-')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-primary-500" />{t('admin.dashboard.recentActivity')}</h3></div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {recentLogs.map((log) => (
            <div key={log.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">{log.actorName?.[0]?.toUpperCase() || '?'}</div>
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
