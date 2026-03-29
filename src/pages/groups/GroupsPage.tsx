import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses } from '../../lib/api';
import { Users, Plus, Search, Trash2, FolderOpen, RefreshCw } from 'lucide-react';
import type { Group, Course } from '../../types';

const GROUP_COLORS = [
  { bg: 'bg-blue-500', light: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-800/40', text: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-violet-500', light: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/50 dark:border-violet-800/40', text: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/50 dark:border-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-amber-500', light: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/50 dark:border-amber-800/40', text: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-rose-500', light: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200/50 dark:border-rose-800/40', text: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-teal-500', light: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200/50 dark:border-teal-800/40', text: 'text-teal-600 dark:text-teal-400' },
];
const getColor = (i: number) => GROUP_COLORS[i % GROUP_COLORS.length];

const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '' });
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
      const created = await orgCreateGroup({ 
        ...form, 
        courseName: course?.title || '' 
      });
      setGroups((p) => [created, ...p]); 
      setShowModal(false); 
      setForm({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '' });
    } catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await orgDeleteGroup(id); setGroups((p) => p.filter((g) => g.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{t('nav.groups')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{groups.length} {t('nav.groups').toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>
          {isAdmin && <button onClick={() => setShowModal(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"><Plus className="w-4 h-4" />{t('org.groups.create')}</button>}
        </div>
      </div>

      {error && <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">{error}</div>}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden animate-pulse">
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('org.groups.empty')}</h3>
          <p className="text-sm text-slate-400 mb-4">{t('org.groups.emptyDesc', 'Создайте первую группу для вашего курса')}</p>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02]">
              <Plus className="w-4 h-4" />{t('org.groups.create')}
            </button>
          )}
        </div>
      ) : (
        /* ═══ Card Grid ═══ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g, i) => {
            const color = getColor(i);
            const studentCount = g.studentIds?.length || 0;
            return (
              <div
                key={g.id}
                onClick={() => navigate(`/groups/${g.id}`)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden cursor-pointer group transition-all hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                {/* Top accent */}
                <div className={`h-1.5 ${color.bg}`} />

                <div className="p-5">
                  {/* Title */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`${color.bg} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{g.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <FolderOpen className="w-3 h-3 shrink-0" />{courseName(g.courseId)}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Student count badge */}
                  <div className={`${color.light} border ${color.border} rounded-lg px-3 py-2 flex items-center gap-2`}>
                    <Users className={`w-4 h-4 ${color.text}`} />
                    <span className={`text-sm font-medium ${color.text}`}>{studentCount}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('nav.students').toLowerCase()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.groups.create')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('common.name')}</label>
                <input placeholder={t('org.groups.namePlaceholder')} value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="input" autoFocus />
              </div>
              <div>
                <label className="label">{t('nav.courses')}</label>
                <select value={form.courseId} onChange={(e) => setForm(f => ({ ...f, courseId: e.target.value }))} className="input">
                  <option value="">{t('org.groups.selectCourse')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <label className="label text-xs">Чат (Название)</label>
                  <input placeholder="Telegram, WhatsApp..." value={form.chatLinkTitle} onChange={(e) => setForm(f => ({ ...f, chatLinkTitle: e.target.value }))} className="input text-sm py-2" />
                </div>
                <div>
                  <label className="label text-xs">Ссылка на чат</label>
                  <input placeholder="https://t.me/..." value={form.chatLinkUrl} onChange={(e) => setForm(f => ({ ...f, chatLinkUrl: e.target.value }))} className="input text-sm py-2" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.courseId} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
