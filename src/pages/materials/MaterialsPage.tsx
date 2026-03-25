import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetMaterials, orgCreateMaterial, orgDeleteMaterial } from '../../lib/api';
import { FileText, Plus, Search, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import type { Material } from '../../types';

const TYPE_COLORS: Record<string, string> = {
  link: 'bg-blue-500/10 text-blue-500', video: 'bg-red-500/10 text-red-500',
  file: 'bg-amber-500/10 text-amber-500', document: 'bg-emerald-500/10 text-emerald-500',
};

const MaterialsPage: React.FC = () => {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', type: 'link', category: 'general' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => { setLoading(true); orgGetMaterials().then(setMaterials).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = materials.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.url.trim()) return; setSaving(true); setError('');
    try { const c = await orgCreateMaterial(form); setMaterials((p) => [c, ...p]); setShowCreate(false); setForm({ title: '', url: '', type: 'link', category: 'general' }); }
    catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await orgDeleteMaterial(id); setMaterials((p) => p.filter((m) => m.id !== id)); } catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.materials')}</h1><p className="text-[11px] text-slate-500">{t('org.materials.subtitle')}</p></div>
        <div className="flex items-center gap-1.5">
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowCreate(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.materials.add')}</button>
        </div>
      </div>

      {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}

      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="w-full bg-transparent border-0 pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : filtered.length === 0 ? (
        <div className="text-center py-16"><FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.materials.empty')}</p></div>
      ) : (
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.name')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">{t('common.type', 'Тип')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">{t('common.category', 'Категория')}</th>
              <th className="text-right text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors group">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="text-xs font-medium text-slate-900 dark:text-white truncate">{m.title}</span></div>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[m.type] || TYPE_COLORS.link}`}>{t(`materials.type.${m.type}`, m.type)}</span></td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden md:table-cell">{m.category}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <a href={m.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-primary-500 rounded transition-colors"><ExternalLink className="w-3 h-3" /></a>
                      <button onClick={() => handleDelete(m.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">{t('org.materials.add')}</h2>
            <div className="space-y-2">
              <input placeholder={t('org.materials.titlePlaceholder')} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <input placeholder="https://..." value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                  <option value="link">{t('materials.type.link', 'Ссылка')}</option><option value="video">{t('materials.type.video', 'Видео')}</option><option value="document">{t('materials.type.document', 'Документ')}</option><option value="file">{t('materials.type.file', 'Файл')}</option>
                </select>
                <input placeholder={t('org.materials.categoryPlaceholder')} value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowCreate(false)} className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.url.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialsPage;
