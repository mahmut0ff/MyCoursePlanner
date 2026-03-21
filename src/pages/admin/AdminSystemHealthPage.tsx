import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetSystemHealth } from '../../lib/api';
import { Server, Wifi, Cpu, Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const STATUS_ICON: Record<string, React.ReactNode> = {
  operational: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  degraded: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  outage: <XCircle className="w-5 h-5 text-red-500" />,
};

const AdminSystemHealthPage: React.FC = () => {
  const { t } = useTranslation();
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setHealth(await adminGetSystemHealth()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!health) return <div className="text-center py-20 text-slate-400 dark:text-slate-500">{t('admin.health.failedLoad')}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.health.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.health.subtitle')}</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4" />{t('admin.health.refresh')}</button>
      </div>

      {/* Overall Status */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${health.status === 'operational' ? 'bg-emerald-100' : 'bg-red-100'}`}>
            {health.status === 'operational' ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> : <XCircle className="w-8 h-8 text-red-500" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white capitalize">{t('admin.health.allOperational')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('admin.health.uptime')}: {health.uptime} · {t('admin.health.avgLatency')}: {health.apiLatency}</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><Cpu className="w-4 h-4 text-primary-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.activeFunctions')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{health.activeFunctions}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><Activity className="w-4 h-4 text-emerald-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.actions24h')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{health.last24hActions}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2"><Wifi className="w-4 h-4 text-violet-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.apiLatency')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{health.apiLatency}</p>
        </div>
      </div>

      {/* Services */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Server className="w-4 h-4" />{t('admin.health.services')}</h3></div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {(health.services || []).map((svc: any, i: number) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {STATUS_ICON[svc.status] || STATUS_ICON.operational}
                <span className="text-sm font-medium text-slate-900 dark:text-white">{svc.name}</span>
              </div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${svc.status === 'operational' ? 'bg-emerald-100 text-emerald-700' : svc.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{svc.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Errors */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />{t('admin.health.recentErrors')}</h3></div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {(health.recentErrors || []).map((err: any) => (
            <div key={err.id} className="px-6 py-3">
              <p className="text-sm text-red-600 font-mono">{err.message || err.error || 'Unknown error'}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{err.source || 'API'} · {err.createdAt ? new Date(err.createdAt).toLocaleString() : '—'}</p>
            </div>
          ))}
          {(health.recentErrors || []).length === 0 && <div className="text-center py-8 text-emerald-500 text-sm flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />{t('admin.health.noErrors')}</div>}
        </div>
      </div>
    </div>
  );
};

export default AdminSystemHealthPage;
