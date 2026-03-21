import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetCourses, orgCreateCourse, orgDeleteCourse } from '../../lib/api';
import { FolderOpen, Plus, Search, Trash2, Edit, BookOpen, Users } from 'lucide-react';
import type { Course } from '../../types';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', subject: '', status: 'draft' as const });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    orgGetCourses().then(setCourses).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await orgCreateCourse(form);
      setCourses((p) => [created, ...p]);
      setShowCreate(false);
      setForm({ title: '', description: '', subject: '', status: 'draft' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    await orgDeleteCourse(id);
    setCourses((p) => p.filter((c) => c.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.courses')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.courses.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />{t('org.courses.create')}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')} className="input pl-10 text-sm" />
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.courses.create')}</h2>
            <div className="space-y-3">
              <input placeholder={t('org.courses.titlePlaceholder')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="input text-sm" autoFocus />
              <input placeholder={t('org.courses.subjectPlaceholder')} value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="input text-sm" />
              <textarea placeholder={t('org.courses.descPlaceholder')} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input text-sm min-h-[80px]" />
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}
                className="input text-sm">
                <option value="draft">{t('common.draft')}</option>
                <option value="published">{t('common.published')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Courses Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{t('org.courses.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900/20 rounded-xl flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
                  {c.status === 'published' ? t('common.published') : t('common.draft')}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{c.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{c.subject || t('org.courses.noSubject')}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 mb-4">{c.description || t('org.courses.noDescription')}</p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{c.lessonIds?.length || 0} {t('nav.lessons')}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.teacherIds?.length || 0} {t('nav.teachers')}</span>
              </div>
              <div className="flex justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 text-slate-400 hover:text-primary-500 transition-colors" title={t('common.edit')}><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoursesPage;
