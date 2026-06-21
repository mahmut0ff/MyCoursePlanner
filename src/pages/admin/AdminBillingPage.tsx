import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetSubscriptions, adminSetSubscription } from '../../lib/api';
import { CreditCard, Banknote, Ban, Clock, Search, Settings2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const PLAN_PRICES: Record<string, number> = { starter: 1990, professional: 4990, enterprise: 14900 };

/** ISO paidUntil → whole days left (negative when overdue), or null. */
const daysLeft = (paidUntil?: string | null): number | null => {
  if (!paidUntil) return null;
  const due = new Date(paidUntil).getTime();
  if (isNaN(due)) return null;
  return Math.ceil((due - Date.now()) / 86_400_000);
};

/** ISO → input[type=date] value (YYYY-MM-DD). */
const toDateInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

type ManageState = { orgId: string; name: string; planId: string; date: string; status: string };

const AdminBillingPage: React.FC = () => {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [manage, setManage] = useState<ManageState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      setSubs(await adminGetSubscriptions(filters));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  let filtered = subs;
  if (search) filtered = subs.filter(s => s.organizationName?.toLowerCase().includes(search.toLowerCase()) || s.organizationId?.includes(search));

  // MRR counts PAYING subscriptions only — trial and gifted generate no revenue.
  const totalMRR = filtered.filter(s => s.status === 'active').reduce((sum, s) => sum + (PLAN_PRICES[s.planId] || 0), 0);
  const activeCount = filtered.filter(s => s.status === 'active').length;
  const trialCount = filtered.filter(s => s.status === 'trial').length;
  const suspendedCount = filtered.filter(s => ['suspended', 'expired', 'cancelled'].includes(s.status)).length;

  const openManage = (s: any) => setManage({
    orgId: s.organizationId,
    name: s.organizationName || s.organizationId,
    planId: s.planId || 'starter',
    date: toDateInput(s.paidUntil),
    status: ['suspended', 'expired', 'cancelled'].includes(s.status) ? 'suspended' : 'active',
  });

  const bumpDate = (days: number) => {
    setManage(m => {
      if (!m) return m;
      const base = m.date ? new Date(m.date) : new Date();
      base.setDate(base.getDate() + days);
      return { ...m, date: base.toISOString().split('T')[0] };
    });
  };

  const handleSave = async () => {
    if (!manage) return;
    setSaving(true);
    try {
      const paidUntil = manage.date ? new Date(`${manage.date}T23:59:59`).toISOString() : null;
      await adminSetSubscription(manage.orgId, {
        planId: manage.planId,
        paidUntil,
        status: manage.status === 'suspended' ? 'suspended' : 'active',
      });
      toast.success(t('common.saved', 'Сохранено'));
      setManage(null);
      load();
    } catch (e: any) { toast.error(e?.message || 'Ошибка'); }
    finally { setSaving(false); }
  };

  const daysBadge = (s: any) => {
    if (s.status === 'gifted') return <span className="text-xs text-violet-500">∞ подарен</span>;
    const d = daysLeft(s.paidUntil);
    if (d === null) return <span className="text-xs text-slate-400">не задано</span>;
    const date = new Date(s.paidUntil).toLocaleDateString();
    const cls = d < 0 ? 'text-red-600 dark:text-red-400' : d <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300';
    const label = d < 0 ? `просрочено ${Math.abs(d)} дн.` : d === 0 ? 'сегодня' : `${d} дн.`;
    return <span className={`text-xs font-medium ${cls}`}>{date} · {label}</span>;
  };

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
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalMRR.toLocaleString()} сом</p>
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
          <div className="flex items-center gap-2 mb-1"><Ban className="w-4 h-4 text-red-500" /><span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.billing.suspended', 'Отключены')}</span></div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{suspendedCount}</p>
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
          <option value="suspended">{t('admin.statuses.suspended', 'Отключён')}</option>
          <option value="expired">{t('admin.statuses.expired', 'Истёк')}</option>
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
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.paidUntil', 'Оплачено до')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.billing.actions')}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 dark:bg-slate-700/50">
                <td className="px-4 py-3"><p className="text-sm font-medium text-slate-900 dark:text-white">{s.organizationName}</p><p className="text-xs text-slate-400 dark:text-slate-500">{s.organizationId?.slice(0, 12)}...</p></td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${s.planId === 'enterprise' ? 'bg-amber-100 text-amber-800' : s.planId === 'professional' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{t(`admin.plans.${s.planId}`) as string}</span></td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{(PLAN_PRICES[s.planId] || 0).toLocaleString()} сом/мес</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'trial' ? 'bg-amber-100 text-amber-700' : s.status === 'gifted' ? 'bg-violet-100 text-violet-700' : 'bg-red-100 text-red-700'}`}>{t(`admin.statuses.${s.status}`) as string}</span></td>
                <td className="px-4 py-3">{daysBadge(s)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openManage(s)} className="inline-flex items-center gap-1.5 text-primary-500 hover:text-primary-700 text-xs font-medium">
                    <Settings2 className="w-3.5 h-3.5" />{t('admin.billing.manage', 'Управление')}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? t('common.loading') : t('admin.billing.noSubs')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Manage Modal */}
      {manage && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setManage(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('admin.billing.manage', 'Управление подпиской')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{manage.name}</p>

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.billing.plan')}</label>
            <select value={manage.planId} onChange={(e) => setManage({ ...manage, planId: e.target.value })} className="input mb-4">
              <option value="starter">{t('admin.plans.starter', 'Базовый')} — 1 990 сом</option>
              <option value="professional">{t('admin.plans.professional', 'Профессиональный')} — 4 990 сом</option>
              <option value="enterprise">{t('admin.plans.enterprise', 'Корпоративный')} — 14 900 сом</option>
            </select>

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.billing.paidUntil', 'Оплачено до')}</label>
            <input type="date" value={manage.date} onChange={(e) => setManage({ ...manage, date: e.target.value })} className="input mb-2" />
            <div className="flex gap-2 mb-4">
              <button onClick={() => bumpDate(30)} className="btn-secondary text-xs py-1">+1 месяц</button>
              <button onClick={() => bumpDate(7)} className="btn-secondary text-xs py-1">+1 неделя</button>
              <button onClick={() => setManage({ ...manage, date: '' })} className="btn-ghost text-xs py-1 text-slate-500">{t('common.clear', 'Очистить')}</button>
            </div>

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('admin.billing.status')}</label>
            <select value={manage.status} onChange={(e) => setManage({ ...manage, status: e.target.value })} className="input mb-5">
              <option value="active">{t('admin.statuses.active', 'Активен')}</option>
              <option value="suspended">{t('admin.statuses.suspended', 'Отключён')}</option>
            </select>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setManage(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBillingPage;
