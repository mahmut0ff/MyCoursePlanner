import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetSubscriptions, adminExtendSubscription, adminCancelSubscription } from '../../lib/api';
import { CreditCard, Banknote, Ban, Clock, Search } from 'lucide-react';

const PLAN_PRICES: Record<string, number> = { starter: 1990, professional: 4990, enterprise: 14900 };

const AdminBillingPage: React.FC = () => {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [extendModal, setExtendModal] = useState<{ orgId: string; name: string } | null>(null);
  const [extendDays, setExtendDays] = useState('30');

  const load = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      const res = await adminGetSubscriptions(filters);
      setSubs(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  let filtered = subs;
  if (search) filtered = subs.filter(s => s.organizationName?.toLowerCase().includes(search.toLowerCase()) || s.organizationId?.includes(search));

  const totalMRR = filtered.filter(s => s.status === 'active' || s.status === 'trial').reduce((sum, s) => sum + (PLAN_PRICES[s.planId] || 0), 0);
  const activeCount = filtered.filter(s => s.status === 'active').length;
  const trialCount = filtered.filter(s => s.status === 'trial').length;
  const cancelledCount = filtered.filter(s => s.status === 'cancelled').length;

  const handleCancel = async (orgId: string) => { if (!confirm(t('admin.billing.confirmCancel'))) return; await adminCancelSubscription(orgId); load(); };
  const handleExtend = async () => { if (!extendModal) return; await adminExtendSubscription(extendModal.orgId, parseInt(extendDays)); setExtendModal(null); load(); };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.billing.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.billing.subtitle')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><Banknote className="w-4 h-4 text-emerald-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.billing.mrr')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalMRR} сом</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><CreditCard className="w-4 h-4 text-primary-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.billing.active')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-amber-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.billing.trial')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{trialCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><Ban className="w-4 h-4 text-red-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.billing.cancelled')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{cancelledCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder={t('admin.billing.search')} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="">{t('admin.billing.allStatus')}</option>
          <option value="active">{t('admin.statuses.active')}</option>
          <option value="trial">{t('admin.statuses.trial')}</option>
          <option value="cancelled">{t('admin.statuses.cancelled')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700/50 border-b"><tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.organization')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.plan')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.price')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.status')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.periodEnd')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.actions')}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 dark:bg-slate-700/50">
                <td className="px-4 py-3"><p className="text-sm font-medium text-slate-900 dark:text-white">{s.organizationName}</p><p className="text-xs text-slate-400 dark:text-slate-500">{s.organizationId?.slice(0, 12)}...</p></td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${s.planId === 'enterprise' ? 'bg-amber-100 text-amber-800' : s.planId === 'professional' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{t(`admin.plans.${s.planId}`) as string}</span></td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{PLAN_PRICES[s.planId] || 0} сом/мес</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{t(`admin.statuses.${s.status}`) as string}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setExtendModal({ orgId: s.organizationId, name: s.organizationName })} className="text-primary-500 hover:text-primary-700 text-xs font-medium">{t('admin.billing.extend')}</button>
                    {s.status !== 'cancelled' && <button onClick={() => handleCancel(s.organizationId)} className="text-red-500 hover:text-red-700 text-xs font-medium">{t('admin.billing.cancel')}</button>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? t('common.loading') : t('admin.billing.noSubs')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Extend Modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setExtendModal(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.billing.extendTitle')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{extendModal.name}</p>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.billing.daysToExtend')}</label>
            <input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="input mb-4" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setExtendModal(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleExtend} className="btn-primary text-sm">{t('admin.billing.extend')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBillingPage;
