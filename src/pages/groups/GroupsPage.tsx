import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useBranch } from '../../contexts/BranchContext';
import { useOrg } from '../../contexts/OrgContext';
import { term } from '../../lib/terminology';
import { orgGetGroups, orgCreateGroup, orgDeleteGroup, orgGetCourses, orgGetTeachers, orgTeacherJoinGroup, orgTeacherLeaveGroup, orgGetSettings } from '../../lib/api';
import { Users, Plus, Search, Trash2, RefreshCw, Loader2, BookOpen, Building2, UserPlus, LogOut, GripVertical, ListRestart } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group, GroupStatus, Course, UserProfile } from '../../types';
import { useGroupOrder } from '../../lib/groupOrderPrefs';
import BranchFilter from '../../components/ui/BranchFilter';
import { numericDateLocale } from '../../lib/locale';
import { hasRosterManagement } from '../../lib/rbac';
import toast from 'react-hot-toast';

// Compact status pill for the table — only rendered for non-active groups so an
// "active" group stays visually clean.
const GROUP_STATUS_PILL: Record<Exclude<GroupStatus, 'active'>, { label: string; className: string }> = {
  completed: { label: 'Завершена', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  archived: { label: 'В архиве', className: 'bg-slate-200 text-slate-600 dark:bg-slate-700/60 dark:text-slate-400' },
};

/**
 * A table row the user can drag to rearrange. The drag listeners live on the grip
 * alone, never on the row: the row itself is a navigation target, and binding them
 * to it would turn every click into a potential drag.
 */
const SortableGroupRow: React.FC<{ id: string; onClick: () => void; children: React.ReactNode }> = ({ id, onClick, children }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onClick}
      className={`group/row hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${isDragging ? 'relative z-10 opacity-60 bg-white dark:bg-slate-800' : ''}`}
    >
      <td className="pl-3 pr-1 py-1.5 w-8">
        {/* touch-none: without it a touch drag scrolls the page instead of moving the row. */}
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="touch-none p-1 -m-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-grab active:cursor-grabbing opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 transition-all"
          title={t('groups.list.dragHint', 'Перетащите, чтобы изменить порядок')}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      {children}
    </tr>
  );
};



const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { institutionType } = useOrg();
  const { role, profile } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const { canWrite, canDelete, can } = usePermissions();
  // Группами всей организации распоряжается ведущий контингент — как isRosterManager на сервере.
  const isAdmin = hasRosterManagement(role, can);
  // Вступить в чужую группу — значит получить её учеников, поэтому сам вступает
  // только ведущий контингент (сервер: teacherJoinGroup). Выйти может любой.
  const canSelfJoin = hasRosterManagement(role, can);
  // The delete button also needs the grant: a manager whose groups:delete was revoked
  // via per-member overrides used to see it and only learn on the 403.
  const canDeleteGroups = isAdmin && canDelete('groups');
  
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
  // Teachers browse all groups ('all') or just the ones they teach ('mine')
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Org policy: may teachers create/edit/delete groups they own? (admin-controlled)
  const [teacherCanManage, setTeacherCanManage] = useState(false);
  // Who may create groups from this page: admins/managers always, teachers when the policy is on.
  const canCreate = canWrite('groups') && (isAdmin || (role === 'teacher' && teacherCanManage));

  const load = () => {
    setLoading(true); setError('');
    Promise.all([
      orgGetGroups(),
      orgGetCourses(),
      orgGetTeachers()
    ])
    .then(([g, c, t]) => {
      // Keep the full course list for name lookups. Students see only their own groups;
      // teachers get the full list and switch between "Мои"/"Все" via viewMode below.
      let displayGroups = g;
      if (role === 'student' && profile?.uid) {
        displayGroups = g.filter((group: Group) => group.studentIds?.includes(profile.uid));
      }
      setGroups(displayGroups); setCourses(c); setTeachers(t);
    })
    .catch((e) => setError(e.message || t('common.error', 'Ошибка')))
    .finally(() => setLoading(false));
  };

  // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  useEffect(() => { load(); }, [role, profile?.uid, activeBranchId]);

  // Teachers need to know whether the org lets them manage their own groups.
  useEffect(() => {
    if (role !== 'teacher') { setTeacherCanManage(false); return; }
    let cancelled = false;
    orgGetSettings()
      .then((s) => { if (!cancelled) setTeacherCanManage(!!s.teacherGroupManagement); })
      .catch(() => { if (!cancelled) setTeacherCanManage(false); });
    return () => { cancelled = true; };
  }, [role]);

  // Manual arrangement is per-user and local — dragging never touches the group record.
  const { order, hasCustomOrder, reorder, reset: resetOrder } = useGroupOrder(profile?.uid);
  const ordered = order(groups);
  const filtered = ordered.filter((g) => {
    if (role === 'teacher' && viewMode === 'mine' && !g.teacherIds?.includes(profile?.uid || '')) return false;
    return g.name.toLowerCase().includes(search.toLowerCase());
  });

  const sensors = useSensors(
    // A short threshold so a click on the grip still reads as a click, not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Only the rows actually on screen may move; everything filtered out keeps its place.
    reorder(ordered.map((g) => g.id), filtered.map((g) => g.id), String(active.id), String(over.id));
  };

  // Teacher self-service: add/remove yourself as a teacher of this group
  const toggleTeachGroup = async (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile?.uid || togglingId) return;
    const isMember = !!group.teacherIds?.includes(profile.uid);
    if (isMember && !window.confirm(t('org.teach.leaveConfirm', 'Выйти из группы «{{name}}»?', { name: group.name }))) return;
    setTogglingId(group.id);
    try {
      if (isMember) await orgTeacherLeaveGroup(group.id);
      else await orgTeacherJoinGroup(group.id);
      toast.success(isMember ? t('org.teach.left', 'Вы вышли из группы') : t('org.teach.joined', 'Вы ведёте эту группу'));
      setGroups(prev => prev.map(g => g.id === group.id ? {
        ...g,
        teacherIds: isMember
          ? (g.teacherIds || []).filter(id => id !== profile.uid)
          : [...(g.teacherIds || []), profile.uid],
      } : g));
    } catch (err: any) { setError(err.message || t('common.error', 'Ошибка')); } finally { setTogglingId(null); }
  };
  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || t('groups.list.courseNotFound', 'Курс не найден');

  const handleCreate = async () => {
    if (!form.name.trim() || !form.courseId) {
      toast.error(t('common.groupNameCourseRequired', 'Укажите название группы и курс'));
      return;
    }
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
    } catch (e: any) { toast.error(e.message || t('common.error', 'Ошибка')); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('common.confirmDelete', 'Удалить группу?'))) return;
    try { await orgDeleteGroup(id); setGroups((p) => p.filter((g) => g.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-4 pb-10 cursor-default">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{term(t, institutionType, 'groups')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t('groups.list.total', 'Всего групп: {{count}}', { count: filtered.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasCustomOrder && (
            <button
              onClick={resetOrder}
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('org.groups.resetOrder', 'Сбросить свой порядок групп')}
            >
              <ListRestart className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={load} aria-label={t('common.refresh', 'Обновить')} title={t('common.refresh', 'Обновить')} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
          {canCreate && (
            <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t('groups.list.create', 'Создать группу')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Search + teacher view toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('common.search', 'Поиск')}...`}
            className="input pl-8"
          />
        </div>
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
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
          <Users className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('org.groups.empty', 'Список пуст')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-sm mx-auto">{t('org.groups.emptyDesc', 'Создайте первую группу, чтобы распределить учеников.')}</p>
          {canCreate && (
            <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t('groups.list.create', 'Создать группу')}
            </button>
          )}
        </div>
      ) : (
        /* ═══ Premium Data Table ═══ */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-8 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  {/* Drag handle column — mirrors the grip cell below, or the column count drifts. */}
                  <th className="w-8 pl-3 pr-1" />
                  <th className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.list.colGroup', 'Группа')}</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.list.colCourse', 'Курс')}</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.list.colStudents', 'Студенты')}</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.list.colTeachers', 'Учителя')}</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.list.colCreated', 'Создана')}</th>
                  {/* Mirrors the cell below exactly, or the column count drifts from the header. */}
                  {(canDeleteGroups || role === 'teacher') && <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{canDeleteGroups ? t('common.actions', 'Действия') : t('groups.list.colTeaching', 'Преподавание')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <SortableContext items={filtered.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                {filtered.map((g) => {
                  const studentCount = g.studentIds?.length || 0;
                  const groupTeacherIds = g.teacherIds || [];
                  const groupTeachers = teachers.filter(t => groupTeacherIds.includes(t.uid));
                  const isMemberOfGroup = !!(profile?.uid && groupTeacherIds.includes(profile.uid));
                  // A teacher may delete a group only if the org policy is on and they own it.
                  const canDeleteOwn = teacherCanManage && !!(profile?.uid && g.createdBy === profile.uid);

                  return (
                    <SortableGroupRow
                      key={g.id}
                      id={g.id}
                      onClick={() => navigate(`/groups/${g.id}`)}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-semibold text-xs shrink-0">
                            {g.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {g.name}
                              </p>
                              {g.status && g.status !== 'active' && (
                                <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${GROUP_STATUS_PILL[g.status].className}`}>
                                  {t(`groups.status.${g.status}`, GROUP_STATUS_PILL[g.status].label)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
                          <BookOpen className="w-3.5 h-3.5" />
                          {courseName(g.courseId)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">{studentCount}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        {groupTeachers.length > 0 ? (
                          <div className="flex -space-x-2">
                             {groupTeachers.slice(0, 3).map((t, tid) => (
                                t.avatarUrl ? (
                                  <img key={tid} src={t.avatarUrl} className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-slate-800" title={t.displayName} />
                                ) : (
                                  <div key={tid} className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-semibold ring-2 ring-white dark:ring-slate-800" title={t.displayName}>
                                     {t.displayName?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )
                             ))}
                             {groupTeachers.length > 3 && (
                                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-xs font-semibold ring-2 ring-white dark:ring-slate-800">
                                  +{groupTeachers.length - 3}
                                </div>
                             )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                        {g.createdAt ? new Date(g.createdAt).toLocaleDateString(numericDateLocale()) : '—'}
                      </td>
                      {canDeleteGroups ? (
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover/row:opacity-100"
                            title={t('common.delete', 'Удалить')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      ) : role === 'teacher' ? (
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(isMemberOfGroup || canSelfJoin) && <button
                              onClick={(e) => toggleTeachGroup(g, e)}
                              disabled={togglingId === g.id}
                              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${isMemberOfGroup ? 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                            >
                              {isMemberOfGroup ? <><LogOut className="w-3.5 h-3.5" />{t('org.teach.leave', 'Выйти')}</> : <><UserPlus className="w-3.5 h-3.5" />{t('org.teach.teach', 'Вести')}</>}
                            </button>}
                            {canDeleteOwn && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}
                                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover/row:opacity-100"
                                title={t('org.groups.deleteOwn', 'Удалить свою группу')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </SortableGroupRow>
                  );
                })}
                </SortableContext>
              </tbody>
            </table>
          </div>
        </div>
        </DndContext>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-md shadow-pop border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('groups.list.createNew', 'Создать новую группу')}</h2>
            
            <div className="space-y-3">
              <div>
                <label className="label">{t('common.name', 'Название')}</label>
                <input 
                  placeholder={t('groups.list.namePh', 'Осенний интенсив...')} 
                  value={form.name} 
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} 
                  className="input" 
                  autoFocus 
                />
              </div>
              <div>
                <label className="label">{t('nav.courses', 'Курс')}</label>
                <select 
                  value={form.courseId} 
                  onChange={(e) => setForm(f => ({ ...f, courseId: e.target.value }))} 
                  className="input cursor-pointer"
                >
                  <option value="">{t('groups.list.selectCourse', '-- Выберите курс --')}</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                {branches.length > 1 && (
                  <label className="label flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {t('common.branch', 'Филиал')}
                  </label>
                )}
                <BranchFilter
                  value={form.branchId || null}
                  onChange={(id) => setForm(f => ({ ...f, branchId: id || '' }))}
                  hideAll={false}
                  mode="select"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <label className="label">{t('groups.list.chatOptional', 'Чат (Опционально)')}</label>
                  <input placeholder="Telegram" value={form.chatLinkTitle} onChange={(e) => setForm(f => ({ ...f, chatLinkTitle: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">{t('groups.list.chatLink', 'Ссылка на чат')}</label>
                  <input placeholder="https://t.me/..." value={form.chatLinkUrl} onChange={(e) => setForm(f => ({ ...f, chatLinkUrl: e.target.value }))} className="input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
               <button onClick={() => setShowModal(false)} className="btn-ghost">
                 {t('common.cancel', 'Отмена')}
               </button>
               <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.courseId} className="btn-primary disabled:opacity-50 inline-flex items-center gap-1.5">
                 {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> ...</> : t('common.save', 'Создать')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
