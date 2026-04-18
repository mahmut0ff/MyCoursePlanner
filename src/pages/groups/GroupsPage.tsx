import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses, orgGetTeachers } from '../../lib/api';
import { Users, Plus, Search, Trash2, RefreshCw, Loader2, BookOpen, Building2 } from 'lucide-react';
import type { Group, Course, UserProfile } from '../../types';
import BranchFilter from '../../components/ui/BranchFilter';



const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin' || role === 'manager' || role === 'super_admin';
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '', branchId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    Promise.all([
      orgGetGroups(),
      orgGetCourses(),
      orgGetTeachers()
    ])
    .then(([g, c, t]) => {
      let filteredG = g;
      let filteredC = c;
      
      if (role === 'teacher' && profile?.uid) {
        filteredG = g.filter((group: Group) => group.teacherIds?.includes(profile.uid));
        const groupCourseIds = new Set(filteredG.map((group: Group) => group.courseId));
        filteredC = c.filter((course: Course) => course.teacherIds?.includes(profile.uid) || groupCourseIds.has(course.id));
      } else if (role === 'student' && profile?.uid) {
        filteredG = g.filter((group: Group) => group.studentIds?.includes(profile.uid));
      }

      setGroups(filteredG); setCourses(filteredC); setTeachers(t);
    })
    .catch((e) => setError(e.message || 'Error'))
    .finally(() => setLoading(false));
  };
  
  useEffect(() => { load(); }, [role, profile?.uid]);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || 'Курс не найден';

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
      setForm({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '', branchId: '' });
    } catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('common.confirmDelete', 'Удалить группу?'))) return;
    try { await orgDeleteGroup(id); setGroups((p) => p.filter((g) => g.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10 cursor-default">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{t('nav.groups', 'Группы')}</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Всего групп: {groups.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><RefreshCw className="w-5 h-5" /></button>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-95">
              <Plus className="w-5 h-5" /> Создать группу
            </button>
          )}
        </div>
      </div>

      {error && <div className="px-5 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm font-bold text-red-600 dark:text-red-400">{error}</div>}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder={`${t('common.search', 'Поиск')}...`}
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm" 
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-emerald-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-5 rotate-3 hover:rotate-6 transition-transform">
            <Users className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">{t('org.groups.empty', 'Список пуст')}</h3>
          <p className="text-sm font-medium text-slate-500 mb-6 max-w-sm mx-auto">{t('org.groups.emptyDesc', 'Создайте первую группу, чтобы распределить учеников.')}</p>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0">
              <Plus className="w-5 h-5" /> Создать группу
            </button>
          )}
        </div>
      ) : (
        /* ═══ Premium Data Table ═══ */
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Группа</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Курс</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Студенты</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Учителя</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Создана</th>
                  {isAdmin && <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Действия</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((g) => {
                  const studentCount = g.studentIds?.length || 0;
                  const groupTeacherIds = g.teacherIds || [];
                  const groupTeachers = teachers.filter(t => groupTeacherIds.includes(t.uid));
                  
                  return (
                    <tr 
                      key={g.id} 
                      onClick={() => navigate(`/groups/${g.id}`)}
                      className="group/row hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-lg shrink-0">
                            {g.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white group-hover/row:text-violet-600 dark:group-hover/row:text-violet-400 transition-colors">
                              {g.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
                          <BookOpen className="w-3.5 h-3.5" />
                          {courseName(g.courseId)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{studentCount}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {groupTeachers.length > 0 ? (
                          <div className="flex -space-x-2">
                             {groupTeachers.slice(0, 3).map((t, tid) => (
                                t.avatarUrl ? (
                                  <img key={tid} src={t.avatarUrl} className="w-8 h-8 rounded-full object-cover ring-2 ring-white dark:ring-slate-800" title={t.displayName} />
                                ) : (
                                  <div key={tid} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 flex items-center justify-center text-[11px] font-bold ring-2 ring-white dark:ring-slate-800" title={t.displayName}>
                                     {t.displayName?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )
                             ))}
                             {groupTeachers.length > 3 && (
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-800">
                                  +{groupTeachers.length - 3}
                                </div>
                             )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {g.createdAt ? new Date(g.createdAt).toLocaleDateString() : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors opacity-0 group-hover/row:opacity-100"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-6">Создать новую группу</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('common.name', 'Название')}</label>
                <input 
                  placeholder="Осенний интенсив..." 
                  value={form.name} 
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} 
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-colors" 
                  autoFocus 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('nav.courses', 'Курс')}</label>
                <select 
                  value={form.courseId} 
                  onChange={(e) => setForm(f => ({ ...f, courseId: e.target.value }))} 
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  <option value="">-- Выберите курс --</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> {t('common.branch', 'Филиал')}
                </label>
                <BranchFilter
                  value={form.branchId || null}
                  onChange={(id) => setForm(f => ({ ...f, branchId: id || '' }))}
                  hideAll={false}
                  mode="select"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Чат (Опционально)</label>
                  <input placeholder="Telegram" value={form.chatLinkTitle} onChange={(e) => setForm(f => ({ ...f, chatLinkTitle: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Ссылка на чат</label>
                  <input placeholder="https://t.me/..." value={form.chatLinkUrl} onChange={(e) => setForm(f => ({ ...f, chatLinkUrl: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
               <button onClick={() => setShowModal(false)} className="px-5 py-2.5 font-bold text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 {t('common.cancel', 'Отмена')}
               </button>
               <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.courseId} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-colors shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2">
                 {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> ...</> : t('common.save', 'Создать')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
