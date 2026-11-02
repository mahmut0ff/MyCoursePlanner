import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetSystemHealth } from '../../lib/api';
import { Server, Wifi, Cpu, Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const STATUS_ICON: Record<string, React.ReactNode> = {
  operational: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  degraded: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  outage: <XCircle className="w-4 h-4 text-red-500" />,
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!health) return <div className="text-center py-20 text-slate-400 dark:text-slate-500">{t('admin.health.failedLoad')}</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('admin.health.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('admin.health.subtitle')}</p>
        </div>
        <button onClick={load} className="btn-secondary w-full sm:w-auto inline-flex justify-center items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />{t('admin.health.refresh')}</button>
      </div>

      {/* Overall Status */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 shrink-0 rounded-md flex items-center justify-center ${health.status === 'operational' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
            {health.status === 'operational' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white capitalize">{t('admin.health.allOperational')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.uptime')}: {health.uptime} · {t('admin.health.avgLatency')}: {health.apiLatency}</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2"><Cpu className="w-3.5 h-3.5 text-slate-400" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.activeFunctions')}</span></div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{health.activeFunctions}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2"><Activity className="w-3.5 h-3.5 text-slate-400" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.actions24h')}</span></div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{health.last24hActions}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2"><Wifi className="w-3.5 h-3.5 text-slate-400" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.health.apiLatency')}</span></div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{health.apiLatency}</p>
        </div>
      </div>

      {/* Services */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Server className="w-3.5 h-3.5 text-slate-400" />{t('admin.health.services')}</h3></div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {(health.services || []).map((svc: any, i: number) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="shrink-0">{STATUS_ICON[svc.status] || STATUS_ICON.operational}</div>
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{svc.name}</span>
              </div>
              <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium shrink-0 capitalize ${svc.status === 'operational' ? 'bg-emerald-100 text-emerald-700' : svc.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{svc.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Errors */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />{t('admin.health.recentErrors')}</h3></div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
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
