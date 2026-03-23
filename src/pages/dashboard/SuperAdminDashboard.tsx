import React, { useEffect, useState } from 'react';
import { apiGetPlatformStats, apiGetOrganizations, apiGetSystemLogs, apiUpdateOrganization, apiDeleteOrganization } from '../../lib/api';
import { Building2, Users, DollarSign, TrendingUp, BarChart3, Shield, Activity, Ban, RotateCcw } from 'lucide-react';

const SuperAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'orgs' | 'logs'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, o, l] = await Promise.all([
        apiGetPlatformStats(), apiGetOrganizations(), apiGetSystemLogs(),
      ]);
      setStats(s);
      setOrgs(o);
      setLogs(l);
    } catch (e) {
      console.error('Failed to load platform data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (orgId: string) => {
    if (!confirm('Suspend this organization?')) return;
    await apiDeleteOrganization(orgId);
    loadData();
  };

  const handleReactivate = async (orgId: string) => {
    await apiUpdateOrganization({ id: orgId, status: 'active' });
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
          <p className="text-slate-500 text-sm">Manage all organizations and platform settings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        {(['overview', 'orgs', 'logs'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'overview' ? 'Overview' : t === 'orgs' ? 'Organizations' : 'System Logs'}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-primary-600" /></div>
                <div><p className="text-2xl font-bold text-slate-900">{stats.totalOrganizations}</p><p className="text-xs text-slate-500">Organizations</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-emerald-600" /></div>
                <div><p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p><p className="text-xs text-slate-500">Total Users</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-amber-600" /></div>
                <div><p className="text-2xl font-bold text-slate-900">${stats.monthlyRevenue}</p><p className="text-xs text-slate-500">Monthly Revenue</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-violet-600" /></div>
                <div><p className="text-2xl font-bold text-slate-900">{stats.totalExams}</p><p className="text-xs text-slate-500">Total Exams</p></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Distribution */}
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-500" />Plan Distribution</h3>
              <div className="space-y-3">
                {[
                  { name: 'Starter ($39)', count: stats.planDistribution?.starter || 0, color: 'bg-blue-500' },
                  { name: 'Professional ($79)', count: stats.planDistribution?.professional || 0, color: 'bg-violet-500' },
                  { name: 'Enterprise ($99)', count: stats.planDistribution?.enterprise || 0, color: 'bg-amber-500' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${p.color}`} />
                    <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                    <span className="font-semibold text-slate-900">{p.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Trial orgs</span>
                  <span className="font-medium text-amber-600">{stats.trialOrgs}</span>
                </div>
              </div>
            </div>

            {/* User Breakdown */}
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-primary-500" />User Breakdown</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Students</span><span className="font-semibold">{stats.totalStudents}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Teachers</span><span className="font-semibold">{stats.totalTeachers}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Admins</span><span className="font-semibold">{stats.totalAdmins}</span></div>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
                <span className="text-slate-500">Total Attempts</span>
                <span className="font-semibold">{stats.totalAttempts}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'orgs' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b bg-slate-50"><tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Organization</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plan</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Users</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{org.name}</p>
                    <p className="text-xs text-slate-500">{org.ownerEmail}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      org.planId === 'enterprise' ? 'bg-amber-100 text-amber-800' :
                      org.planId === 'professional' ? 'bg-violet-100 text-violet-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>{org.planId}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={org.status === 'active' ? 'badge-green' : 'badge-red'}>{org.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{org.studentsCount}s / {org.teachersCount}t</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {org.status === 'active' ? (
                        <button onClick={() => handleSuspend(org.id)} className="text-red-500 hover:text-red-700" title="Suspend"><Ban className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={() => handleReactivate(org.id)} className="text-emerald-500 hover:text-emerald-700" title="Reactivate"><RotateCcw className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">No organizations yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card overflow-hidden">
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-3 flex items-center gap-4">
                <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900"><span className="font-medium">{log.actorName}</span> — {log.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div className="text-center py-8 text-slate-400">No logs yet</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
