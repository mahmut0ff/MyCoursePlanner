import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse } from '../../lib/api';
import { FolderOpen, Plus, Search, Trash2, Edit, BookOpen, Users, X, ChevronRight } from 'lucide-react';
import type { Course } from '../../types';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [detail, setDetail] = useState<Course | null>(null);
  const [form, setForm] = useState({ title: '', description: '', subject: '', status: 'draft' as const });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    orgGetCourses()
      .then(setCourses)
      .catch((e) => setError(e.message || 'Failed to load courses'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', subject: '', status: 'draft' });
    setShowModal(true);
  };

  const openEdit = (c: Course) => {
    setEditing(c);
    setForm({ title: c.title, description: c.description || '', subject: c.subject || '', status: c.status as any || 'draft' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await orgUpdateCourse({ id: editing.id, ...form });
        setCourses((p) => p.map((c) => c.id === editing.id ? { ...c, ...updated } : c));
        if (detail?.id === editing.id) setDetail({ ...detail, ...updated });
      } else {
        const created = await orgCreateCourse(form);
        setCourses((p) => [created, ...p]);
      }
      setShowModal(false);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await orgDeleteCourse(id);
      setCourses((p) => p.filter((c) => c.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
    </div>
  );

  return (
    <div className="flex gap-5 h-full">
      {/* Main Panel */}
      <div className={`flex-1 min-w-0 ${detail ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.courses')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{filtered.length} {t('nav.courses').toLowerCase()}</p>
          </div>
          <button onClick={openCreate} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />{t('org.courses.create')}
          </button>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')} className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <FolderOpen className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.courses.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <div key={c.id} onClick={() => setDetail(c)}
                className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-4 hover:shadow-md hover:shadow-primary-500/5 dark:hover:shadow-primary-500/10 hover:border-primary-200 dark:hover:border-primary-800/50 transition-all cursor-pointer group backdrop-blur-sm">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-primary-400/20 to-primary-600/20 dark:from-primary-400/10 dark:to-primary-600/10 rounded-lg flex items-center justify-center">
                    <FolderOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${c.status === 'published' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                    {c.status === 'published' ? t('common.published') : t('common.draft')}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-0.5 truncate">{c.title}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{c.subject || t('org.courses.noSubject')}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-2 mb-3">{c.description || t('org.courses.noDescription')}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-0.5"><BookOpen className="w-3 h-3" />{c.lessonIds?.length || 0}</span>
                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{c.teacherIds?.length || 0}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Side Panel */}
      {detail && (
        <div className="w-full lg:w-80 xl:w-96 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden shrink-0 backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{detail.title}</h3>
            <button onClick={() => setDetail(null)} className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"><X className="w-3.5 h-3.5 text-slate-400" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${detail.status === 'published' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'}`}>
                {detail.status === 'published' ? t('common.published') : t('common.draft')}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Subject</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">{detail.subject || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Description</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{detail.description || '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{detail.lessonIds?.length || 0}</p>
                <p className="text-[10px] text-slate-500">{t('nav.lessons')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{detail.teacherIds?.length || 0}</p>
                <p className="text-[10px] text-slate-500">{t('nav.teachers')}</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-400">
              Created: {detail.createdAt ? new Date(detail.createdAt).toLocaleDateString() : '—'}
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <button onClick={() => openEdit(detail)} className="flex-1 btn-secondary !py-1.5 text-xs flex items-center justify-center gap-1"><Edit className="w-3 h-3" />{t('common.edit')}</button>
              <button onClick={() => handleDelete(detail.id)} className="!py-1.5 px-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">{editing ? t('common.edit') : t('org.courses.create')}</h2>
            <div className="space-y-2.5">
              <input placeholder={t('org.courses.titlePlaceholder')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" autoFocus />
              <input placeholder={t('org.courses.subjectPlaceholder')} value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" />
              <textarea placeholder={t('org.courses.descPlaceholder')} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all min-h-[60px] text-slate-900 dark:text-white" />
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white">
                <option value="draft">{t('common.draft')}</option>
                <option value="published">{t('common.published')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursesPage;
