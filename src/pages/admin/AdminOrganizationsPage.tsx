import React, { useEffect, useState, useCallback } from 'react';
import { adminGetOrgs, adminGetOrg, adminSuspendOrg, adminActivateOrg, adminDeleteOrg, adminAddOrgNote, adminChangePlan } from '../../lib/api';
import { Search, Ban, RotateCcw, Trash2, X, ChevronRight } from 'lucide-react';

const PLAN_COLORS: Record<string, string> = { starter: 'bg-blue-100 text-blue-800', professional: 'bg-violet-100 text-violet-800', enterprise: 'bg-amber-100 text-amber-800' };
const STATUS_COLORS: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700', trial: 'bg-amber-100 text-amber-700', deleted: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500' };

const AdminOrganizationsPage: React.FC = () => {
  const [data, setData] = useState<{ organizations: any[]; total: number }>({ organizations: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteText, setNoteText] = useState('');

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

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const org = await adminGetOrg(id);
      setSelected(org);
    } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  };

  const handleSuspend = async (id: string) => { if (!confirm('Suspend this organization? Their users will lose access.')) return; await adminSuspendOrg(id); load(); setSelected(null); };
  const handleActivate = async (id: string) => { await adminActivateOrg(id); load(); setSelected(null); };
  const handleDelete = async (id: string) => { if (!confirm('Permanently delete this organization?')) return; await adminDeleteOrg(id); load(); setSelected(null); };
  const handleChangePlan = async (orgId: string, planId: string) => { await adminChangePlan(orgId, planId); openDetail(orgId); load(); };
  const handleAddNote = async () => { if (!noteText.trim() || !selected) return; await adminAddOrgNote(selected.id, noteText); setNoteText(''); openDetail(selected.id); };

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Left: Table */}
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500 text-sm">{data.total} organizations total</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search organizations..." />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="input w-auto">
            <option value="">All Plans</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Organization</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Created</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.organizations.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50 dark:bg-slate-700/50 cursor-pointer" onClick={() => openDetail(org.id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{org.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{org.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[org.planId] || ''}`}>{org.planId}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[org.status] || ''}`}>{org.status}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {org.status === 'active' && <button onClick={() => handleSuspend(org.id)} className="text-red-400 hover:text-red-600" title="Suspend"><Ban className="w-4 h-4" /></button>}
                      {org.status === 'suspended' && <button onClick={() => handleActivate(org.id)} className="text-emerald-500 hover:text-emerald-700" title="Activate"><RotateCcw className="w-4 h-4" /></button>}
                      <button onClick={() => openDetail(org.id)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:text-slate-500"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.organizations.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? 'Loading...' : 'No organizations found'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selected && (
        <div className="w-full lg:w-[440px] lg:ml-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50 dark:bg-slate-700/50">
            <h2 className="font-semibold text-slate-900 dark:text-white truncate">{selected.name}</h2>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:text-slate-500"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {detailLoading ? <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div> : (
              <>
                {/* Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500 text-xs">Status</p><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selected.status] || ''}`}>{selected.status}</span></div>
                  <div><p className="text-slate-500 text-xs">Plan</p><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[selected.planId] || ''}`}>{selected.planId}</span></div>
                  <div><p className="text-slate-500 text-xs">Owner</p><p className="font-medium text-slate-900 dark:text-white truncate">{selected.ownerEmail}</p></div>
                  <div><p className="text-slate-500 text-xs">Created</p><p className="font-medium text-slate-900">{new Date(selected.createdAt).toLocaleDateString()}</p></div>
                </div>

                {/* Usage */}
                {selected.usage && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Usage</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Students', value: selected.usage.students },
                        { label: 'Teachers', value: selected.usage.teachers },
                        { label: 'Admins', value: selected.usage.admins },
                        { label: 'Lessons', value: selected.usage.lessons },
                        { label: 'Exams', value: selected.usage.exams },
                        { label: 'Attempts', value: selected.usage.attempts },
                      ].map((u) => (
                        <div key={u.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-center">
                          <p className="text-lg font-bold text-slate-900">{u.value}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{u.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plan Change */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Change Plan</h4>
                  <div className="flex gap-2">
                    {['starter', 'professional', 'enterprise'].map((p) => (
                      <button key={p} disabled={selected.planId === p} onClick={() => handleChangePlan(selected.id, p)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selected.planId === p ? 'bg-primary-100 text-primary-700 cursor-not-allowed' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-200'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'active' && <button onClick={() => handleSuspend(selected.id)} className="btn-secondary text-xs flex items-center gap-1"><Ban className="w-3 h-3" />Suspend</button>}
                    {selected.status !== 'active' && <button onClick={() => handleActivate(selected.id)} className="btn-primary text-xs flex items-center gap-1"><RotateCcw className="w-3 h-3" />Activate</button>}
                    <button onClick={() => handleDelete(selected.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"><Trash2 className="w-3 h-3" />Delete</button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Internal Notes</h4>
                  <div className="flex gap-2 mb-3">
                    <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} className="input text-sm flex-1" placeholder="Add a note..." />
                    <button onClick={handleAddNote} className="btn-primary text-xs px-3">Add</button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {(selected.notes || []).map((n: any) => (
                      <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <p className="text-sm text-slate-800">{n.note}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subscription */}
                {selected.subscription && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Subscription</h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-medium capitalize">{selected.subscription.status}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Period End</span><span className="font-medium">{new Date(selected.subscription.currentPeriodEnd).toLocaleDateString()}</span></div>
                      {selected.subscription.trialEndsAt && <div className="flex justify-between"><span className="text-slate-500">Trial Ends</span><span className="font-medium">{new Date(selected.subscription.trialEndsAt).toLocaleDateString()}</span></div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrganizationsPage;
