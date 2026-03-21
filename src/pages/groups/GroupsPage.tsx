import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses } from '../../lib/api';
import { Users, Plus, Search, Trash2, X, ChevronRight, FolderOpen } from 'lucide-react';
import type { Group, Course } from '../../types';

const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState<Group | null>(null);
  const [form, setForm] = useState({ name: '', courseId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([orgGetGroups(), orgGetCourses()])
      .then(([g, c]) => { setGroups(g); setCourses(c); })
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || '—';

  const handleCreate = async () => {
    if (!form.name.trim() || !form.courseId) return;
    setSaving(true); setError('');
    try {
      const course = courses.find((c) => c.id === form.courseId);
      const created = await orgCreateGroup({ ...form, courseName: course?.title || '' });
      setGroups((p) => [created, ...p]);
      setShowModal(false); setForm({ name: '', courseId: '' });
    } catch (e: any) { setError(e.message || 'Failed to create'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await orgDeleteGroup(id);
      setGroups((p) => p.filter((g) => g.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div className="flex gap-5 h-full">
      <div className={`flex-1 min-w-0 ${detail ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.groups')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{groups.length} {t('nav.groups').toLowerCase()}</p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />{t('org.groups.create')}
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
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><Users className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm text-slate-500">{t('org.groups.empty')}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((g) => (
                <div key={g.id} onClick={() => setDetail(g)} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400/20 to-blue-600/20 dark:from-blue-400/10 dark:to-blue-600/10 rounded-lg flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{g.name}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1"><FolderOpen className="w-2.5 h-2.5" />{courseName(g.courseId)}</p>
                  </div>
                  <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md font-medium">{g.studentIds?.length || 0} students</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail */}
      {detail && (
        <div className="w-full lg:w-80 xl:w-96 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden shrink-0 backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{detail.name}</h3>
            <button onClick={() => setDetail(null)} className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"><X className="w-3.5 h-3.5 text-slate-400" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('nav.courses')}</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{courseName(detail.courseId)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{detail.studentIds?.length || 0}</p>
                <p className="text-[10px] text-slate-500">{t('nav.students')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">—</p>
                <p className="text-[10px] text-slate-500">{t('nav.lessons')}</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-400">Created: {detail.createdAt ? new Date(detail.createdAt).toLocaleDateString() : '—'}</div>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <button onClick={() => handleDelete(detail.id)} className="!py-1.5 px-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" />{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">{t('org.groups.create')}</h2>
            <div className="space-y-2.5">
              <input placeholder={t('org.groups.namePlaceholder')} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" autoFocus />
              <select value={form.courseId} onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white">
                <option value="">{t('org.groups.selectCourse')}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.courseId} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
