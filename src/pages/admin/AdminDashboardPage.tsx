import React, { useEffect, useState } from 'react';
import { adminGetAnalytics, adminGetAuditLogs } from '../../lib/api';
import { Building2, Users, DollarSign, TrendingUp, BarChart3, Activity, Globe, Zap } from 'lucide-react';

const AdminDashboardPage: React.FC = () => {
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!stats) return <div className="text-center py-20 text-slate-400">Failed to load</div>;

  const metrics = [
    { label: 'Organizations', value: stats.totalOrganizations, icon: Building2, color: 'bg-primary-100 text-primary-600', sub: `${stats.activeOrganizations} active` },
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'bg-emerald-100 text-emerald-600', sub: `${stats.students} students` },
    { label: 'MRR', value: `$${stats.mrr}`, icon: DollarSign, color: 'bg-amber-100 text-amber-600', sub: `ARR: $${stats.arr}` },
    { label: 'Total Exams', value: stats.totalExams, icon: Zap, color: 'bg-violet-100 text-violet-600', sub: `${stats.totalAttempts} attempts` },
    { label: 'Active Rooms', value: stats.activeRooms, icon: Globe, color: 'bg-sky-100 text-sky-600', sub: `${stats.totalRooms} total` },
    { label: 'Trial Orgs', value: stats.trialOrgs, icon: TrendingUp, color: 'bg-rose-100 text-rose-600', sub: `${stats.suspendedOrganizations} suspended` },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm">Platform overview and key metrics</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.color}`}><m.icon className="w-5 h-5" /></div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                <p className="text-xs text-slate-500">{m.label}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Plan Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary-500" />Plan Distribution</h3>
          <div className="space-y-3">
            {[
              { name: 'Starter', price: '$39', count: stats.planDistribution?.starter || 0, color: 'bg-blue-500', total: stats.totalOrganizations },
              { name: 'Professional', price: '$79', count: stats.planDistribution?.professional || 0, color: 'bg-violet-500', total: stats.totalOrganizations },
              { name: 'Enterprise', price: '$99', count: stats.planDistribution?.enterprise || 0, color: 'bg-amber-500', total: stats.totalOrganizations },
            ].map((p) => {
              const pct = stats.totalOrganizations > 0 ? Math.round((p.count / stats.totalOrganizations) * 100) : 0;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700">{p.name} ({p.price})</span>
                    <span className="font-medium text-slate-900">{p.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Growth Trends */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-500" />Growth (Last 6 Months)</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">New Organizations</p>
              <div className="flex items-end gap-1 h-16">
                {(stats.orgsByMonth || []).map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary-500 rounded-t" style={{ height: `${Math.max(4, (m.count / Math.max(...(stats.orgsByMonth || []).map((x: any) => x.count), 1)) * 60)}px` }} />
                    <span className="text-[10px] text-slate-400">{m.month.split('-')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">New Users</p>
              <div className="flex items-end gap-1 h-16">
                {(stats.usersByMonth || []).map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${Math.max(4, (m.count / Math.max(...(stats.usersByMonth || []).map((x: any) => x.count), 1)) * 60)}px` }} />
                    <span className="text-[10px] text-slate-400">{m.month.split('-')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-primary-500" />Recent Activity</h3></div>
        <div className="divide-y">
          {recentLogs.map((log) => (
            <div key={log.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">{log.actorName?.[0]?.toUpperCase() || '?'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900"><span className="font-medium">{log.actorName}</span> {log.action?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-400">{log.entityType} · {new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {recentLogs.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No recent activity</div>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
