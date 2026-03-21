import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetMaterials, orgCreateMaterial, orgDeleteMaterial } from '../../lib/api';
import { FileText, Plus, Search, Trash2, ExternalLink, Link2, Video, File } from 'lucide-react';
import type { Material } from '../../types';

const TYPE_ICONS: Record<string, React.FC<any>> = { link: Link2, video: Video, file: File, document: FileText };
const TYPE_COLORS: Record<string, string> = {
  link: 'from-blue-400/20 to-blue-600/20 text-blue-600 dark:text-blue-400',
  video: 'from-red-400/20 to-red-600/20 text-red-600 dark:text-red-400',
  file: 'from-amber-400/20 to-amber-600/20 text-amber-600 dark:text-amber-400',
  document: 'from-emerald-400/20 to-emerald-600/20 text-emerald-600 dark:text-emerald-400',
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

  useEffect(() => {
    orgGetMaterials()
      .then(setMaterials)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = materials.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateMaterial(form);
      setMaterials((p) => [created, ...p]);
      setShowCreate(false); setForm({ title: '', url: '', type: 'link', category: 'general' });
    } catch (e: any) { setError(e.message || 'Failed to create'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await orgDeleteMaterial(id);
      setMaterials((p) => p.filter((m) => m.id !== id));
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.materials')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('org.materials.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" />{t('org.materials.add')}
        </button>
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">{t('org.materials.add')}</h2>
            <div className="space-y-2.5">
              <input placeholder={t('org.materials.titlePlaceholder')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" autoFocus />
              <input placeholder="https://..." value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white">
                  <option value="link">Link</option><option value="video">Video</option><option value="document">Document</option><option value="file">File</option>
                </select>
                <input placeholder={t('org.materials.categoryPlaceholder')} value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.url.trim()} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><FileText className="w-6 h-6 text-slate-400" /></div>
          <p className="text-sm text-slate-500">{t('org.materials.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((m) => {
              const Icon = TYPE_ICONS[m.type] || FileText;
              const color = TYPE_COLORS[m.type] || TYPE_COLORS.link;
              return (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors group">
                  <div className={`w-7 h-7 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center shrink-0`}><Icon className="w-3.5 h-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{m.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">{m.url}</p>
                  </div>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-md">{m.category}</span>
                  <a href={m.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-primary-500 transition-colors"><ExternalLink className="w-3 h-3" /></a>
                  <button onClick={() => handleDelete(m.id)} className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialsPage;
