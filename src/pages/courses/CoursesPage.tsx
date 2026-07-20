import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse, orgGetGroups, orgTeacherJoinCourse, orgTeacherLeaveCourse } from '../../lib/api';
import { Plus, Search, Trash2, Edit, BookOpen, FileText, Users, Filter, UserPlus, LogOut } from 'lucide-react';
import type { Course, Group } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

type StatusFilter = 'all' | 'published' | 'draft';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { activeBranchId } = useBranch();
  const isAdmin = role === 'admin' || role === 'manager';
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  // Teachers can browse all courses ('all') or just the ones they teach ('mine')
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    title: string; description: string; subject: string; status: 'draft' | 'published';
    price?: number; paymentFormat?: 'one-time' | 'monthly'; durationMonths?: number;
  }>({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const load = () => {
    setLoading(true); setError('');
    Promise.all([
      orgGetCourses(),
      orgGetGroups().catch(() => [])
    ]).then(([c, g]) => {
      setGroups(g);
      // Store the full list; teachers switch between "Мои"/"Все" via viewMode below.
      setCourses(c);
    }).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false));
  };

  // activeBranchId: курсы приходят org-wide (филиал держит только группа), но список
  // ГРУПП тут же branch-scoped, а от него зависят счётчики групп/студентов на карточках
  // и myCourseIds. Поэтому переключение филиала всё ещё требует рефетча.
  useEffect(() => {
    load();
  }, [role, profile?.uid, activeBranchId]);

  // Courses this teacher is linked to — directly (course.teacherIds) or via a group they teach
  const myCourseIds = useMemo(() => {
    const ids = new Set<string>();
    if (!profile?.uid) return ids;
    (groups as Group[]).forEach(gr => { if (gr.teacherIds?.includes(profile.uid)) ids.add(gr.courseId); });
    courses.forEach(c => { if (c.teacherIds?.includes(profile.uid)) ids.add(c.id); });
    return ids;
  }, [courses, groups, profile?.uid]);

  // Teacher self-service: add/remove yourself as a teacher of this course
  const toggleTeachCourse = async (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile?.uid || togglingId) return;
    const isMember = !!course.teacherIds?.includes(profile.uid);
    setTogglingId(course.id);
    try {
      if (isMember) await orgTeacherLeaveCourse(course.id);
      else await orgTeacherJoinCourse(course.id);
      setCourses(prev => prev.map(c => c.id === course.id ? {
        ...c,
        teacherIds: isMember
          ? (c.teacherIds || []).filter(id => id !== profile.uid)
          : [...(c.teacherIds || []), profile.uid],
      } : c));
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setTogglingId(null);
    }
  };

  const uniqueSubjects = useMemo(() => Array.from(new Set(courses.map(c => c.subject))).filter(Boolean), [courses]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (role === 'teacher' && viewMode === 'mine' && !myCourseIds.has(c.id)) return false;
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesSubject = subjectFilter === 'all' || c.subject === subjectFilter;
      return matchesSearch && matchesStatus && matchesSubject;
    });
  }, [courses, search, statusFilter, subjectFilter, role, viewMode, myCourseIds]);

  const getStudentCount = (courseId: string) => new Set(groups.filter((g: any) => g.courseId === courseId).flatMap((g: any) => g.studentIds || [])).size;
  const getGroupCount = (courseId: string) => groups.filter((g: any) => g.courseId === courseId).length;

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

          {role === 'teacher' && (
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0">
              {(['mine', 'all'] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === m ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {m === 'mine' ? t('org.teach.mine', 'Мои') : t('org.teach.all', 'Все')}
                </button>
              ))}
            </div>
          )}

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

          {filtered.map((course) => {
            const isMember = !!course.teacherIds?.includes(profile?.uid || '');
            return (
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
                    {role === 'teacher' && (
                      <button
                        onClick={(e) => toggleTeachCourse(course, e)}
                        disabled={togglingId === course.id}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${isMember ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-primary-600 text-white'}`}
                      >
                        {isMember ? <><LogOut className="w-3 h-3" />{t('org.teach.leave', 'Выйти')}</> : <><UserPlus className="w-3 h-3" />{t('org.teach.teach', 'Вести')}</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject — предмет необязателен, поэтому пустой бейдж не рисуем вовсе:
                  плашка с «—» читалась как «что-то сломалось», а не «поле не заполнено». */}
              <div className="hidden md:flex flex-col gap-1 min-w-0">
                {course.subject && (
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider truncate text-center">{course.subject}</span>
                )}
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

              {/* Actions: admins edit/delete, teachers join/leave */}
              {isAdmin ? (
                <div className="hidden md:flex items-center gap-1.5 justify-end">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(course); }} className="p-1.5 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all tooltip" data-tip="Редактировать">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all tooltip" data-tip="Удалить">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : role === 'teacher' ? (
                <div className="hidden md:flex items-center justify-end">
                  <button
                    onClick={(e) => toggleTeachCourse(course, e)}
                    disabled={togglingId === course.id}
                    title={isMember ? t('org.teach.leaveCourse', 'Выйти из курса') : t('org.teach.joinCourse', 'Преподавать этот курс')}
                    className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${isMember ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}
                  >
                    {isMember ? <LogOut className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : null}
            </div>
            );
          })}
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
