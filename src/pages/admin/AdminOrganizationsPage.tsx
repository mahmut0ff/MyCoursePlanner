import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetOrgs, adminSuspendOrg, adminActivateOrg, adminCreateOrg } from '../../lib/api';
import { Search, Ban, RotateCcw, ChevronRight, Plus, X, Copy, Check, Loader2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreatedOrgInfo {
  orgName: string;
  ownerEmail: string;
  tempPassword: string;
}

const CreateOrgModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [planId, setPlanId] = useState('starter');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreatedOrgInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setError('Заполните все поля'); return;
    }
    setSubmitting(true);
    try {
      const res = await adminCreateOrg({ name: name.trim(), ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim().toLowerCase(), planId });
      setResult({ orgName: name.trim(), ownerEmail: ownerEmail.trim().toLowerCase(), tempPassword: res.tempPassword || '' });
      onCreated();
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать организацию');
    } finally { setSubmitting(false); }
  };

  const copyCredentials = async () => {
    if (!result) return;
    const text = `Учебный центр: ${result.orgName}\nEmail: ${result.ownerEmail}\nВременный пароль: ${result.tempPassword}\nВход: ${window.location.origin}/login`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {result ? 'Организация создана' : 'Новая организация'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">Сохраните пароль сейчас</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Этот пароль показывается ровно один раз. После закрытия окна его нельзя будет восстановить — только сбросить.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm">
              <div><span className="text-slate-500">Центр:</span> <span className="font-semibold text-slate-900 dark:text-white">{result.orgName}</span></div>
              <div><span className="text-slate-500">Email:</span> <span className="font-mono text-slate-900 dark:text-white">{result.ownerEmail}</span></div>
              <div><span className="text-slate-500">Пароль:</span> <span className="font-mono text-slate-900 dark:text-white select-all">{result.tempPassword}</span></div>
            </div>

            <button onClick={copyCredentials} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-semibold">
              {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Скопировано</> : <><Copy className="w-4 h-4" /> Скопировать данные</>}
            </button>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors">
              Готово
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Создаём организацию и аккаунт владельца. Сервер сгенерирует временный пароль — вы передадите его владельцу.
            </p>
            <div>
              <label className="label">Название центра</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Например, Билим Академия" autoFocus />
            </div>
            <div>
              <label className="label">Имя владельца</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="input" placeholder="Айбек Турсунов" />
            </div>
            <div>
              <label className="label">Email владельца</label>
              <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="input" placeholder="aibek@example.kg" />
            </div>
            <div>
              <label className="label">Тариф</label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
                <option value="starter">Starter (14 дней trial)</option>
                <option value="professional">Professional (3 дня trial)</option>
                <option value="enterprise">Enterprise (3 дня trial)</option>
              </select>
            </div>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold text-sm transition-colors">
                Отмена
              </button>
              <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Создаём…</> : 'Создать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const PLAN_COLORS: Record<string, string> = { starter: 'bg-blue-100 text-blue-800', professional: 'bg-violet-100 text-violet-800', enterprise: 'bg-amber-100 text-amber-800' };
const STATUS_COLORS: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700', trial: 'bg-amber-100 text-amber-700', deleted: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' };

const AdminOrganizationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<{ organizations: any[]; total: number }>({ organizations: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
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
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.orgs.title')}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{data.total} {t('admin.orgs.total')}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow-lg shadow-primary-500/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Создать организацию
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder={t('admin.orgs.search')} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">{t('admin.orgs.allStatus')}</option>
            <option value="active">{t('admin.statuses.active')}</option>
            <option value="suspended">{t('admin.statuses.suspended')}</option>
            <option value="deleted">{t('admin.statuses.deleted')}</option>
          </select>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="input w-auto">
            <option value="">{t('admin.orgs.allPlans')}</option>
            <option value="starter">{t('admin.plans.starter')}</option>
            <option value="professional">{t('admin.plans.professional')}</option>
            <option value="enterprise">{t('admin.plans.enterprise')}</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
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
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[org.planId] || ''}`}>{t(`admin.plans.${org.planId}`) as string}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[org.status] || ''}`}>{t(`admin.statuses.${org.status}`) as string}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {org.status === 'active' && <button onClick={() => { if (confirm(t('admin.orgs.confirmSuspend'))) { adminSuspendOrg(org.id).then(load).catch((e: any) => toast.error(e.message || t('common.error'))); } }} className="text-red-400 hover:text-red-600" title={t('admin.orgs.suspend')}><Ban className="w-4 h-4" /></button>}
                      {org.status === 'suspended' && <button onClick={() => { adminActivateOrg(org.id).then(load).catch((e: any) => toast.error(e.message || t('common.error'))); }} className="text-emerald-500 hover:text-emerald-700" title={t('admin.orgs.activate')}><RotateCcw className="w-4 h-4" /></button>}
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

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  );
};

export default AdminOrganizationsPage;
