import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetFeatureFlags, adminSetFeatureFlag, adminSetOrgOverride, adminGetOrgs } from '../../lib/api';
import { Settings, ToggleLeft, ToggleRight, Plus, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface FeatureFlag { id: string; key: string; enabled: boolean; description: string; updatedAt: string; }
interface OrgOverride { id: string; organizationId: string; maxStudents?: number; maxTeachers?: number; maxExams?: number; aiEnabled?: boolean; }

const AdminFeatureFlagsPage: React.FC = () => {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [overrides, setOverrides] = useState<OrgOverride[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [, setLoading] = useState(true);
  const [newFlag, setNewFlag] = useState({ key: '', description: '' });
  const [showNewFlag, setShowNewFlag] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideData, setOverrideData] = useState({ organizationId: '', maxStudents: '', maxTeachers: '', maxExams: '', aiEnabled: 'null' });

  const load = async () => {
    setLoading(true);
    try {
      const [ffData, orgData] = await Promise.all([adminGetFeatureFlags(), adminGetOrgs()]);
      setFlags(ffData.flags || []);
      setOverrides(ffData.overrides || []);
      setOrgs(orgData.organizations || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleFlag = async (key: string, current: boolean) => {
    try { await adminSetFeatureFlag(key, !current); load(); }
    catch (e: any) { toast.error(e.message || t('common.error')); }
  };

  const addFlag = async () => {
    if (!newFlag.key) return;
    try {
      await adminSetFeatureFlag(newFlag.key, true, newFlag.description);
      setNewFlag({ key: '', description: '' });
      setShowNewFlag(false);
      load();
    } catch (e: any) { toast.error(e.message || t('common.error')); }
  };

  const saveOverride = async () => {
    const data: any = { organizationId: overrideData.organizationId };
    if (overrideData.maxStudents) data.maxStudents = parseInt(overrideData.maxStudents);
    if (overrideData.maxTeachers) data.maxTeachers = parseInt(overrideData.maxTeachers);
    if (overrideData.maxExams) data.maxExams = parseInt(overrideData.maxExams);
    if (overrideData.aiEnabled !== 'null') data.aiEnabled = overrideData.aiEnabled === 'true';
    try {
      await adminSetOrgOverride(data);
      setShowOverride(false);
      setOverrideData({ organizationId: '', maxStudents: '', maxTeachers: '', maxExams: '', aiEnabled: 'null' });
      load();
    } catch (e: any) { toast.error(e.message || t('common.error')); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.flags.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.flags.subtitle')}</p>
        </div>
        <button onClick={() => setShowNewFlag(true)} className="btn-primary text-sm w-full sm:w-auto flex justify-center items-center gap-1"><Plus className="w-4 h-4" />{t('admin.flags.newFlag')}</button>
      </div>

      {/* Feature Flags */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Settings className="w-4 h-4" />{t('admin.flags.globalFlags')}</h3></div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {flags.map((f) => (
            <div key={f.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => toggleFlag(f.key, f.enabled)} className="shrink-0">
                {f.enabled ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
              </button>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white font-mono">{f.key}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{f.description || t('admin.flags.noDescription', 'Нет описания')}</p>
              </div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${f.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{f.enabled ? t('common.on') : t('common.off')}</span>
            </div>
          ))}
          {flags.length === 0 && <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">{t('admin.flags.noFlags')}</div>}
        </div>
      </div>

      {/* Organization Overrides */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4" />{t('admin.flags.orgOverrides')}</h3>
          <button onClick={() => setShowOverride(true)} className="btn-secondary text-xs w-full sm:w-auto flex justify-center items-center gap-1"><Plus className="w-3 h-3" />{t('admin.flags.addOverride')}</button>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b"><tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.organization')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.flags.maxStudents')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.flags.maxTeachers')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.flags.maxExams')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.flags.aiAccess')}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {overrides.map((o) => {
              const orgName = orgs.find(org => org.id === o.organizationId)?.name || o.organizationId;
              return (
                <tr key={o.id} className="hover:bg-slate-50 dark:bg-slate-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{orgName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{o.maxStudents ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{o.maxTeachers ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{o.maxExams ?? '—'}</td>
                  <td className="px-4 py-3">{o.aiEnabled != null ? (o.aiEnabled ? <span className="text-emerald-600 text-xs font-medium">{t('common.on')}</span> : <span className="text-red-500 text-xs font-medium">{t('common.off')}</span>) : '—'}</td>
                </tr>
              );
            })}
            {overrides.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">{t('admin.flags.noOverrides')}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* New Flag Modal */}
      {showNewFlag && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowNewFlag(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.flags.newFlagTitle')}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.key')}</label><input type="text" value={newFlag.key} onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })} className="input text-sm" placeholder="enable_ai_v2" /></div>
              <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.description')}</label><input type="text" value={newFlag.description} onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })} className="input text-sm" /></div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowNewFlag(false)} className="btn-secondary text-sm">{t('admin.flags.cancel')}</button>
              <button onClick={addFlag} className="btn-primary text-sm">{t('admin.flags.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverride && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowOverride(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.flags.overrideTitle')}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.users.organization')}</label>
                <select value={overrideData.organizationId} onChange={(e) => setOverrideData({ ...overrideData, organizationId: e.target.value })} className="input text-sm">
                  <option value="">{t('admin.flags.selectOrg')}</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.maxStudents')}</label><input type="number" value={overrideData.maxStudents} onChange={(e) => setOverrideData({ ...overrideData, maxStudents: e.target.value })} className="input text-sm" /></div>
                <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.maxTeachers')}</label><input type="number" value={overrideData.maxTeachers} onChange={(e) => setOverrideData({ ...overrideData, maxTeachers: e.target.value })} className="input text-sm" /></div>
                <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.maxExams')}</label><input type="number" value={overrideData.maxExams} onChange={(e) => setOverrideData({ ...overrideData, maxExams: e.target.value })} className="input text-sm" /></div>
              </div>
              <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.flags.aiAccess')}</label>
                <select value={overrideData.aiEnabled} onChange={(e) => setOverrideData({ ...overrideData, aiEnabled: e.target.value })} className="input text-sm">
                  <option value="null">{t('admin.flags.usePlanDefault')}</option>
                  <option value="true">{t('admin.flags.forceOn')}</option>
                  <option value="false">{t('admin.flags.forceOff')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowOverride(false)} className="btn-secondary text-sm">{t('admin.flags.cancel')}</button>
              <button onClick={saveOverride} className="btn-primary text-sm">{t('admin.flags.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeatureFlagsPage;
