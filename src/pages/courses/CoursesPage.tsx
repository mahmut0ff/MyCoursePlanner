import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse, orgGetGroups } from '../../lib/api';
import { Plus, Search, Trash2, Edit, BookOpen, FileText, Users, Building2, Filter } from 'lucide-react';
import type { Course } from '../../types';
import BranchFilter from '../../components/ui/BranchFilter';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

type StatusFilter = 'all' | 'published' | 'draft';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin' || role === 'manager';
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    title: string; description: string; subject: string; status: 'draft' | 'published';
    price?: number; paymentFormat?: 'one-time' | 'monthly'; durationMonths?: number;
    branchId?: string;
  }>({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1, branchId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError('');
    Promise.all([
      orgGetCourses(),
      orgGetGroups().catch(() => [])
    ]).then(([c, g]) => {
      setGroups(g);
      let filtered = c;
      if (role === 'teacher' && profile?.uid) {
        const teacherGroups = (g as import('../../types').Group[]).filter(group => group.teacherIds?.includes(profile.uid));
        const groupCourseIds = new Set(teacherGroups.map(group => group.courseId));
        filtered = filtered.filter((course: Course) => course.teacherIds?.includes(profile.uid) || groupCourseIds.has(course.id));
      }
      setCourses(filtered);
    }).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [role, profile?.uid]);

  const uniqueSubjects = useMemo(() => Array.from(new Set(courses.map(c => c.subject))).filter(Boolean), [courses]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesSubject = subjectFilter === 'all' || c.subject === subjectFilter;
      const matchesBranch = !branchFilter || (c as any).branchId === branchFilter;
      return matchesSearch && matchesStatus && matchesSubject && matchesBranch;
    });
  }, [courses, search, statusFilter, subjectFilter, branchFilter]);

  const getStudentCount = (courseId: string) => groups.filter((g: any) => g.courseId === courseId).reduce((sum: number, g: any) => sum + (g.studentIds?.length || 0), 0);
  const getGroupCount = (courseId: string) => groups.filter((g: any) => g.courseId === courseId).length;

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1, branchId: '' }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditing(c); setForm({ title: c.title, description: c.description || '', subject: c.subject || '', status: c.status as any || 'draft', price: c.price || 0, paymentFormat: c.paymentFormat || 'monthly', durationMonths: c.durationMonths || 1, branchId: (c as any).branchId || '' }); setShowModal(true); };

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

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('nav.courses', 'Курсы')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{filtered.length} доступных курсов</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={openCreate}
              className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />{t('org.courses.create', 'Создать')}
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или предмету..."
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
          {uniqueSubjects.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-4 h-4 text-slate-400" />
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none">
                <option value="all">Все предметы</option>
                {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <BranchFilter value={branchFilter} onChange={setBranchFilter} compact />

          {isStaff && (
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0 ml-2">
              {(['all', 'published', 'draft'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {s === 'all' ? t('common.all', 'Все') : s === 'published' ? t('common.published', 'Опубликован') : t('common.draft', 'Черновик')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || subjectFilter !== 'all' ? 'Ничего не найдено' : t('org.courses.empty', 'Курсов пока нет')}
          description={search || subjectFilter !== 'all' ? 'Попробуйте изменить фильтры поиска' : t('org.courses.emptyDesc', 'Создайте первый курс для вашей организации')}
          actionLabel={isAdmin ? t('org.courses.create', 'Создать') : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Название</span>
            <span>Предмет</span>
            <span>Группы</span>
            <span>Студенты</span>
            {isStaff && <span>Статус</span>}
            {isAdmin && <span></span>}
          </div>

          {filtered.map((course) => (
            <div
              key={course.id}
              onClick={() => navigate(`/courses/${course.id}`)}
              className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_120px_80px_80px_80px_60px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors relative"
            >
              {/* Title + icon */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary-50 dark:bg-primary-900/20 text-primary-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 hidden lg:block">{course.description}</p>
                  )}
                  {/* Mobile-only meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {course.subject && <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{course.subject}</span>}
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" />{getGroupCount(course.id)} гр.</span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />{getStudentCount(course.id)}</span>
                    {(course.price && course.price > 0) && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{course.price} сом</span>
                    )}
                    {isStaff && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${course.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {course.status === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="hidden md:flex flex-col gap-1 min-w-0">
                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider truncate text-center">{course.subject || '—'}</span>
                {(course.price && course.price > 0) ? (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 text-center">{course.price} сом</span>
                ) : null}
              </div>

              {/* Groups */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{getGroupCount(course.id)}</span>
              </div>

              {/* Students */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{getStudentCount(course.id)}</span>
              </div>

              {/* Status (staff only) */}
              {isStaff && (
                <div className="hidden md:block">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${course.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                    {course.status === 'published' ? t('common.published') : t('common.draft')}
                  </span>
                </div>
              )}

              {/* Actions (admin only) */}
              {isAdmin && (
                <div className="hidden md:flex items-center gap-1.5 justify-end">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(course); }} className="p-1.5 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all tooltip" data-tip="Редактировать">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all tooltip" data-tip="Удалить">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Филиал
                </label>
                <BranchFilter
                  value={form.branchId || null}
                  onChange={(id) => setForm(f => ({ ...f, branchId: id || '' }))}
                  hideAll={false}
                  mode="select"
                />
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
