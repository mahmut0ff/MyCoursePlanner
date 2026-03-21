import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgGetCourses, orgCreateGroup, orgDeleteGroup } from '../../lib/api';
import { UsersRound, Plus, Search, Trash2, Users } from 'lucide-react';
import type { Group, Course } from '../../types';

const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', courseId: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([orgGetGroups(), orgGetCourses()])
      .then(([g, c]) => { setGroups(g); setCourses(c); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!form.name.trim() || !form.courseId) return;
    setSaving(true);
    try {
      const course = courses.find((c) => c.id === form.courseId);
      const created = await orgCreateGroup({ ...form, courseName: course?.title || '' });
      setGroups((p) => [created, ...p]);
      setShowCreate(false);
      setForm({ name: '', courseId: '' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    await orgDeleteGroup(id);
    setGroups((p) => p.filter((g) => g.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.groups')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.groups.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />{t('org.groups.create')}
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
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.groups.create')}</h2>
            <div className="space-y-3">
              <input placeholder={t('org.groups.namePlaceholder')} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input text-sm" autoFocus />
              <select value={form.courseId} onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                className="input text-sm">
                <option value="">{t('org.groups.selectCourse')}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{t('org.groups.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3">{t('common.name')}</th>
                <th className="px-5 py-3">{t('nav.courses')}</th>
                <th className="px-5 py-3">{t('nav.students')}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <UsersRound className="w-4 h-4 text-primary-500" />{g.name}
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{g.courseName || '-'}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Users className="w-3 h-3" />{g.studentIds?.length || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
