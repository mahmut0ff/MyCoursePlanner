import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses, orgGetTeachers } from '../../lib/api';
import { Users, Plus, Search, Trash2, RefreshCw, Loader2, BookOpen } from 'lucide-react';
import type { Group, Course, UserProfile } from '../../types';

const C = {
  emerald: '#10b981',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316'
};

const GRADIENTS = [
  `linear-gradient(135deg, ${C.emerald} 0%, ${C.teal} 100%)`,
  `linear-gradient(135deg, ${C.blue} 0%, ${C.purple} 100%)`,
  `linear-gradient(135deg, ${C.purple} 0%, ${C.pink} 100%)`,
  `linear-gradient(135deg, ${C.orange} 0%, ${C.pink} 100%)`,
  `linear-gradient(135deg, ${C.teal} 0%, ${C.blue} 100%)`,
];

const getGradient = (i: number) => GRADIENTS[i % GRADIENTS.length];

const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'manager' || role === 'super_admin';
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '' });
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
      setGroups(g); setCourses(c); setTeachers(t);
    })
    .catch((e) => setError(e.message || 'Error'))
    .finally(() => setLoading(false));
  };
  
  useEffect(() => { load(); }, []);

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
      setForm({ name: '', courseId: '', chatLinkTitle: '', chatLinkUrl: '' });
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
        /* ═══ Premium Card Grid ═══ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((g, i) => {
            const gradient = getGradient(i);
            const studentCount = g.studentIds?.length || 0;
            const groupTeacherIds = g.teacherIds || [];
            const groupTeachers = teachers.filter(t => groupTeacherIds.includes(t.uid));
            
            return (
              <div
                key={g.id}
                onClick={() => navigate(`/groups/${g.id}`)}
                className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-1"
              >
                {/* Visual Header Banner */}
                <div className="h-14 w-full relative overflow-hidden" style={{ background: gradient }}>
                   <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'2\' fill=\'white\'/%3E%3C/svg%3E")', backgroundSize: '16px 16px' }} />
                   
                   {isAdmin && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }} 
                       className="absolute top-2 right-2 p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                </div>

                <div className="p-5 pt-4 relative">
                  {/* Floating Avatar Box */}
                  <div className="absolute -top-7 left-5 w-12 h-12 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center pointer-events-none">
                     <Users className="w-6 h-6 text-slate-800 dark:text-white" />
                  </div>

                  <div className="mt-6 mb-4">
                     <h3 className="font-extrabold text-slate-900 dark:text-white text-lg truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r transition-all" style={{ backgroundImage: `linear-gradient(135deg, ${C.teal}, ${C.blue})` }}>
                       {g.name}
                     </h3>
                     <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                       <BookOpen className="w-3.5 h-3.5 shrink-0" /> {courseName(g.courseId)}
                     </p>
                  </div>

                  {/* Footer Metrics */}
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                     <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1 rounded-lg">
                       <Users className="w-3.5 h-3.5 text-emerald-500" />
                       <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{studentCount} учеников</span>
                     </div>

                     {/* Teacher Avatars Overlapping */}
                     {groupTeachers.length > 0 && (
                       <div className="flex -space-x-2">
                          {groupTeachers.slice(0, 3).map((t, tid) => (
                             t.avatarUrl ? (
                               <img key={tid} src={t.avatarUrl} className="w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-slate-800" title={t.displayName} />
                             ) : (
                               <div key={tid} className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-800" title={t.displayName}>
                                  {t.displayName?.[0]?.toUpperCase() || '?'}
                               </div>
                             )
                          ))}
                          {groupTeachers.length > 3 && (
                             <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-800">
                               +{groupTeachers.length - 3}
                             </div>
                          )}
                       </div>
                     )}
                  </div>
                </div>
              </div>
            );
          })}
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
