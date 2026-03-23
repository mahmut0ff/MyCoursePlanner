import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse } from '../../lib/api';
import { Plus, Search, Trash2, Edit, BookOpen, RefreshCw } from 'lucide-react';
import type { Course } from '../../types';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', subject: '', status: 'draft' as const });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    orgGetCourses().then(setCourses).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', subject: '', status: 'draft' }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditing(c); setForm({ title: c.title, description: c.description || '', subject: c.subject || '', status: c.status as any || 'draft' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true); setError('');
    try {
      if (editing) { const u = await orgUpdateCourse({ id: editing.id, ...form }); setCourses((p) => p.map((c) => c.id === editing.id ? { ...c, ...u } : c)); }
      else { const c = await orgCreateCourse(form); setCourses((p) => [c, ...p]); }
      setShowModal(false);
    } catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await orgDeleteCourse(id); setCourses((p) => p.filter((c) => c.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.courses')}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{filtered.length} {t('nav.courses').toLowerCase()}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            {isAdmin && <button onClick={openCreate} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.courses.create')}</button>}
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}

        {/* Search bar — compact, styled like reference */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
                className="w-full bg-transparent border-0 pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
            </div>
          </div>
        </div>

        {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">{t('org.courses.empty')}</p>
          </div>
        ) : (
          /* Table layout like reference */
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.name')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Subject</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.status')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('nav.lessons')}</th>
                <th className="text-right text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/courses/${c.id}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center text-[10px] text-white font-bold shrink-0">{c.title[0]?.toUpperCase()}</div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{c.title}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{c.description || t('org.courses.noDescription')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{c.subject || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {c.status === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500"><span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{c.lessonIds?.length || 0}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1 text-slate-400 hover:text-primary-500 rounded transition-colors"><Edit className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">{editing ? t('common.edit') : t('org.courses.create')}</h2>
            <div className="space-y-2">
              <input placeholder={t('org.courses.titlePlaceholder')} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <input placeholder={t('org.courses.subjectPlaceholder')} value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
              <textarea placeholder={t('org.courses.descPlaceholder')} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 min-h-[50px] text-slate-900 dark:text-white" />
              <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as any }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                <option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowModal(false)} className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursesPage;
