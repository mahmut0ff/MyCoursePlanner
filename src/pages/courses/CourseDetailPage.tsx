import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetCourse, orgUpdateCourse, orgDeleteCourse, orgGetGroups, orgCreateGroup, orgEnrollInGroup } from '../../lib/api';
import { ArrowLeft, BookOpen, Calendar, Users, FileText, Edit, Trash2, Plus, MessageSquare, Coins, LayoutGrid, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { hasRosterManagement } from '../../lib/rbac';
import type { Course, Group } from '../../types';
import toast from 'react-hot-toast';
import { SyllabusBuilder } from '../../components/syllabuses/SyllabusBuilder';
import { numericDateLocale } from '../../lib/locale';

const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { activeBranchId, branches, canSwitch } = useBranch();
  const { can, canWrite, canDelete } = usePermissions();
  // Курс правит сервер только админу/менеджеру с courses:write; группу создаёт
  // ведущий контингент с groups:write (как createGroup на сервере).
  const isAdmin = role === 'admin' || role === 'manager';
  const canEditCourse = isAdmin && canWrite('courses');
  const canDeleteCourse = isAdmin && canDelete('courses');
  const canCreateGroup = hasRosterManagement(role, can) && canWrite('groups');
  const isStudent = role === 'student';

  const [course, setCourse] = useState<Course | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  
  // Form states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [editForm, setEditForm] = useState<{
    title: string; description: string; subject: string; status: 'draft' | 'published';
    price?: number; paymentFormat?: 'one-time' | 'monthly'; durationMonths?: number;
  }>({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 });

  const [groupForm, setGroupForm] = useState({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingGroupId, setExistingGroupId] = useState('');

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([orgGetCourse(id), orgGetGroups()])
      .then(([found, allGroupsData]) => {
        setCourse(found || null);
        if (found) {
          setEditForm({ 
            title: found.title, 
            description: found.description || '', 
            subject: found.subject || '', 
            status: found.status as any || 'draft', 
            price: found.price || 0, 
            paymentFormat: found.paymentFormat || 'monthly', 
            durationMonths: found.durationMonths || 1 
          });
          setAllGroups(allGroupsData);
          setGroups(allGroupsData.filter((g: Group) => g.courseId === found.id));
        }
      })
      .finally(() => setLoading(false));
  };

  // Re-fetch when the branch switches: groups (and the stat cards driven by them)
  // are branch-scoped server-side, so the whole page follows the active branch.
  useEffect(() => {
    loadData();
  }, [id, activeBranchId]);

  // Per-branch split of this course's groups. Meaningful only on «Все филиалы»,
  // where `groups` spans every branch (a picked branch scopes it to one).
  const branchSplit = React.useMemo(() => {
    const acc: Record<string, { groups: number; students: Set<string> }> = {};
    groups.forEach((g) => {
      const bid = g.branchId || '__none__';
      acc[bid] = acc[bid] || { groups: 0, students: new Set() };
      acc[bid].groups++;
      (g.studentIds || []).forEach((s) => acc[bid].students.add(s));
    });
    return Object.entries(acc)
      .map(([bid, v]) => ({ bid, name: bid === '__none__' ? t('courses.noBranch', 'Без филиала') : (branches.find(b => b.id === bid)?.name || t('common.branch', 'Филиал')), groups: v.groups, students: v.students.size }))
      .sort((a, b) => b.groups - a.groups);
  }, [groups, branches, t]);

  const handleUpdateCourse = async () => {
    if (!course || !editForm.title.trim()) return;
    setSaving(true); setError('');
    try {
      const u = await orgUpdateCourse({ id: course.id, ...editForm });
      setCourse({ ...course, ...u });
      setShowEditModal(false);
    } catch (e: any) { setError(e.message || t('courses.detail.updateFailed', 'Не удалось сохранить курс')); } finally { setSaving(false); }
  };

  const handleDeleteCourse = async () => {
    if (!course) return;
    if (!confirm(t('common.confirmDelete', 'Вы уверены, что хотите удалить?'))) return;
    try { 
      await orgDeleteCourse(course.id); 
      navigate('/courses');
    } catch (e: any) { setError(e.message); }
  };

  const handleCreateGroup = async () => {
    if (!course || !groupForm.name.trim()) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateGroup({ 
        ...groupForm,
        courseId: course.id,
        courseName: course.title 
      });
      setGroups(prev => [created, ...prev]);
      setAllGroups(prev => [...prev, created]);
      setShowGroupModal(false);
      setGroupForm({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
    } catch (e: any) { setError(e.message || t('groups.detail.saveFailed', 'Не удалось сохранить группу')); } finally { setSaving(false); }
  };

  const handleAttachExistingGroup = async () => {
    import('../../lib/api').then(async ({ orgUpdateGroup }) => {
      if (!course || !existingGroupId) return;
      setSaving(true); setError('');
      try {
        const updated = await orgUpdateGroup({
          id: existingGroupId,
          courseId: course.id,
          courseName: course.title
        });
        setGroups(prev => [updated, ...prev]);
        setAllGroups(prev => prev.map(g => g.id === existingGroupId ? updated : g));
        setShowGroupModal(false);
        setExistingGroupId('');
      } catch (e: any) { 
        setError(e.message || t('courses.detail.attachFailed', 'Не удалось привязать группу')); 
      } finally { 
        setSaving(false); 
      }
    });
  };

  const handleEnrollGroup = async (groupId: string) => {
    setSaving(true);
    try {
      await orgEnrollInGroup(groupId);
      toast.success(t('studentDashboard.groupJoinSuccess', 'Заявка в группу отправлена или вы успешно добавлены!'));
      // re-load groups to update UI
      const g = await orgGetGroups();
      setAllGroups(g);
      setGroups(g.filter((gg: Group) => gg.courseId === course?.id));
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
    </div>
  );
  
  if (!course) return (
    <div className="text-center py-20 animate-fade-in">
      <BookOpen className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
      <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('common.notFound', 'Не найдено')}</h3>
      <button onClick={() => navigate('/courses')} className="btn-secondary mt-3">{t('common.back', 'Назад к курсам')}</button>
    </div>
  );

  return (
    <div className="pb-10 font-sans animate-fade-in space-y-4">
      {/* Back Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/courses')} className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('common.back', 'Назад')}
        </button>
        {(canEditCourse || canDeleteCourse) && (
          <div className="flex items-center gap-2">
            {canEditCourse && <button onClick={() => setShowEditModal(true)} className="btn-secondary inline-flex items-center gap-1.5">
              <Edit className="w-3.5 h-3.5" /> {t('common.edit', 'Редактировать')}
            </button>}
            {canDeleteCourse && <button onClick={handleDeleteCourse} className="flex items-center justify-center w-8 h-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>}
          </div>
        )}
      </div>

      {error && <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Premium Hero Section */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        
        <div className="relative p-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className={`inline-flex items-center h-5 px-1.5 text-xs font-medium rounded ${course.status === 'published' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'}`}>
                  {course.status === 'published' ? t('common.published') : t('common.draft')}
                </span>
                {course.subject && (
                  <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded">
                    {course.subject}
                  </span>
                )}
              </div>
              
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {course.title}
              </h1>
              
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {course.description ? (
                  course.description
                ) : (
                  <span className="italic opacity-80">
                    {isStudent 
                      ? t('studentCourses.noDescription', 'У этого курса пока нет описания.')
                      : t('courses.detail.noDescription', 'Описание курса не добавлено. Добавьте описание, чтобы студентам было проще понять, о чём курс.')}
                  </span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {(course.price && course.price > 0) ? (
                  <div className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                    <Coins className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{t('courses.detail.priceSom', '{{amount}} сом', { amount: course.price.toLocaleString(numericDateLocale()) })}</span>
                    <span className="text-xs opacity-70">
                      /{course.paymentFormat === 'monthly' ? t('courses.detail.perMonth', 'мес') : t('courses.detail.oneTimeShort', 'разово')}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium">
                    <Coins className="w-3.5 h-3.5 opacity-50" />
                    <span>{t('courses.detail.free', 'Бесплатно')}</span>
                  </div>
                )}
              </div>

              {isStudent && groups.some(g => g.studentIds?.includes(profile?.uid as string)) && (
                <div className="mt-3 w-full sm:w-auto px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm font-medium border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {t('courses.detail.enrolled', 'Вы учитесь на этом курсе')}
                </div>
              )}
            </div>

            {/* Stats Keycards Grid */}
            <div className="grid grid-cols-2 gap-2 shrink-0 md:w-72">
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg grid grid-cols-[1fr_auto] items-center gap-y-0.5">
                <FileText className="w-3.5 h-3.5 text-slate-400 col-start-2 row-start-1" />
                <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 col-span-2 row-start-2">{groups.length}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 col-start-1 row-start-1">{t('courses.detail.statGroups', 'Группы')}</span>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg grid grid-cols-[1fr_auto] items-center gap-y-0.5">
                <Users className="w-3.5 h-3.5 text-slate-400 col-start-2 row-start-1" />
                <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 col-span-2 row-start-2">{new Set(groups.flatMap((g) => g.studentIds || [])).size}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 col-start-1 row-start-1">{t('courses.detail.statStudents', 'Студенты')}</span>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg col-span-2 flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <span className="block text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {course.createdAt ? new Date(course.createdAt).toLocaleDateString(numericDateLocale()) : '—'}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t('common.created', 'Создан')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Per-branch activity — only on «Все филиалы», where groups span every branch */}
      {!activeBranchId && canSwitch && groups.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('courses.byBranch', 'По филиалам')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('courses.detail.byBranchDesc', 'Активность этого курса в каждом филиале')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchSplit.map((b) => (
              <div key={b.bid} className={`rounded-lg border p-3 ${b.bid === '__none__' ? 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/15' : 'border-slate-200 dark:border-slate-700'}`}>
                <span className={`block text-sm font-medium truncate mb-2 ${b.bid === '__none__' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'}`}>{b.name}</span>
                <div className="flex items-end gap-4">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{b.groups}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('courses.groupsLower', 'групп')}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{b.students}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('courses.studentsShort', 'студ.')}</span>
                  </div>
                </div>
                {b.bid === '__none__' && <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 font-medium">{t('courses.noBranchHint', 'Группам не назначен филиал')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Syllabus Builder Section */}
      {/* Syllabus + groups side by side on wide screens; groups go full width when there's no syllabus */}
      <div className={canEditCourse ? 'grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start' : ''}>
      {canEditCourse && (
        // SyllabusBuilder carries its own mt-4 — zero it so both columns start level
        <div className="min-w-0 [&>*]:mt-0">
          <SyllabusBuilder courseId={course.id} />
        </div>
      )}

      {/* Course Groups Section */}
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('courses.detail.groupsTitle', 'Группы на курсе')}</h2>
          </div>
          {canCreateGroup && (
            <button onClick={() => setShowGroupModal(true)} className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t('courses.detail.addGroup', 'Добавить группу')}
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="border border-slate-300 border-dashed dark:border-slate-700 rounded-lg py-10 px-4 text-center">
            <LayoutGrid className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('courses.detail.noGroups', 'Нет привязанных групп')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-3">{t('courses.detail.noGroupsDesc', 'Создайте группу и добавьте в неё студентов, чтобы они могли начать обучение на этом курсе.')}</p>
            {canCreateGroup && (
              <button onClick={() => setShowGroupModal(true)} className="btn-secondary inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> {t('courses.detail.addGroup', 'Добавить группу')}
              </button>
            )}
          </div>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${canEditCourse ? 'lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-2' : 'lg:grid-cols-3'}`}>
            {groups.map((group) => (
              <div 
                key={group.id} 
                onClick={() => {
                  if (isStudent) return;
                  navigate(`/groups/${group.id}`);
                }} 
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 transition-colors group/item ${!isStudent ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 rounded-md flex items-center justify-center text-xs font-semibold">
                      {group.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">{group.name}</h4>
                      <p className="text-xs text-slate-500">{t('teachers.detail.students', { count: group.studentIds?.length || 0 })}</p>
                    </div>
                  </div>
                  {!isStudent && (
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-100 transition-colors">
                      <ArrowLeft className="w-3.5 h-3.5 rotate-135" style={{ transform: 'rotate(135deg)' }} />
                    </div>
                  )}
                </div>
                {group.chatLinkUrl && (
                  <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {group.chatLinkTitle || t('groups.detail.groupChat', 'Чат группы')}
                    </div>
                    {isStudent && !group.studentIds?.includes(profile?.uid as string) && (
                      <button 
                         onClick={(e) => { e.stopPropagation(); handleEnrollGroup(group.id); }}
                         className="btn-primary"
                      >
                         {t('courses.detail.join', 'Вступить')}
                      </button>
                    )}
                    {isStudent && group.studentIds?.includes(profile?.uid as string) && (
                      <span className="inline-flex items-center h-5 text-xs font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 rounded">{t('courses.detail.youAreHere', 'Вы тут')}</span>
                    )}
                  </div>
                )}
                {!group.chatLinkUrl && isStudent && (
                   <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                     {!group.studentIds?.includes(profile?.uid as string) ? (
                        <button 
                           onClick={(e) => { e.stopPropagation(); handleEnrollGroup(group.id); }}
                           className="btn-primary"
                        >
                           {t('courses.detail.join', 'Вступить')}
                        </button>
                     ) : (
                        <span className="inline-flex items-center h-5 text-xs font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 rounded">{t('courses.detail.youAreHere', 'Вы тут')}</span>
                     )}
                   </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Edit Course Modal */}
      {showEditModal && canEditCourse && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-lg shadow-pop overflow-y-auto max-h-[90vh] border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('courses.detail.editCourse', 'Редактировать курс')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('common.name')}</label>
                <input placeholder={t('org.courses.titlePlaceholder')} value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">{t('org.courses.subject', 'Предмет')}</label>
                <input placeholder={t('org.courses.subjectPlaceholder')} value={editForm.subject} onChange={(e) => setEditForm(f => ({ ...f, subject: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">{t('common.description', 'Описание')}</label>
                <textarea placeholder={t('org.courses.descPlaceholder')} value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="input min-h-[120px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('common.status')}</label>
                  <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as any }))} className="input appearance-none">
                    <option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('courses.detail.priceLabel', 'Стоимость (с.)')}</label>
                  <input type="number" min="0" placeholder="0" value={editForm.price} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className="input" />
                </div>
                <div className="col-span-2">
                  <label className="label">{t('courses.detail.paymentFormat', 'Формат оплаты')}</label>
                  <select value={editForm.paymentFormat} onChange={(e) => setEditForm(f => ({ ...f, paymentFormat: e.target.value as any }))} className="input appearance-none">
                    <option value="monthly">{t('common.monthly', 'Ежемесячно')}</option>
                    <option value="one-time">{t('common.oneTime', 'Единоразово')}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowEditModal(false)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={handleUpdateCourse} disabled={saving || !editForm.title.trim()} className="btn-primary disabled:opacity-50">{saving ? t('common.saving', 'Сохранение...') : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Group Modal */}
      {showGroupModal && canCreateGroup && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-pop border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('courses.detail.addGroup', 'Добавить группу')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('courses.detail.courseLabel', 'Курс:')} <span className="text-slate-900 dark:text-slate-100 font-semibold">{course.title}</span></p>
            
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-3">
              <button 
                onClick={() => setAddMode('new')}
                className={`flex-1 h-8 -mb-px border-b-2 text-sm font-medium transition-colors ${addMode === 'new' ? 'border-primary-600 text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('courses.detail.createNew', 'Создать новую')}
              </button>
              <button 
                onClick={() => setAddMode('existing')}
                className={`flex-1 h-8 -mb-px border-b-2 text-sm font-medium transition-colors ${addMode === 'existing' ? 'border-primary-600 text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('courses.detail.pickExisting', 'Выбрать существующую')}
              </button>
            </div>

            {addMode === 'new' ? (
              <div className="space-y-3">
                <div>
                  <label className="label">{t('groups.detail.groupName', 'Название группы')} *</label>
                  <input placeholder={t('courses.detail.groupNamePh', 'Например: Фронтенд 2024')} value={groupForm.name} onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))} className="input" autoFocus />
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('groups.list.chatLink', 'Ссылка на чат')}</span>
                  </div>
                  <div className="space-y-3">
                    <input placeholder={t('courses.detail.chatTitlePh', 'Название чата (напр. Telegram)')} value={groupForm.chatLinkTitle} onChange={(e) => setGroupForm(f => ({ ...f, chatLinkTitle: e.target.value }))} className="input" />
                    <input placeholder="https://t.me/..." value={groupForm.chatLinkUrl} onChange={(e) => setGroupForm(f => ({ ...f, chatLinkUrl: e.target.value }))} className="input" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label">{t('courses.detail.selectGroup', 'Выберите группу')}</label>
                  <select 
                    value={existingGroupId} 
                    onChange={e => setExistingGroupId(e.target.value)}
                    className="input"
                  >
                    <option value="">{t('courses.detail.selectGroupOpt', '-- Выберите группу --')}</option>
                    {allGroups.filter(g => g.courseId !== course.id).map(g => (
                      <option key={g.id} value={g.id}>{g.name} {g.courseId ? `(${g.courseName})` : `(${t('teachers.detail.noCourse', 'Без курса')})`}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={() => {
                  setShowGroupModal(false);
                  setAddMode('new');
                  setExistingGroupId('');
                  setGroupForm({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
                }} 
                className="btn-ghost"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={addMode === 'new' ? handleCreateGroup : handleAttachExistingGroup} 
                disabled={saving || (addMode === 'new' ? !groupForm.name.trim() : !existingGroupId)} 
                className="btn-primary disabled:opacity-50"
              >
                {saving ? t('common.saving', 'Сохранение...') : (addMode === 'new' ? t('groups.list.create', 'Создать группу') : t('courses.detail.linkGroup', 'Привязать группу'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetailPage;
