import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetOrgs, adminSuspendOrg, adminActivateOrg } from '../../lib/api';
import { Search, Ban, RotateCcw, ChevronRight } from 'lucide-react';

const PLAN_COLORS: Record<string, string> = { starter: 'bg-blue-100 text-blue-800', professional: 'bg-violet-100 text-violet-800', enterprise: 'bg-amber-100 text-amber-800' };
const STATUS_COLORS: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700', trial: 'bg-amber-100 text-amber-700', deleted: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' };

const AdminOrganizationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<{ organizations: any[]; total: number }>({ organizations: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (search) filters.search = search;
      if (statusFilter) filters.status = statusFilter;
      if (planFilter) filters.plan = planFilter;
      const res = await adminGetOrgs(filters);
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, statusFilter, planFilter]);

  useEffect(() => { load(); }, [load]);



  return (
    <div>
      {/* Left: Table */}
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.orgs.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{data.total} {t('admin.orgs.total')}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder={t('admin.orgs.search')} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">{t('admin.orgs.allStatus')}</option>
            <option value="active">{t('admin.orgs.activate')}</option>
            <option value="suspended">{t('admin.orgs.suspend')}</option>
            <option value="deleted">{t('admin.orgs.delete')}</option>
          </select>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="input w-auto">
            <option value="">{t('admin.orgs.allPlans')}</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.title')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.plan')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.status')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.created')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.orgs.actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.organizations.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer" onClick={() => navigate(`/admin/organizations/${org.id}`)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{org.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{org.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[org.planId] || ''}`}>{org.planId}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[org.status] || ''}`}>{org.status}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {org.status === 'active' && <button onClick={() => { if (confirm(t('admin.orgs.confirmSuspend'))) { adminSuspendOrg(org.id).then(load); } }} className="text-red-400 hover:text-red-600" title={t('admin.orgs.suspend')}><Ban className="w-4 h-4" /></button>}
                      {org.status === 'suspended' && <button onClick={() => { adminActivateOrg(org.id).then(load); }} className="text-emerald-500 hover:text-emerald-700" title={t('admin.orgs.activate')}><RotateCcw className="w-4 h-4" /></button>}
                      <button onClick={() => navigate(`/admin/organizations/${org.id}`)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.organizations.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? t('common.loading') : t('admin.orgs.noOrgs')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOrganizationsPage;
