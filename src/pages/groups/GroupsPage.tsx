import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses } from '../../lib/api';
import { Users, Plus, Search, Trash2, FolderOpen, RefreshCw } from 'lucide-react';
import type { Group, Course } from '../../types';

const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', courseId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    Promise.all([orgGetGroups(), orgGetCourses()])
      .then(([g, c]) => { setGroups(g); setCourses(c); })
      .catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || '—';

  const handleCreate = async () => {
    if (!form.name.trim() || !form.courseId) return;
    setSaving(true); setError('');
    try {
      const course = courses.find((c) => c.id === form.courseId);
      const created = await orgCreateGroup({ ...form, courseName: course?.title || '' });
      setGroups((p) => [created, ...p]); setShowModal(false); setForm({ name: '', courseId: '' });
    } catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await orgDeleteGroup(id); setGroups((p) => p.filter((g) => g.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.groups')}</h1><p className="text-[11px] text-slate-500">{groups.length} {t('nav.groups').toLowerCase()}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button onClick={() => setShowModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" />{t('org.groups.create')}</button>
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
          <div className="text-center py-16"><Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.groups.empty')}</p></div>
        ) : (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.name')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('nav.courses')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('nav.students')}</th>
                <th className="text-right text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((g) => (
                  <tr key={g.id} onClick={() => navigate(`/groups/${g.id}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-500/10 rounded-md flex items-center justify-center"><Users className="w-3 h-3 text-blue-500" /></div>
                        <span className="text-xs font-medium text-slate-900 dark:text-white">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 flex items-center gap-1"><FolderOpen className="w-3 h-3" />{courseName(g.courseId)}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">{g.studentIds?.length || 0}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">{t('org.groups.create')}</h2>
            <div className="space-y-2">
              <input placeholder={t('org.groups.namePlaceholder')} value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" autoFocus />
              <select value={form.courseId} onChange={(e) => setForm(f => ({ ...f, courseId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                <option value="">{t('org.groups.selectCourse')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowModal(false)} className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.courseId} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
