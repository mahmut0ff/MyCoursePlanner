import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { orgGetCourses, orgCreateCourse, orgUpdateCourse, orgDeleteCourse, orgGetGroups, orgTeacherJoinCourse, orgTeacherLeaveCourse } from '../../lib/api';
import { Plus, Search, Trash2, Edit, BookOpen, FileText, Users, Filter, UserPlus, LogOut } from 'lucide-react';
import type { Course, Group } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

type StatusFilter = 'all' | 'published' | 'draft';

const CoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { activeBranchId, activeBranch, branches, canSwitch } = useBranch();
  const { canWrite, canDelete } = usePermissions();
  // Сервер правит курс только админу/менеджеру с courses:write (у преподавателя
  // courses:write есть для авторинга уроков) — поэтому роль И право.
  const isAdmin = role === 'admin' || role === 'manager';
  const canEditCourses = isAdmin && canWrite('courses');
  const canDeleteCourses = isAdmin && canDelete('courses');
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
    }).catch((e) => setError(e.message || t('common.error', 'Ошибка'))).finally(() => setLoading(false));
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
    if (isMember && !window.confirm(t('org.teach.leaveCourseConfirm', 'Выйти из курса «{{name}}»?', { name: course.title }))) return;
    setTogglingId(course.id);
    try {
      if (isMember) await orgTeacherLeaveCourse(course.id);
      else await orgTeacherJoinCourse(course.id);
      toast.success(isMember ? t('org.teach.leftCourse', 'Вы вышли из курса') : t('org.teach.joinedCourse', 'Вы преподаёте этот курс'));
      setCourses(prev => prev.map(c => c.id === course.id ? {
        ...c,
        teacherIds: isMember
          ? (c.teacherIds || []).filter(id => id !== profile.uid)
          : [...(c.teacherIds || []), profile.uid],
      } : c));
    } catch (err: any) {
      setError(err.message || t('common.error', 'Ошибка'));
    } finally {
      setTogglingId(null);
    }
  };

  const uniqueSubjects = useMemo(() => Array.from(new Set(courses.map(c => c.subject))).filter(Boolean), [courses]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (role === 'teacher' && viewMode === 'mine' && !myCourseIds.has(c.id)) return false;
      // With a branch picked, `groups` is already scoped to it — hide courses that
      // don't run in this branch, so the list shows only the branch's courses.
      if (activeBranchId && !groups.some((g: any) => g.courseId === c.id)) return false;
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesSubject = subjectFilter === 'all' || c.subject === subjectFilter;
      return matchesSearch && matchesStatus && matchesSubject;
    });
  }, [courses, groups, activeBranchId, search, statusFilter, subjectFilter, role, viewMode, myCourseIds]);

  const getStudentCount = (courseId: string) => new Set(groups.filter((g: any) => g.courseId === courseId).flatMap((g: any) => g.studentIds || [])).size;
  const getGroupCount = (courseId: string) => groups.filter((g: any) => g.courseId === courseId).length;

  const branchNameById = useMemo(() => {
    const m: Record<string, string> = {};
    branches.forEach(b => { m[b.id] = b.name; });
    return m;
  }, [branches]);

  // Per-branch split for a course. `groups` is org-wide only under «Все филиалы»
  // (a picked branch scopes it server-side), so this is rendered only there — it
  // lets you see each branch's load side by side without switching.
  const branchBreakdown = (courseId: string) => {
    const acc: Record<string, { groups: number; students: Set<string> }> = {};
    groups.filter((g: any) => g.courseId === courseId).forEach((g: any) => {
      const bid = g.branchId || '__none__';
      acc[bid] = acc[bid] || { groups: 0, students: new Set() };
      acc[bid].groups++;
      (g.studentIds || []).forEach((s: string) => acc[bid].students.add(s));
    });
    return Object.entries(acc)
      .map(([bid, v]) => ({ bid, name: bid === '__none__' ? t('courses.noBranch', 'Без филиала') : (branchNameById[bid] || t('common.branch', 'Филиал')), groups: v.groups, students: v.students.size }))
      .sort((a, b) => b.groups - a.groups);
  };

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditing(c); setForm({ title: c.title, description: c.description || '', subject: c.subject || '', status: c.status as any || 'draft', price: c.price || 0, paymentFormat: c.paymentFormat || 'monthly', durationMonths: c.durationMonths || 1 }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (!(Number(form.price) >= 0)) { setError(t('common.priceNegative', 'Цена не может быть отрицательной')); return; }
    setSaving(true); setError('');
    try {
      if (editing) { const u = await orgUpdateCourse({ id: editing.id, ...form }); setCourses((p) => p.map((c) => c.id === editing.id ? { ...c, ...u } : c)); }
      else { const c = await orgCreateCourse(form); setCourses((p) => [c, ...p]); }
      setShowModal(false);
    } catch (e: any) { setError(e.message || t('common.error', 'Ошибка')); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await orgDeleteCourse(id); setCourses((p) => p.filter((c) => c.id !== id)); toast.success(t('courses.deleted', 'Курс удалён')); }
    catch (e: any) { setError(e.message); }
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="pb-10">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.courses', 'Курсы')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            {activeBranch ? t('courses.list.countInBranch', { count: filtered.length, branch: activeBranch.name }) : t('courses.list.available', { count: filtered.length })}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canEditCourses && (
            <button
              onClick={openCreate}
              className="btn-primary flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />{t('org.courses.create', 'Создать')}
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="mb-3 flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative md:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('courses.list.searchPh', 'Поиск по названию или предмету...')}
            className="input pl-8"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {uniqueSubjects.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input w-auto">
                <option value="all">{t('lessons.list.allSubjects', 'Все предметы')}</option>
                {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {role === 'teacher' && (
            <div className="flex gap-0.5 shrink-0">
              {(['mine', 'all'] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`h-7 px-2 rounded-md text-sm transition-colors ${viewMode === m ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                  {m === 'mine' ? t('org.teach.mine', 'Мои') : t('org.teach.all', 'Все')}
                </button>
              ))}
            </div>
          )}

          {isStaff && (
            <div className="flex gap-0.5 shrink-0 md:ml-1">
              {(['all', 'published', 'draft'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`h-7 px-2 rounded-md text-sm transition-colors ${statusFilter === s ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                  {s === 'all' ? t('common.all', 'Все') : s === 'published' ? t('common.published', 'Опубликован') : t('common.draft', 'Черновик')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || subjectFilter !== 'all' ? t('finances.nothingFound', 'Ничего не найдено') : t('org.courses.empty', 'Курсов пока нет')}
          description={search || subjectFilter !== 'all' ? t('lessons.list.tryOtherFilters', 'Попробуйте изменить фильтры поиска') : t('org.courses.emptyDesc', 'Создайте первый курс для вашей организации')}
          actionLabel={canEditCourses ? t('org.courses.create', 'Создать') : undefined}
          onAction={canEditCourses ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-3 items-center px-3 h-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t('lessons.titleLabel', 'Название')}</span>
            <span>{t('lessons.subject', 'Предмет')}</span>
            <span>{t('nav.groups', 'Группы')}</span>
            <span>{t('groups.list.colStudents', 'Студенты')}</span>
            {isStaff && <span>{t('common.status', 'Статус')}</span>}
            {(canEditCourses || canDeleteCourses) && <span></span>}
          </div>

          {filtered.map((course) => {
            const isMember = !!course.teacherIds?.includes(profile?.uid || '');
            return (
            <div
              key={course.id}
              onClick={() => navigate(`/courses/${course.id}`)}
              className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_120px_80px_80px_80px_60px] gap-2 md:gap-3 items-center px-3 py-3 md:py-1.5 md:min-h-[40px] border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative"
            >
              {/* Title + icon */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-xs text-slate-400 truncate mt-0.5 hidden lg:block">{course.description}</p>
                  )}
                  {/* Per-branch split — only on «Все филиалы», where `groups` spans all branches */}
                  {!activeBranchId && canSwitch && (
                    <div className="hidden md:flex items-center gap-1 mt-1 flex-wrap">
                      {branchBreakdown(course.id).map((b) => (
                        <span
                          key={b.bid}
                          title={t('courses.list.branchTip', 'Групп: {{groups}} · студентов: {{students}}', { groups: b.groups, students: b.students })}
                          className={`inline-flex items-center h-5 text-xs font-medium px-1.5 rounded ${b.bid === '__none__' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}
                        >
                          {b.name} · {b.groups}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Mobile-only meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {course.subject && <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center h-5 px-1.5 rounded text-xs font-medium">{course.subject}</span>}
                    <span className="text-xs text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" />{t('courses.list.groupsShort', '{{count}} гр.', { count: getGroupCount(course.id) })}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />{getStudentCount(course.id)}</span>
                    {(course.price && course.price > 0) && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('courses.detail.priceSom', '{{amount}} сом', { amount: course.price })}</span>
                    )}
                    {isStaff && (
                      <span className={`inline-flex items-center h-5 text-xs font-medium px-1.5 rounded ${course.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {course.status === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    )}
                    {role === 'teacher' && (
                      <button
                        onClick={(e) => toggleTeachCourse(course, e)}
                        disabled={togglingId === course.id}
                        className={`text-xs font-medium h-6 px-2 rounded-md inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${isMember ? 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300' : 'bg-primary-600 text-white'}`}
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
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-xs font-medium truncate text-center">{course.subject}</span>
                )}
                {(course.price && course.price > 0) ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-center">{t('courses.detail.priceSom', '{{amount}} сом', { amount: course.price })}</span>
                ) : null}
              </div>

              {/* Groups */}
              <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{getGroupCount(course.id)}</span>
              </div>

              {/* Students */}
              <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{getStudentCount(course.id)}</span>
              </div>

              {/* Status (staff only) */}
              {isStaff && (
                <div className="hidden md:block">
                  <span className={`inline-flex items-center h-5 text-xs px-1.5 rounded font-medium ${course.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                    {course.status === 'published' ? t('common.published') : t('common.draft')}
                  </span>
                </div>
              )}

              {/* Actions: admins edit/delete, teachers join/leave */}
              {canEditCourses || canDeleteCourses ? (
                <div className="hidden md:flex items-center gap-1.5 justify-end">
                  {canEditCourses && <button onClick={(e) => { e.stopPropagation(); openEdit(course); }} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors tooltip" data-tip={t('common.edit', 'Редактировать')} aria-label={t('common.edit', 'Редактировать')}>
                    <Edit className="w-3.5 h-3.5" />
                  </button>}
                  {canDeleteCourses && <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors tooltip" data-tip={t('common.delete', 'Удалить')} aria-label={t('common.delete', 'Удалить')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>}
                </div>
              ) : role === 'teacher' ? (
                <div className="hidden md:flex items-center justify-end">
                  <button
                    onClick={(e) => toggleTeachCourse(course, e)}
                    disabled={togglingId === course.id}
                    title={isMember ? t('org.teach.leaveCourse', 'Выйти из курса') : t('org.teach.joinCourse', 'Преподавать этот курс')}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-50 ${isMember ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}
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
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-pop border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{editing ? t('common.edit') : t('org.courses.create')}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">{t('org.courses.titlePlaceholder')}</label>
                <input placeholder={t('org.courses.titlePlaceholder')} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="input" autoFocus />
              </div>
              <div>
                <label className="label">{t('org.courses.subject', 'Предмет')}</label>
                <input placeholder={t('org.courses.subjectPlaceholder')} value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">{t('common.description', 'Описание')}</label>
                <textarea placeholder={t('org.courses.descPlaceholder')} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="input min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('common.status')}</label>
                  <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as any }))} className="input appearance-none">
                    <option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('courses.list.price', 'Стоимость')}</label>
                  <input type="number" min="0" placeholder="0" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="input" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursesPage;
