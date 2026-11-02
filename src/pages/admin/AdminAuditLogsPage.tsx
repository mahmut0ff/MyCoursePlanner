import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetAuditLogs } from '../../lib/api';
import { Activity, Search, User, Building2, CreditCard, Settings, ChevronDown } from 'lucide-react';

const ENTITY_ICONS: Record<string, React.ElementType> = { user: User, organization: Building2, subscription: CreditCard, feature_flag: Settings };
const ACTION_COLORS: Record<string, string> = {
  org_created: 'text-emerald-600 bg-emerald-50', org_suspended: 'text-red-600 bg-red-50', org_activated: 'text-blue-600 bg-blue-50',
  org_deleted: 'text-red-600 bg-red-50', org_updated: 'text-amber-600 bg-amber-50', user_role_changed: 'text-violet-600 bg-violet-50',
  user_disabled: 'text-red-600 bg-red-50', user_enabled: 'text-emerald-600 bg-emerald-50', plan_changed: 'text-amber-600 bg-amber-50',
  subscription_extended: 'text-blue-600 bg-blue-50', subscription_cancelled: 'text-red-600 bg-red-50', password_reset: 'text-amber-600 bg-amber-50',
  feature_flag_set: 'text-violet-600 bg-violet-50', org_override_set: 'text-indigo-600 bg-indigo-50',
};

const AdminAuditLogsPage: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (search) filters.search = search;
      if (entityFilter) filters.entityType = entityFilter;
      const res = await adminGetAuditLogs(filters);
      setLogs(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [entityFilter]);

  const filteredLogs = search ? logs.filter(l =>
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.actorName?.toLowerCase().includes(search.toLowerCase()) ||
    l.entityId?.toLowerCase().includes(search.toLowerCase())
  ) : logs;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('admin.audit.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs">{t('admin.audit.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="input pl-8" placeholder={t('admin.audit.search')} />
        </div>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="input w-auto">
          <option value="">{t('admin.audit.allEntities')}</option>
          <option value="organization">{t('admin.audit.filterOrgs')}</option>
          <option value="user">{t('admin.audit.filterUsers')}</option>
          <option value="subscription">{t('admin.audit.filterSubs')}</option>
          <option value="feature_flag">{t('admin.audit.filterFlags')}</option>
        </select>
        <button onClick={load} className="btn-secondary">{t('admin.audit.refresh')}</button>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredLogs.map((log) => {
            const Icon = ENTITY_ICONS[log.entityType] || Activity;
            const colors = ACTION_COLORS[log.action] || 'text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50';
            const isExpanded = expanded === log.id;

            return (
              <div key={log.id}>
                <div className="min-h-[40px] px-3 py-1.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : log.id)}>
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colors}`}><Icon className="w-3.5 h-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-white"><span className="font-medium">{log.actorName || 'System'}</span> <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${colors}`}>{log.action?.replace(/_/g, ' ')}</span></p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{log.entityType} <span className="text-slate-300">·</span> {log.entityId?.slice(0, 20)} <span className="text-slate-300">·</span> {new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 bg-slate-50 dark:bg-slate-800/60">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {log.before && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.audit.before')}</p>
                          <pre className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-2.5 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto max-h-32">{JSON.stringify(log.before, null, 2)}</pre>
                        </div>
                      )}
                      {log.after && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.audit.after')}</p>
                          <pre className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-2.5 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto max-h-32">{JSON.stringify(log.after, null, 2)}</pre>
                        </div>
                      )}
                      {log.metadata && (
                        <div className="md:col-span-2">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.audit.metadata')}</p>
                          <pre className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-2.5 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredLogs.length === 0 && <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? t('common.loading') : t('admin.audit.noLogs')}</div>}
        </div>
      </div>
    </div>
  );
};

export default AdminAuditLogsPage;
