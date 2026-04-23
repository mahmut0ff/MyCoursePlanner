import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetPlatformStats, apiGetOrganizations, apiGetSystemLogs, apiUpdateOrganization, apiDeleteOrganization } from '../../lib/api';
import { Building2, Users, DollarSign, TrendingUp, BarChart3, Shield, Activity, Ban, RotateCcw } from 'lucide-react';

const SuperAdminDashboard: React.FC = () => {
  const { t } = useTranslation();
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
    if (!confirm(t('admin.orgs.confirmSuspend', 'Приостановить эту организацию?'))) return;
    await apiDeleteOrganization(orgId);
    loadData();
  };

  const handleReactivate = async (orgId: string) => {
    await apiUpdateOrganization({ id: orgId, status: 'active' });
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;

  const tabLabels: Record<string, string> = {
    overview: t('admin.tabs.overview', 'Обзор'),
    orgs: t('admin.tabs.organizations', 'Организации'),
    logs: t('admin.tabs.logs', 'Системные логи'),
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.dashboard.title', 'Администрирование платформы')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.dashboard.subtitle', 'Управление организациями и настройками платформы')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 w-fit">
        {(['overview', 'orgs', 'logs'] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === tabKey ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {tabLabels[tabKey]}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" /></div>
                <div><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalOrganizations}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.stats.organizations', 'Организации')}</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                <div><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalUsers}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.stats.totalUsers', 'Всего пользователей')}</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                <div><p className="text-2xl font-bold text-slate-900 dark:text-white">${stats.monthlyRevenue}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.stats.monthlyRevenue', 'Доход / мес')}</p></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-violet-600 dark:text-violet-400" /></div>
                <div><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalExams}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.stats.totalExams', 'Всего экзаменов')}</p></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Distribution */}
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-500" />{t('admin.stats.planDistribution', 'Распределение тарифов')}</h3>
              <div className="space-y-3">
                {[
                  { name: 'Starter ($39)', count: stats.planDistribution?.starter || 0, color: 'bg-blue-500' },
                  { name: 'Professional ($79)', count: stats.planDistribution?.professional || 0, color: 'bg-violet-500' },
                  { name: 'Enterprise ($99)', count: stats.planDistribution?.enterprise || 0, color: 'bg-amber-500' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${p.color}`} />
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{p.name}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{p.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{t('admin.stats.trialOrgs', 'Пробный период')}</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{stats.trialOrgs}</span>
                </div>
              </div>
            </div>

            {/* User Breakdown */}
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-primary-500" />{t('admin.stats.userBreakdown', 'Состав пользователей')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600 dark:text-slate-400">{t('admin.stats.students', 'Студенты')}</span><span className="font-semibold text-slate-900 dark:text-white">{stats.totalStudents}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600 dark:text-slate-400">{t('admin.stats.teachers', 'Преподаватели')}</span><span className="font-semibold text-slate-900 dark:text-white">{stats.totalTeachers}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-600 dark:text-slate-400">{t('admin.stats.admins', 'Директора')}</span><span className="font-semibold text-slate-900 dark:text-white">{stats.totalAdmins}</span></div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('admin.stats.totalAttempts', 'Всего попыток')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{stats.totalAttempts}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'orgs' && (
        <div className="card overflow-hidden">
          {/* Mobile: card view */}
          <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
            {orgs.map((org) => (
              <div key={org.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-white truncate">{org.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{org.ownerEmail}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                      org.planId === 'enterprise' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                      org.planId === 'professional' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                    }`}>{org.planId}</span>
                    <span className={org.status === 'active' ? 'badge-green' : 'badge-red'}>{org.status}</span>
                  </div>
                </div>
                <div className="shrink-0">
                  {org.status === 'active' ? (
                    <button onClick={() => handleSuspend(org.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t('admin.orgs.suspend', 'Приостановить')}><Ban className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => handleReactivate(org.id)} className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title={t('admin.orgs.reactivate', 'Активировать')}><RotateCcw className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
            {orgs.length === 0 && <div className="text-center py-8 text-slate-400">{t('admin.orgs.empty', 'Организаций пока нет')}</div>}
          </div>

          {/* Desktop: table view */}
          <table className="w-full hidden sm:table">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"><tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.organization', 'Организация')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.plan', 'Тариф')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('common.status', 'Статус')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase hidden md:table-cell">{t('admin.orgs.users', 'Пользователи')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('common.actions', 'Действия')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900 dark:text-white">{org.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{org.ownerEmail}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      org.planId === 'enterprise' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                      org.planId === 'professional' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                    }`}>{org.planId}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={org.status === 'active' ? 'badge-green' : 'badge-red'}>{org.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 hidden md:table-cell">{org.studentsCount}s / {org.teachersCount}t</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {org.status === 'active' ? (
                        <button onClick={() => handleSuspend(org.id)} className="text-red-500 hover:text-red-700 dark:hover:text-red-400" title={t('admin.orgs.suspend', 'Приостановить')}><Ban className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={() => handleReactivate(org.id)} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400" title={t('admin.orgs.reactivate', 'Активировать')}><RotateCcw className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('admin.orgs.empty', 'Организаций пока нет')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {logs.map((log) => (
              <div key={log.id} className="px-4 sm:px-6 py-3 flex items-center gap-4">
                <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 dark:text-white"><span className="font-medium">{log.actorName}</span> — {log.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div className="text-center py-8 text-slate-400">{t('admin.logs.empty', 'Логов пока нет')}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
