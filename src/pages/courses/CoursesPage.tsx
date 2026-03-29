import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse } from '../../lib/api';
import { Plus, Search, Trash2, Edit, BookOpen, ChevronRight, FileText } from 'lucide-react';
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
  const [form, setForm] = useState<{
    title: string; description: string; subject: string; status: 'draft' | 'published';
    price?: number; paymentFormat?: 'one-time' | 'monthly'; durationMonths?: number;
  }>({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 });
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

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditing(c); setForm({ title: c.title, description: c.description || '', subject: c.subject || '', status: c.status as any || 'draft', price: c.price || 0, paymentFormat: c.paymentFormat || 'monthly', durationMonths: c.durationMonths || 1 }); setShowModal(true); };

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

  const statusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'draft': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12 font-sans animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <BookOpen className="w-6 h-6 text-slate-700 dark:text-slate-300" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('nav.courses')}</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">
            {t('nav.courses')} • {filtered.length} всего
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder={`${t('common.search')}...`} 
              className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none w-full sm:w-64 transition-all shadow-sm" 
            />
          </div>
          {isAdmin && (
            <button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
              <Plus className="w-4 h-4" />{t('org.courses.create')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="exam-slide-up bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('org.courses.empty')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">{t('org.courses.emptyDesc', 'Создайте первый курс для вашей организации')}</p>
          {isAdmin && (
            <button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-all shadow-md">
              <Plus className="w-5 h-5" />{t('org.courses.create')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((course, i) => (
            <div 
              key={course.id} 
              onClick={() => navigate(`/courses/${course.id}`)}
              className="cursor-pointer exam-slide-up exam-card-hover bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 group flex flex-col justify-between h-full relative overflow-hidden"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 dark:bg-slate-800/20 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
              
              <div>
                <div className="flex items-start justify-between mb-4">
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${statusBadge(course.status)} shrink-0`}>
                    {course.status}
                  </span>
                  {(course.price && course.price > 0) ? (
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">
                       {course.price} с.
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md">Free</p>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-snug mb-2 line-clamp-2">{course.title}</h3>
                
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{course.subject || '—'}</p>
                <p className="text-xs text-slate-400 line-clamp-2 h-8 mb-6">{course.description || ''}</p>
              </div>

              <div className="mt-auto pt-5 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
                      <FileText className="w-3.5 h-3.5" />
                      {course.lessonIds?.length || 0}
                    </span>
                  </div>
                  {isAdmin ? (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(course); }} className="p-1.5 text-slate-400 hover:text-primary-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Edit className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors">
                      <ChevronRight className="w-4 h-4 ml-0.5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{editing ? t('common.edit') : t('org.courses.create')}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.name')}</label>
                <input placeholder={t('org.courses.titlePlaceholder')} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.courses.subject', 'Предмет')}</label>
                <input placeholder={t('org.courses.subjectPlaceholder')} value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.description', 'Описание')}</label>
                <textarea placeholder={t('org.courses.descPlaceholder')} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.status')}</label>
                  <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as any }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none">
                    <option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Стоимость</label>
                  <input type="number" min="0" placeholder="0" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursesPage;

