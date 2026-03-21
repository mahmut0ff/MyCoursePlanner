import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetMaterials, orgCreateMaterial, orgDeleteMaterial } from '../../lib/api';
import { FileText, Plus, Search, Trash2, ExternalLink, Link2, Video, File } from 'lucide-react';
import type { Material } from '../../types';

const TYPE_ICONS: Record<string, React.FC<any>> = { link: Link2, video: Video, file: File, document: FileText };

const MaterialsPage: React.FC = () => {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', type: 'link', category: 'general' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { orgGetMaterials().then(setMaterials).finally(() => setLoading(false)); }, []);

  const filtered = materials.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const created = await orgCreateMaterial(form);
      setMaterials((p) => [created, ...p]);
      setShowCreate(false); setForm({ title: '', url: '', type: 'link', category: 'general' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    await orgDeleteMaterial(id);
    setMaterials((p) => p.filter((m) => m.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.materials')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.materials.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />{t('org.materials.add')}
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="input pl-10 text-sm" />
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.materials.add')}</h2>
            <div className="space-y-3">
              <input placeholder={t('org.materials.titlePlaceholder')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input text-sm" autoFocus />
              <input placeholder="https://..." value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="input text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input text-sm">
                  <option value="link">Link</option>
                  <option value="video">Video</option>
                  <option value="document">Document</option>
                  <option value="file">File</option>
                </select>
                <input placeholder={t('org.materials.categoryPlaceholder')} value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><FileText className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>{t('org.materials.empty')}</p></div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((m) => {
              const Icon = TYPE_ICONS[m.type] || FileText;
              return (
                <div key={m.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center"><Icon className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{m.title}</p>
                    <p className="text-xs text-slate-400 truncate">{m.url}</p>
                  </div>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded">{m.category}</span>
                  <a href={m.url} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-primary-500"><ExternalLink className="w-3.5 h-3.5" /></a>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
