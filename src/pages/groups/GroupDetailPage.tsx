import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroup, orgGetCourses, orgUpdateGroup, orgGetTeachers, orgGetStudents, apiGetSyllabuses, orgResetStudentPassword, orgGetSettings } from '../../lib/api';
import { ArrowLeft, Users, BookOpen, Calendar, Link as LinkIcon, Edit2, Check, X, Plus, Briefcase, GraduationCap, Building2, CheckCircle2, Circle, ExternalLink, KeyRound, Copy, Loader2, RefreshCw, Archive, ChevronDown, PlayCircle } from 'lucide-react';
import GroupAccessModal from '../../components/students/GroupAccessModal';
import type { Group, GroupStatus, Course, UserProfile, Syllabus } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import BranchFilter from '../../components/ui/BranchFilter';
import GroupScheduleSection from '../../components/schedule/GroupScheduleSection';
import { usePermissions } from '../../contexts/PermissionsContext';
import { canEditGroupSchedule, hasRosterManagement } from '../../lib/rbac';
import { isIssuedLoginEmail } from '../../lib/loginEmail';
import AccessDenied from '../../components/ui/AccessDenied';
import { numericDateLocale } from '../../lib/locale';

// Lifecycle statuses a group can move between, with their badge/menu styling.
const GROUP_STATUS_META: Record<GroupStatus, { label: string; icon: typeof PlayCircle; badge: string; dot: string }> = {
  active: {
    label: 'Активна',
    icon: PlayCircle,
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    dot: 'text-emerald-500',
  },
  completed: {
    label: 'Завершена',
    icon: CheckCircle2,
    badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    dot: 'text-blue-500',
  },
  archived: {
    label: 'В архиве',
    icon: Archive,
    badge: 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600',
    dot: 'text-slate-500',
  },
};
const GROUP_STATUS_ORDER: GroupStatus[] = ['active', 'completed', 'archived'];



const GroupDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { can, canWrite } = usePermissions();
  // Ведущий контингент (как isRosterManager на сервере), а не просто роль.
  const isAdmin = hasRosterManagement(role, can);

  const [group, setGroup] = useState<Group | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<UserProfile[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [showGroupAccess, setShowGroupAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  // Org policies (admin-controlled): may teachers manage groups they own, and may
  // they archive / change the status of groups they teach?
  const [teacherCanManage, setTeacherCanManage] = useState(false);
  const [teacherCanChangeStatus, setTeacherCanChangeStatus] = useState(false);

  // Course syllabus + curriculum progress
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);

  // Chat Link Edit State
  const [isEditingChat, setIsEditingChat] = useState(false);
  const [chatForm, setChatForm] = useState({ title: '', url: '' });
  const [savingChat, setSavingChat] = useState(false);

  // Group Info Edit State
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', courseId: '', branchId: '' });
  const [savingGroup, setSavingGroup] = useState(false);

  // Group status (active / completed / archived) dropdown
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Modals for adding teachers/students
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Student credentials — view login & issue a new password to hand over.
  // (Existing passwords can't be shown: they're hashed in Firebase Auth.)
  const [credStudent, setCredStudent] = useState<UserProfile | null>(null);
  const [credPw, setCredPw] = useState('');
  const [issuedPw, setIssuedPw] = useState<string | null>(null);
  const [savingCred, setSavingCred] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      orgGetGroup(id).then((found: Group) => {
        setGroup(found || null);
        if (found) {
          setChatForm({ title: found.chatLinkTitle || '', url: found.chatLinkUrl || '' });
          setEditGroupForm({ name: found.name || '', courseId: found.courseId || '', branchId: (found as any).branchId || '' });
        }
      }),
      orgGetCourses().then(setCourses).catch(() => []),
      orgGetTeachers().then(setAllTeachers).catch(() => []),
      orgGetStudents().then(setAllStudents).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [id]);

  // Teachers need to know which group policies the org enabled for them.
  useEffect(() => {
    if (role !== 'teacher') { setTeacherCanManage(false); setTeacherCanChangeStatus(false); return; }
    let cancelled = false;
    orgGetSettings()
      .then((s) => {
        if (cancelled) return;
        setTeacherCanManage(!!s.teacherGroupManagement);
        setTeacherCanChangeStatus(!!s.teacherGroupStatus);
      })
      .catch(() => { if (!cancelled) { setTeacherCanManage(false); setTeacherCanChangeStatus(false); } });
    return () => { cancelled = true; };
  }, [role]);

  // Load the course syllabus once we know the group's course.
  useEffect(() => {
    if (!group?.courseId) { setSyllabus(null); return; }
    apiGetSyllabuses(group.courseId)
      .then((data: any[]) => setSyllabus(Array.isArray(data) && data.length > 0 ? data[0] : null))
      .catch(() => setSyllabus(null));
  }, [group?.courseId]);

  // Flattened list of syllabus items in display order — drives progress math.
  const syllabusItems = (syllabus?.modules || []).flatMap(m => m.items);
  const currentIdx = group?.currentSyllabusItemId
    ? syllabusItems.findIndex(i => i.id === group.currentSyllabusItemId)
    : -1;
  const progressPct = syllabusItems.length > 0 && currentIdx >= 0
    ? Math.round(((currentIdx + 1) / syllabusItems.length) * 100)
    : 0;

  const setCurrentItem = async (itemId: string) => {
    if (!group) return;
    const next = group.currentSyllabusItemId === itemId ? '' : itemId;
    setSavingProgress(true);
    try {
      await orgUpdateGroup({ id: group.id, currentSyllabusItemId: next });
      setGroup({ ...group, currentSyllabusItemId: next || undefined });
    } catch (e: any) {
      toast.error(e.message || t('groups.detail.progressFailed', 'Не удалось обновить прогресс'));
    } finally {
      setSavingProgress(false);
    }
  };

  const courseName = group?.courseId ? courses.find(c => c.id === group.courseId)?.title || '—' : '—';

  const handleSaveChat = async () => {
    if (!group) return;
    setSavingChat(true);
    try {
      let finalUrl = chatForm.url.trim();
      if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }

      await orgUpdateGroup({
        id: group.id,
        chatLinkTitle: chatForm.title,
        chatLinkUrl: finalUrl
      });
      setGroup({ ...group, chatLinkTitle: chatForm.title, chatLinkUrl: finalUrl });
      setIsEditingChat(false);
      toast.success(t('common.saved', 'Сохранено'));
    } catch (e: any) {
      toast.error(e.message || t('groups.detail.chatSaveFailed', 'Не удалось сохранить ссылку на чат'));
    } finally {
      setSavingChat(false);
    }
  };

  const handleSaveGroupInfo = async () => {
    if (!group || !editGroupForm.name.trim()) return;
    setSavingGroup(true);
    try {
      const selectedCourse = courses.find(c => c.id === editGroupForm.courseId);
      // Using `any` cast for orgUpdateGroup to pass optional params easily if types are strict
      const payload = {
        id: group.id,
        name: editGroupForm.name,
        courseId: editGroupForm.courseId || '',
        courseName: selectedCourse ? selectedCourse.title : '',
        branchId: editGroupForm.branchId || ''
      };
      
      await orgUpdateGroup(payload);
      
      setGroup({
        ...group,
        name: payload.name,
        courseId: payload.courseId,
        courseName: payload.courseName as any
      });
      setShowEditGroupModal(false);
      toast.success(t('common.saved', 'Сохранено'));
    } catch (e: any) {
      toast.error(e.message || t('groups.detail.saveFailed', 'Не удалось сохранить группу'));
    } finally {
      setSavingGroup(false);
    }
  };

  const handleChangeStatus = async (next: GroupStatus) => {
    setShowStatusMenu(false);
    if (!group || (group.status || 'active') === next) return;
    setChangingStatus(true);
    try {
      await orgUpdateGroup({ id: group.id, status: next });
      setGroup({ ...group, status: next });
      toast.success(t('groups.detail.statusChanged', 'Статус: {{status}}', { status: t(`groups.status.${next}`, GROUP_STATUS_META[next].label) }));
    } catch (e: any) {
      toast.error(e.message || t('groups.detail.statusFailed', 'Не удалось изменить статус'));
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!group || !selectedUserId) return;
    setAddingUser(true);
    try {
      const currentIds = group.teacherIds || [];
      if (!currentIds.includes(selectedUserId)) {
        await orgUpdateGroup({ id: group.id, teacherIds: [...currentIds, selectedUserId] });
        setGroup({ ...group, teacherIds: [...currentIds, selectedUserId] });
        toast.success(t('groups.detail.teacherAssigned', 'Преподаватель назначен!'));
      }
      setShowAddTeacher(false);
      setSelectedUserId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingUser(false);
    }
  };


  const handleAddStudent = async () => {
    if (!group || !selectedUserId) return;
    setAddingUser(true);
    try {
      const currentIds = group.studentIds || [];
      if (!currentIds.includes(selectedUserId)) {
        await orgUpdateGroup({ id: group.id, studentIds: [...currentIds, selectedUserId] });
        setGroup({ ...group, studentIds: [...currentIds, selectedUserId] });
        toast.success(t('groups.detail.studentAdded', 'Ученик добавлен!'));
      }
      setShowAddStudent(false);
      setSelectedUserId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    if (!group) return;
    if (!window.confirm(t('groups.detail.removeTeacherConfirm', 'Снять преподавателя с группы?'))) return;
    try {
      const newIds = (group.teacherIds || []).filter(id => id !== teacherId);
      await orgUpdateGroup({ id: group.id, teacherIds: newIds });
      setGroup({ ...group, teacherIds: newIds });
      toast.success(t('groups.detail.teacherRemoved', 'Преподаватель снят с группы'));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    if (!window.confirm(t('groups.detail.removeStudentConfirm', 'Открепить ученика?'))) return;
    try {
      const currentIds = group.studentIds || [];
      const newIds = currentIds.filter(id => id !== studentId);
      await orgUpdateGroup({ id: group.id, studentIds: newIds });
      setGroup({ ...group, studentIds: newIds });
      toast.success(t('groups.detail.studentRemoved', 'Ученик откреплён'));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Readable password (no ambiguous chars) to hand to a student.
  const genPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  const openCredentials = (s: UserProfile) => {
    setCredStudent(s);
    setIssuedPw(null);
    setCredPw(genPassword());
  };

  const handleIssuePassword = async () => {
    if (!credStudent || credPw.length < 6) { toast.error(t('groups.detail.pwMin', 'Пароль — минимум 6 символов')); return; }
    setSavingCred(true);
    try {
      await orgResetStudentPassword(credStudent.uid, credPw);
      setIssuedPw(credPw);
      toast.success(t('groups.detail.pwSet', 'Новый пароль установлен'));
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setSavingCred(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!group) return <div className="text-center py-20"><Users className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" /><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/groups')} className="btn-secondary mt-3">{t('common.back')}</button></div>;

  const status: GroupStatus = group.status || 'active';
  const statusMeta = GROUP_STATUS_META[status];
  const StatusIcon = statusMeta.icon;

  const currentTeacherIds = group.teacherIds || [];
  const currentStudentIds = group.studentIds || [];
  const currentTeachers = allTeachers.filter(t => currentTeacherIds.includes(t.uid));
  const currentStudents = allStudents.filter(s => currentStudentIds.includes(s.uid));

  // Who may see logins / issue passwords here: admins/managers, or a teacher of THIS group.
  // (The backend enforces the same own-groups scope for teachers.)
  const myUid = profile?.uid;
  const isMyGroup = !!myUid && currentTeacherIds.includes(myUid);
  // A teacher who OWNS this group (and whose org enabled the policy) gets the full
  // editor — rename/move it, manage the roster, delete it — mirroring the backend.
  const isOwner = role === 'teacher' && teacherCanManage && !!myUid && group.createdBy === myUid;
  // Чужая группа: сервер не отдаёт ни учеников, ни занятий, и карточка выглядела
  // пустой («0 учеников, нет расписания»). Честнее сказать, что группа не своя.
  if (role === 'teacher' && !isMyGroup && !isOwner && !hasRosterManagement(role, can)) {
    return <AccessDenied
      title={t('groups.detail.notYourGroupTitle', 'Это не ваша группа')}
      description={t('groups.detail.notYourGroupDesc', 'Учеников, журнал и расписание группы видят её преподаватели. Чтобы вести группу, попросите администратора добавить вас.')}
    />;
  }
  const canManageGroup = canWrite('groups') && (isAdmin || isOwner);
  // Archiving / status changes: admins & owners always; a teacher who teaches the
  // group only when the org enabled the status policy. Mirrors the backend whitelist.
  const canChangeStatus = canWrite('groups') && (isAdmin || isOwner || (isMyGroup && teacherCanChangeStatus));
  // Ученику с личной почтой пароль меняет только тот, кто ведёт весь контингент:
  // иначе смена пароля = вход вместо человека (сервер: canManageAnyStudentLogin).
  const canResetAnyLogin = isAdmin && can('students', 'write');
  // Выдача логинов: весь контингент — по правам выше, преподаватель — только своей группе
  // (сервер: denyStudentAccessManagement).
  const canManageCreds = canResetAnyLogin || (role === 'teacher' && isMyGroup);
  const canResetLogin = (s: UserProfile) => canManageCreds && (canResetAnyLogin || isIssuedLoginEmail(s.email));
  // Syllabus progress is the one group field teachers may write — and only on
  // their own groups. The backend enforces the same own-groups scope, so keep the
  // toggle read-only for teachers viewing a group they don't teach.
  const canEditProgress = canWrite('groups') && (isAdmin || isMyGroup);
  // Расписание гейтится своими ресурсами, а не ролью: либо `schedule` на всю
  // организацию, либо узкое `group_schedule` — и тогда только в группе, где
  // пользователь сам преподаёт. Сервер проверяет ту же пару (canWriteEvent в
  // api-org.ts), поэтому кнопка появляется ровно там, где запрос пройдёт.
  const canEditSchedule = canEditGroupSchedule(can, 'write', isMyGroup);
  const canRemoveSchedule = canEditGroupSchedule(can, 'delete', isMyGroup);

  const availableTeachers = allTeachers.filter(t => !currentTeacherIds.includes(t.uid));
  const availableStudents = allStudents.filter(s => !currentStudentIds.includes(s.uid));

  return (
    <div className="pb-10">
      <button onClick={() => navigate('/groups')} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 mb-3 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}
      </button>

      {/* Premium Hero Section */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg mb-4">
        <div className="relative p-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  <Users className="w-3 h-3 inline-block mr-1" />
                  {t('groups.detail.badgeGroup', 'Группа')}
                </span>
                {courseName && (
                  <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded">
                    <BookOpen className="w-3 h-3 inline-block mr-1" />
                    {courseName}
                  </span>
                )}
                <span className={`inline-flex items-center h-5 px-1.5 text-xs font-medium rounded ${statusMeta.badge}`}>
                  <StatusIcon className="w-3 h-3 inline-block mr-1" />
                  {t(`groups.status.${status}`, statusMeta.label)}
                </span>
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {group.name}
                </h1>
                {canManageGroup && (
                  <button
                    onClick={() => {
                      setEditGroupForm({ name: group.name, courseId: group.courseId || '', branchId: (group as any).branchId || '' });
                      setShowEditGroupModal(true);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t('groups.detail.editGroup', 'Редактировать группу')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Status switcher — archive / activate / complete (admin-controlled for teachers) */}
                {canChangeStatus && (
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusMenu(v => !v)}
                      disabled={changingStatus}
                      className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
                      title={t('groups.detail.changeStatus', 'Изменить статус группы')}
                    >
                      {changingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StatusIcon className={`w-3.5 h-3.5 ${statusMeta.dot}`} />}
                      <span className="hidden sm:inline">{t(`groups.status.${status}`, statusMeta.label)}</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showStatusMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                        <div className="absolute left-0 top-full mt-1 z-20 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-pop p-1">
                          {GROUP_STATUS_ORDER.map(s => {
                            const m = GROUP_STATUS_META[s];
                            const Icon = m.icon;
                            const isCurrent = s === status;
                            return (
                              <button
                                key={s}
                                onClick={() => handleChangeStatus(s)}
                                disabled={changingStatus}
                                className={`w-full flex items-center gap-2 h-8 px-2 rounded-md text-sm text-left transition-colors disabled:opacity-50 ${isCurrent ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/40'}`}
                              >
                                <Icon className={`w-3.5 h-3.5 ${m.dot}`} />
                                <span className="flex-1">{t(`groups.status.${s}`, m.label)}</span>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {/* Chat Link Management */}
              {isEditingChat ? (
                 <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 max-w-md">
                    <div className="flex-1 space-y-2">
                       <input value={chatForm.title} onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))} placeholder={t('groups.detail.chatTitlePh', 'Название (Telegram, WhatsApp...)')} className="input" />
                       <input value={chatForm.url} onChange={e => setChatForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="input" />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                       <button onClick={handleSaveChat} disabled={savingChat} className="w-8 h-8 flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"><Check className="w-3.5 h-3.5" /></button>
                       <button onClick={() => setIsEditingChat(false)} className="w-8 h-8 flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                 </div>
              ) : (
                 <div className="flex items-center gap-2">
                    {group.chatLinkUrl ? (
                      <a href={group.chatLinkUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1.5">
                        <LinkIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {group.chatLinkTitle || t('groups.detail.groupChat', 'Чат группы')}
                      </a>
                    ) : canManageGroup && (
                      <div className="inline-flex items-center gap-2 h-8 px-3 text-slate-500 dark:text-slate-400 text-sm rounded-md border border-slate-300 dark:border-slate-700 border-dashed">
                        {t('groups.detail.noChatLink', 'Нет ссылки на чат')}
                      </div>
                    )}
                    {canManageGroup && (
                      <button onClick={() => setIsEditingChat(true)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                 </div>
              )}
            </div>

            {/* Stats Keycards Grid */}
            <div className="grid grid-cols-2 gap-2 shrink-0 md:w-72">
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg grid grid-cols-[1fr_auto] items-center gap-y-0.5">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400 col-start-2 row-start-1" />
                <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 col-span-2 row-start-2">{currentStudents.length}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 col-start-1 row-start-1">{t('groups.detail.statStudents', 'Учеников')}</span>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg grid grid-cols-[1fr_auto] items-center gap-y-0.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 col-start-2 row-start-1" />
                <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 col-span-2 row-start-2">{currentTeachers.length}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 col-start-1 row-start-1">{t('groups.detail.statTeachers', 'Преподавателей')}</span>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg col-span-2 flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <span className="block text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString(numericDateLocale()) : '—'}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t('common.created', 'Создан')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Curriculum Tracker / Syllabus Roadmap */}
      {/* Syllabus + schedule side by side on wide screens; schedule gets the wider column for its 7 day columns.
          Children keep their own mb-4 for the stacked layout — zeroed inside the grid, which owns the gap. */}
      <div className={(isAdmin || role === 'teacher') ? 'grid gap-4 mb-4 items-start xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:mb-0' : ''}>
      {(isAdmin || role === 'teacher') && (
        <div className="min-w-0 mb-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <BookOpen className="w-4 h-4 text-slate-400" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('groups.detail.syllabusTitle', 'Силлабус (Учебная программа)')}</h2>
                {syllabus?.isMandatory && (
                  <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40">{t('groups.detail.mandatory', 'Обязательная')}</span>
                )}
              </div>
              <p className="text-xs text-slate-500">{t('groups.detail.syllabusDesc', 'Прогресс освоения курса группой')}</p>
            </div>
          </div>
          
          {!syllabus ? (
             <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('groups.detail.noSyllabus', 'Силлабус для курса не настроен')}</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{t('groups.detail.noSyllabusDesc', 'Создайте программу курса, чтобы отслеживать прогресс группы по модулям и урокам.')}</p>
                {group?.courseId && (
                  <button onClick={() => navigate(`/courses/${group.courseId}`)} className="btn-secondary mt-3 inline-flex items-center gap-1.5">
                    {t('groups.detail.goToCourse', 'Перейти к курсу')} <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
             </div>
          ) : syllabusItems.length === 0 ? (
             <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('groups.detail.syllabusEmpty', 'В силлабусе пока нет уроков')}</p>
                <p className="text-xs text-slate-500 mt-1">{t('groups.detail.syllabusEmptyDesc', 'Добавьте модули и темы в программу курса.')}</p>
             </div>
          ) : (
             <div className="space-y-3">
                {/* Progress bar */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">{t('groups.detail.progressDone', 'Пройдено {{pct}}%', { pct: progressPct })}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{currentIdx >= 0 ? currentIdx + 1 : 0} / {syllabusItems.length}</span>
                   </div>
                   <div className="bg-slate-200 dark:bg-slate-700 h-1.5 w-full rounded-full overflow-hidden">
                      <div className="bg-primary-600 h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                   </div>
                </div>

                {/* Roadmap */}
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                   {syllabus.modules.map((mod, mi) => (
                     <div key={mod.id}>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('groups.detail.moduleN', 'Модуль {{n}}: {{title}}', { n: mi + 1, title: mod.title })}</p>
                        <div className="space-y-1">
                           {mod.items.map(item => {
                             const idx = syllabusItems.findIndex(i => i.id === item.id);
                             const done = currentIdx >= 0 && idx <= currentIdx;
                             const isCurrent = item.id === group?.currentSyllabusItemId;
                             const linkTo = item.type === 'exam' && item.examId ? `/exams/${item.examId}` : item.lessonPlanId ? `/lessons/${item.lessonPlanId}` : null;
                             return (
                               <div key={item.id} className={`flex items-center gap-2 px-2 h-8 rounded-md transition-colors ${isCurrent ? 'bg-primary-100 dark:bg-primary-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                  <button onClick={() => setCurrentItem(item.id)} disabled={savingProgress || !canEditProgress} title={!canEditProgress ? t('groups.detail.progressTeachersOnly', 'Прогресс отмечают преподаватели этой группы') : isCurrent ? t('groups.detail.unmarkCurrent', 'Снять отметку «текущий»') : t('groups.detail.markCurrent', 'Отметить как текущий урок')} className="shrink-0 disabled:opacity-50 disabled:cursor-default">
                                     {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />}
                                  </button>
                                  <span className={`flex-1 text-sm truncate ${done ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500'} ${isCurrent ? 'font-medium text-slate-900 dark:text-slate-100' : ''}`}>{item.title}</span>
                                  {isCurrent && <span className="inline-flex items-center h-5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-white dark:bg-slate-900 border border-primary-200 dark:border-primary-800 px-1.5 rounded shrink-0">{t('groups.detail.now', 'Сейчас')}</span>}
                                  {linkTo && (
                                    <button onClick={() => navigate(linkTo)} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200 dark:hover:text-slate-100 dark:hover:bg-slate-700 shrink-0" title={t('groups.detail.open', 'Открыть')}><ExternalLink className="w-3.5 h-3.5" /></button>
                                  )}
                               </div>
                             );
                           })}
                        </div>
                     </div>
                   ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('groups.detail.markHint', 'Отметьте текущий урок — прогресс пересчитается автоматически.')}</p>
             </div>
          )}
        </div>
      )}

      <GroupScheduleSection group={group} canEdit={canEditSchedule} canRemove={canRemoveSchedule} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
         {/* Main Column */}
         <div className="md:col-span-2 space-y-3">

            {/* Students List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
               <div className="px-3 h-10 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                     <GraduationCap className="w-4 h-4 text-slate-400" />
                     <h2 className="font-semibold text-sm">{t('groups.detail.studentsHeading', 'Ученики ({{count}})', { count: currentStudents.length })}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Раздать доступы перед экзаменом — работа преподавателя,
                        поэтому кнопка тут, а не только в админском разделе. */}
                    {canManageCreds && currentStudents.length > 0 && (
                      <button
                        onClick={() => setShowGroupAccess(true)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t('groups.detail.issueGroupAccess', 'Выдать логины и пароли группе')}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canManageGroup && (
                      <button onClick={() => setShowAddStudent(true)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('groups.detail.addStudent', 'Добавить ученика')}>
                         <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
               </div>
               <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {currentStudents.length === 0 ? (
                    <div className="p-5 text-center">
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.detail.noStudents', 'Нет учеников')}</p>
                    </div>
                  ) : (
                    currentStudents.map(s => (
                      <div key={s.uid} className="flex items-center justify-between px-3 py-1.5 min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                         {/* `from` — чтобы «Назад» на карточке вернул в эту группу,
                             а не в общий ростер организации (преподавателю он закрыт). */}
                         <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/students/${s.uid}`, { state: { from: `/groups/${id}` } })}>
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex items-center justify-center font-semibold text-xs">
                                 {s.displayName?.[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                               <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.displayName}</p>
                               {!isIssuedLoginEmail(s.email) && <p className="text-xs text-slate-500">{s.email}</p>}
                            </div>
                         </div>
                         <div className="flex items-center gap-1">
                           {canResetLogin(s) && (
                             <button onClick={(e) => { e.stopPropagation(); openCredentials(s); }} title={t('groups.detail.loginPassword', 'Логин и пароль')} className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors">
                               <KeyRound className="w-3.5 h-3.5" />
                             </button>
                           )}
                           {canManageGroup && (
                             <button onClick={(e) => { e.stopPropagation(); handleRemoveStudent(s.uid); }} className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                               <X className="w-3.5 h-3.5" />
                             </button>
                           )}
                         </div>
                      </div>
                    ))
                  )}
               </div>
             </div>

         </div>

         {/* Sidebar — Teachers */}
         <div className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
               <div className="px-3 h-10 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                     <Briefcase className="w-4 h-4 text-slate-400" />
                     <h2 className="font-semibold text-sm">{t('groups.detail.teachersHeading', 'Преподаватели ({{count}})', { count: currentTeachers.length })}</h2>
                  </div>
                  {canManageGroup && (
                    <button onClick={() => setShowAddTeacher(true)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('groups.detail.assignTeacher', 'Назначить преподавателя')}>
                       <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
               </div>
               <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {currentTeachers.length === 0 ? (
                    <div className="p-5 text-center">
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('groups.detail.noTeachers', 'Нет преподавателей')}</p>
                    </div>
                  ) : (
                    currentTeachers.map(teacher => (
                      <div key={teacher.uid} className="flex items-center gap-3 px-3 py-1.5 min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                         {teacher.avatarUrl ? (
                           <img src={teacher.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                         ) : (
                           <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex items-center justify-center font-semibold text-xs">
                              {teacher.displayName?.[0]?.toUpperCase() || '?'}
                           </div>
                         )}
                         <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{teacher.displayName}</p>
                            {!isIssuedLoginEmail(teacher.email) && <p className="text-xs text-slate-500">{teacher.email}</p>}
                         </div>
                         {canManageGroup && (
                           <button onClick={() => handleRemoveTeacher(teacher.uid)} title={t('groups.detail.removeTeacher', 'Снять с группы')} aria-label={t('groups.detail.removeTeacher', 'Снять с группы')} className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                             <X className="w-3.5 h-3.5" />
                           </button>
                         )}
                      </div>
                    ))
                  )}
               </div>
            </div>
         </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddTeacher && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAddTeacher(false)}>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('groups.detail.assignTeacher', 'Назначить преподавателя')}</h2>
             <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('groups.detail.assignTeacherDesc', 'Преподаватель получит доступ к группе и журналу.')}</p>
             
             {availableTeachers.length === 0 ? (
               <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 p-3 rounded-lg text-xs font-medium mb-4">
                 {t('groups.detail.noAvailableTeachers', 'Нет доступных преподавателей.')}
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="input mb-4"
               >
                 <option value="">{t('groups.detail.selectPh', '-- Выберите --')}</option>
                 {availableTeachers.map(t => (
                   <option key={t.uid} value={t.uid}>{t.displayName}</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddTeacher(false)} className="btn-ghost">
                 {t('common.cancel', 'Отмена')}
               </button>
               <button 
                 onClick={handleAddTeacher} 
                 disabled={!selectedUserId || addingUser}
                 className="btn-primary disabled:opacity-50"
               >
                 {addingUser ? '...' : t('groups.detail.assign', 'Назначить')}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Выдача логинов и паролей всей группе — раздать перед экзаменом */}
      {showGroupAccess && group && (
        <GroupAccessModal
          groupId={group.id}
          groupName={group.name}
          onClose={() => setShowGroupAccess(false)}
        />
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAddStudent(false)}>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('groups.detail.addStudent', 'Добавить ученика')}</h2>
             <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('groups.detail.addStudentDesc', 'Ученик получит доступ к этой группе.')}</p>
             
             {availableStudents.length === 0 ? (
               <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 p-3 rounded-lg text-xs font-medium mb-4">
                 {t('groups.detail.allInGroup', 'Все ученики уже в группе.')}
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="input mb-4"
               >
                 <option value="">{t('groups.detail.selectPh', '-- Выберите --')}</option>
                 {availableStudents.map(s => (
                   <option key={s.uid} value={s.uid}>{s.displayName}{s.email && !isIssuedLoginEmail(s.email) ? ` (${s.email})` : ''}</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddStudent(false)} className="btn-ghost">
                 {t('common.cancel', 'Отмена')}
               </button>
               <button 
                 onClick={handleAddStudent} 
                 disabled={!selectedUserId || addingUser}
                 className="btn-primary disabled:opacity-50"
               >
                 {addingUser ? '...' : t('common.add', 'Добавить')}
               </button>
             </div>
          </div>
        </div>
      )}
      {/* Edit Group Info Modal */}
      {showEditGroupModal && canManageGroup && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowEditGroupModal(false)}>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('groups.detail.editGroup', 'Редактировать группу')}</h2>
             
             <div className="space-y-3 mb-4">
               <div>
                 <label className="label">{t('groups.detail.groupName', 'Название группы')}</label>
                 <input 
                   value={editGroupForm.name} 
                   onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))}
                   placeholder={t('groups.detail.groupName', 'Название группы')} 
                   className="input" 
                 />
               </div>
               <div>
                 <label className="label">{t('groups.detail.course', 'Курс')}</label>
                 <select 
                   value={editGroupForm.courseId} 
                   onChange={e => setEditGroupForm(f => ({ ...f, courseId: e.target.value }))}
                   className="input"
                 >
                   <option value="">{t('groups.detail.noCourseOpt', '-- Без курса --')}</option>
                   {courses.map(c => (
                     <option key={c.id} value={c.id}>{c.title}</option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="label flex items-center gap-1">
                   <Building2 className="w-3.5 h-3.5" /> {t('common.branch', 'Филиал')}
                 </label>
                 <BranchFilter
                   value={editGroupForm.branchId || null}
                   onChange={(id) => setEditGroupForm(f => ({ ...f, branchId: id || '' }))}
                   hideAll={false}
                   mode="select"
                 />
               </div>
             </div>

             <div className="flex justify-end gap-2">
               <button 
                 onClick={() => setShowEditGroupModal(false)} 
                 className="btn-ghost"
               >
                 {t('common.cancel')}
               </button>
               <button 
                 onClick={handleSaveGroupInfo} 
                 disabled={!editGroupForm.name.trim() || savingGroup}
                 className="btn-primary disabled:opacity-50"
               >
                 {savingGroup ? t('common.saving', 'Сохранение...') : t('common.save')}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Student Credentials Modal — view login & issue a new password */}
      {credStudent && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setCredStudent(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-pop border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('groups.detail.studentAccess', 'Доступ ученика')}</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{credStudent.displayName}</p>

            {!credStudent.email ? (
              <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 p-3 rounded-lg text-xs font-medium leading-relaxed">
                {t('groups.detail.noLogin', 'У этого ученика нет входа в систему — это запись для журнала. Логин может создать администратор при добавлении ученика.')}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Login */}
                <div>
                  <label className="label">{t('groups.detail.login', 'Логин')}</label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md pl-2.5 pr-1 py-1">
                    <span className="flex-1 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">{(credStudent as any).username || credStudent.email}</span>
                    <button onClick={() => { navigator.clipboard.writeText((credStudent as any).username || credStudent.email || ''); toast.success(t('support.copied', 'Скопировано')); }} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {issuedPw ? (
                  /* New password — shown once */
                  <div>
                    <label className="label">{t('groups.detail.newPassword', 'Новый пароль')}</label>
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-md pl-2.5 pr-1 py-1">
                      <span className="flex-1 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300 truncate">{issuedPw}</span>
                      <button onClick={() => { navigator.clipboard.writeText(issuedPw); toast.success(t('support.copied', 'Скопировано')); }} className="w-7 h-7 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-md transition-colors shrink-0"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(t('groups.detail.credsClipboard', 'Логин: {{login}}\nПароль: {{password}}', { login: (credStudent as any).username || credStudent.email, password: issuedPw, interpolation: { escapeValue: false } })); toast.success(t('support.copied', 'Скопировано')); }}
                      className="btn-secondary w-full mt-2 flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> {t('groups.detail.copyCreds', 'Скопировать логин и пароль')}
                    </button>
                    <p className="text-xs text-slate-500 leading-relaxed mt-3">
                      {t('groups.detail.credsHint', 'Передайте эти данные ученику. Пароль показывается один раз — скопируйте его сейчас.')}
                    </p>
                    <div className="flex justify-end mt-4">
                      <button onClick={() => setCredStudent(null)} className="btn-primary">{t('groups.detail.done', 'Готово')}</button>
                    </div>
                  </div>
                ) : (
                  /* Issue a new password */
                  <div>
                    <label className="label">{t('groups.detail.newPassword', 'Новый пароль')}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text" value={credPw} onChange={e => setCredPw(e.target.value)}
                        placeholder={t('groups.detail.pwPh', 'мин. 6 символов')}
                        className="input flex-1 font-mono"
                      />
                      <button onClick={() => setCredPw(genPassword())} title={t('groups.detail.regenerate', 'Сгенерировать другой')} className="w-8 h-8 flex items-center justify-center border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors shrink-0"><RefreshCw className="w-3.5 h-3.5" /></button>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-3">
                      {t('groups.detail.oldPwHint', 'Старый пароль показать нельзя — он хранится в зашифрованном виде. Задайте новый и передайте его ученику.')}
                    </p>
                    <div className="flex justify-end gap-2 mt-4">
                      <button onClick={() => setCredStudent(null)} className="btn-ghost">{t('common.cancel', 'Отмена')}</button>
                      <button onClick={handleIssuePassword} disabled={savingCred}
                        className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
                        {savingCred ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                        {t('groups.detail.setPassword', 'Установить пароль')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetailPage;
