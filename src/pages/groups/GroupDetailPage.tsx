import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroup, orgGetCourses, orgUpdateGroup, orgGetTeachers, orgGetStudents, apiGetSyllabuses, orgResetStudentPassword, orgGetSettings } from '../../lib/api';
import { ArrowLeft, Users, BookOpen, Calendar, Link as LinkIcon, Edit2, Check, X, Plus, Briefcase, GraduationCap, Building2, CheckCircle2, Circle, ExternalLink, KeyRound, Copy, Loader2, RefreshCw, Archive, ChevronDown, PlayCircle } from 'lucide-react';
import type { Group, GroupStatus, Course, UserProfile, Syllabus } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import BranchFilter from '../../components/ui/BranchFilter';

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
  const isAdmin = role === 'admin' || role === 'manager' || role === 'super_admin';

  const [group, setGroup] = useState<Group | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<UserProfile[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
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
      toast.error(e.message || 'Не удалось обновить прогресс');
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
      toast.error(e.message || 'Error saving chat link');
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
      toast.error(e.message || 'Error saving group');
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
      toast.success(`Статус: ${GROUP_STATUS_META[next].label}`);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось изменить статус');
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
        toast.success('Преподаватель назначен!');
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
        toast.success('Ученик добавлен!');
      }
      setShowAddStudent(false);
      setSelectedUserId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    if (!window.confirm('Открепить ученика?')) return;
    try {
      const currentIds = group.studentIds || [];
      const newIds = currentIds.filter(id => id !== studentId);
      await orgUpdateGroup({ id: group.id, studentIds: newIds });
      setGroup({ ...group, studentIds: newIds });
      toast.success('Ученик откреплен');
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
    if (!credStudent || credPw.length < 6) { toast.error('Пароль — минимум 6 символов'); return; }
    setSavingCred(true);
    try {
      await orgResetStudentPassword(credStudent.uid, credPw);
      setIssuedPw(credPw);
      toast.success('Новый пароль установлен');
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSavingCred(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin dark:border-slate-700" /></div>;
  if (!group) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm font-bold text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/groups')} className="mt-3 font-bold text-emerald-500 text-sm hover:underline">{t('common.back')}</button></div>;

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
  const canManageGroup = isAdmin || isOwner;
  // Archiving / status changes: admins & owners always; a teacher who teaches the
  // group only when the org enabled the status policy. Mirrors the backend whitelist.
  const canChangeStatus = isAdmin || isOwner || (isMyGroup && teacherCanChangeStatus);
  const canManageCreds = isAdmin || isMyGroup;
  // Syllabus progress is the one group field teachers may write — and only on
  // their own groups. The backend enforces the same own-groups scope, so keep the
  // toggle read-only for teachers viewing a group they don't teach.
  const canEditProgress = isAdmin || isMyGroup;

  const availableTeachers = allTeachers.filter(t => !currentTeacherIds.includes(t.uid));
  const availableStudents = allStudents.filter(s => !currentStudentIds.includes(s.uid));

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => navigate('/groups')} className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-500 mb-4 transition-all hover:gap-2.5">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Premium Hero Section */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm mb-8">
        {/* Background Decorative Graphic */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-violet-500/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50 pointer-events-none" />
        
        <div className="relative p-8 md:p-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800">
                  <Users className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
                  Группа
                </span>
                {courseName && (
                  <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                    <BookOpen className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
                    {courseName}
                  </span>
                )}
                <span className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border ${statusMeta.badge}`}>
                  <StatusIcon className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
                  {statusMeta.label}
                </span>
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {group.name}
                </h1>
                {canManageGroup && (
                  <button
                    onClick={() => {
                      setEditGroupForm({ name: group.name, courseId: group.courseId || '', branchId: (group as any).branchId || '' });
                      setShowEditGroupModal(true);
                    }}
                    className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 rounded-xl transition-all shadow-sm hover:shadow"
                    title="Редактировать группу"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
                {/* Status switcher — archive / activate / complete (admin-controlled for teachers) */}
                {canChangeStatus && (
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusMenu(v => !v)}
                      disabled={changingStatus}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50"
                      title="Изменить статус группы"
                    >
                      {changingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <StatusIcon className={`w-4 h-4 ${statusMeta.dot}`} />}
                      <span className="hidden sm:inline">{statusMeta.label}</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showStatusMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                        <div className="absolute left-0 top-full mt-2 z-20 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5">
                          {GROUP_STATUS_ORDER.map(s => {
                            const m = GROUP_STATUS_META[s];
                            const Icon = m.icon;
                            const isCurrent = s === status;
                            return (
                              <button
                                key={s}
                                onClick={() => handleChangeStatus(s)}
                                disabled={changingStatus}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-left transition-colors disabled:opacity-50 ${isCurrent ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                              >
                                <Icon className={`w-4 h-4 ${m.dot}`} />
                                <span className="flex-1">{m.label}</span>
                                {isCurrent && <Check className="w-4 h-4 text-emerald-500" />}
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
                 <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 max-w-md">
                    <div className="flex-1 space-y-2">
                       <input value={chatForm.title} onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))} placeholder="Название (Telegram, WhatsApp...)" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:border-violet-500" />
                       <input value={chatForm.url} onChange={e => setChatForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:border-violet-500" />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                       <button onClick={handleSaveChat} disabled={savingChat} className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                       <button onClick={() => setIsEditingChat(false)} className="p-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                 </div>
              ) : (
                 <div className="flex items-center gap-3">
                    {group.chatLinkUrl ? (
                      <a href={group.chatLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-sm rounded-xl border border-blue-100 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                        <LinkIcon className="w-4 h-4" /> {group.chatLinkTitle || 'Чат группы'}
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 text-slate-400 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700 border-dashed">
                        Нет ссылки на чат
                      </div>
                    )}
                    {canManageGroup && (
                      <button onClick={() => setIsEditingChat(true)} className="p-2 text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-xl transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                 </div>
              )}
            </div>

            {/* Stats Keycards Grid */}
            <div className="grid grid-cols-2 gap-3 shrink-0 md:w-80">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <GraduationCap className="w-6 h-6 text-emerald-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{currentStudents.length}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Учеников</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <Briefcase className="w-6 h-6 text-blue-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{currentTeachers.length}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Учителей</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl col-span-2 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString() : '—'}
                    </span>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.created', 'Создан')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Curriculum Tracker / Syllabus Roadmap */}
      {(isAdmin || role === 'teacher') && (
        <div className="mb-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Силлабус (Учебная программа)</h2>
                {syllabus?.isMandatory && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">Обязательная</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Прогресс освоения курса группой</p>
            </div>
          </div>
          
          {!syllabus ? (
             <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Силлабус для курса не настроен</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">Создайте программу курса, чтобы отслеживать прогресс группы по модулям и урокам.</p>
                {group?.courseId && (
                  <button onClick={() => navigate(`/courses/${group.courseId}`)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Перейти к курсу <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
             </div>
          ) : syllabusItems.length === 0 ? (
             <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">В силлабусе пока нет уроков</p>
                <p className="text-xs text-slate-500 mt-1">Добавьте модули и темы в программу курса.</p>
             </div>
          ) : (
             <div className="space-y-4">
                {/* Progress bar */}
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                   <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Пройдено {progressPct}%</span>
                      <span className="text-xs text-slate-500">{currentIdx >= 0 ? currentIdx + 1 : 0} / {syllabusItems.length}</span>
                   </div>
                   <div className="bg-slate-200 dark:bg-slate-700 h-2 w-full rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                   </div>
                </div>

                {/* Roadmap */}
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                   {syllabus.modules.map((mod, mi) => (
                     <div key={mod.id}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Модуль {mi + 1}: {mod.title}</p>
                        <div className="space-y-1">
                           {mod.items.map(item => {
                             const idx = syllabusItems.findIndex(i => i.id === item.id);
                             const done = currentIdx >= 0 && idx <= currentIdx;
                             const isCurrent = item.id === group?.currentSyllabusItemId;
                             const linkTo = item.type === 'exam' && item.examId ? `/exams/${item.examId}` : item.lessonPlanId ? `/lessons/${item.lessonPlanId}` : null;
                             return (
                               <div key={item.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${isCurrent ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-700/40'}`}>
                                  <button onClick={() => setCurrentItem(item.id)} disabled={savingProgress || !canEditProgress} title={!canEditProgress ? 'Прогресс отмечают преподаватели этой группы' : isCurrent ? 'Снять отметку «текущий»' : 'Отметить как текущий урок'} className="shrink-0 disabled:opacity-50 disabled:cursor-default">
                                     {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                                  </button>
                                  <span className={`flex-1 text-sm truncate ${done ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500'} ${isCurrent ? 'font-semibold' : ''}`}>{item.title}</span>
                                  {isCurrent && <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded shrink-0">Сейчас</span>}
                                  {linkTo && (
                                    <button onClick={() => navigate(linkTo)} className="p-1 text-slate-400 hover:text-indigo-500 shrink-0" title="Открыть"><ExternalLink className="w-3.5 h-3.5" /></button>
                                  )}
                               </div>
                             );
                           })}
                        </div>
                     </div>
                   ))}
                </div>
                <p className="text-[11px] text-slate-400">Отметьте текущий урок — прогресс пересчитается автоматически.</p>
             </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Main Column */}
         <div className="md:col-span-2 space-y-6">

            {/* Students List */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
               <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                     <GraduationCap className="w-5 h-5 text-emerald-500" />
                     <h2 className="font-extrabold uppercase tracking-wider text-sm">Ученики ({currentStudents.length})</h2>
                  </div>
                  {canManageGroup && (
                    <button onClick={() => setShowAddStudent(true)} className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-colors" title="Добавить ученика">
                       <Plus className="w-5 h-5" />
                    </button>
                  )}
               </div>
               <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {currentStudents.length === 0 ? (
                    <div className="p-8 text-center">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Нет учеников</p>
                    </div>
                  ) : (
                    currentStudents.map(s => (
                      <div key={s.uid} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                         <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/students/${s.uid}`)}>
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
                                 {s.displayName?.[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                               <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">{s.displayName}</p>
                               <p className="text-xs text-slate-500">{s.email}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-1">
                           {canManageCreds && (
                             <button onClick={(e) => { e.stopPropagation(); openCredentials(s); }} title="Логин и пароль" className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all">
                               <KeyRound className="w-4 h-4" />
                             </button>
                           )}
                           {canManageGroup && (
                             <button onClick={(e) => { e.stopPropagation(); handleRemoveStudent(s.uid); }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all">
                               <X className="w-4 h-4" />
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
         <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
               <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                     <Briefcase className="w-5 h-5 text-blue-500" />
                     <h2 className="font-extrabold uppercase tracking-wider text-sm">Преподаватели ({currentTeachers.length})</h2>
                  </div>
                  {canManageGroup && (
                    <button onClick={() => setShowAddTeacher(true)} className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors" title="Назначить преподавателя">
                       <Plus className="w-5 h-5" />
                    </button>
                  )}
               </div>
               <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {currentTeachers.length === 0 ? (
                    <div className="p-8 text-center">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Нет преподавателей</p>
                    </div>
                  ) : (
                    currentTeachers.map(teacher => (
                      <div key={teacher.uid} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                         {teacher.avatarUrl ? (
                           <img src={teacher.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                         ) : (
                           <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                              {teacher.displayName?.[0]?.toUpperCase() || '?'}
                           </div>
                         )}
                         <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{teacher.displayName}</p>
                            <p className="text-xs text-slate-500">{teacher.email}</p>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
         </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddTeacher && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowAddTeacher(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Назначить преподавателя</h2>
             <p className="text-xs font-medium text-slate-500 mb-5">Преподаватель получит доступ к группе и журналу.</p>
             
             {availableTeachers.length === 0 ? (
               <div className="bg-amber-50 text-amber-600 p-3 rounded-xl text-xs font-medium mb-4">
                 Нет доступных преподавателей. 
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500 mb-5"
               >
                 <option value="">-- Выберите --</option>
                 {availableTeachers.map(t => (
                   <option key={t.uid} value={t.uid}>{t.displayName}</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddTeacher(false)} className="px-4 py-2 font-bold text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAddTeacher} 
                 disabled={!selectedUserId || addingUser}
                 className="bg-violet-500 hover:bg-violet-600 text-white px-5 py-2 rounded-xl font-bold text-xs disabled:opacity-50 transition-colors shadow-md shadow-violet-500/20"
               >
                 {addingUser ? '...' : 'Назначить'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowAddStudent(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Добавить ученика</h2>
             <p className="text-xs font-medium text-slate-500 mb-5">Ученик получит доступ к этой группе.</p>
             
             {availableStudents.length === 0 ? (
               <div className="bg-amber-50 text-amber-600 p-3 rounded-xl text-xs font-medium mb-4">
                 Все ученики уже в группе.
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 mb-5"
               >
                 <option value="">-- Выберите --</option>
                 {availableStudents.map(s => (
                   <option key={s.uid} value={s.uid}>{s.displayName} ({s.email})</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddStudent(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAddStudent} 
                 disabled={!selectedUserId || addingUser}
                 className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-md shadow-emerald-500/20"
               >
                 {addingUser ? '...' : 'Добавить'}
               </button>
             </div>
          </div>
        </div>
      )}
      {/* Edit Group Info Modal */}
      {showEditGroupModal && canManageGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowEditGroupModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Редактировать группу</h2>
             
             <div className="space-y-4 mb-6">
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Название группы</label>
                 <input 
                   value={editGroupForm.name} 
                   onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))}
                   placeholder="Название группы" 
                   className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500" 
                 />
               </div>
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Курс</label>
                 <select 
                   value={editGroupForm.courseId} 
                   onChange={e => setEditGroupForm(f => ({ ...f, courseId: e.target.value }))}
                   className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500"
                 >
                   <option value="">-- Без курса --</option>
                   {courses.map(c => (
                     <option key={c.id} value={c.id}>{c.title}</option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1">
                   <Building2 className="w-3.5 h-3.5" /> Филиал
                 </label>
                 <BranchFilter
                   value={editGroupForm.branchId || null}
                   onChange={(id) => setEditGroupForm(f => ({ ...f, branchId: id || '' }))}
                   hideAll={false}
                   mode="select"
                 />
               </div>
             </div>

             <div className="flex justify-end gap-3">
               <button 
                 onClick={() => setShowEditGroupModal(false)} 
                 className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
               >
                 {t('common.cancel')}
               </button>
               <button 
                 onClick={handleSaveGroupInfo} 
                 disabled={!editGroupForm.name.trim() || savingGroup}
                 className="bg-violet-500 hover:bg-violet-600 text-white px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-md shadow-violet-500/20"
               >
                 {savingGroup ? 'Сохранение...' : t('common.save')}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Student Credentials Modal — view login & issue a new password */}
      {credStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCredStudent(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Доступ ученика</h2>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-5">{credStudent.displayName}</p>

            {!credStudent.email ? (
              <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 rounded-xl text-xs font-medium leading-relaxed">
                У этого ученика нет входа в систему — это запись для журнала. Логин может создать администратор при добавлении ученика.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Login */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Логин</label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5 mt-1">
                    <span className="flex-1 text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{(credStudent as any).username || credStudent.email}</span>
                    <button onClick={() => { navigator.clipboard.writeText((credStudent as any).username || credStudent.email || ''); toast.success('Скопировано'); }} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-600 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                  </div>
                </div>

                {issuedPw ? (
                  /* New password — shown once */
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Новый пароль</label>
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-3 py-2.5 mt-1">
                      <span className="flex-1 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300 truncate">{issuedPw}</span>
                      <button onClick={() => { navigator.clipboard.writeText(issuedPw); toast.success('Скопировано'); }} className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`Логин: ${(credStudent as any).username || credStudent.email}\nПароль: ${issuedPw}`); toast.success('Скопировано'); }}
                      className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Скопировать логин и пароль
                    </button>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-3">
                      Передайте эти данные ученику. Пароль показывается один раз — скопируйте его сейчас.
                    </p>
                    <div className="flex justify-end mt-4">
                      <button onClick={() => setCredStudent(null)} className="px-5 py-2 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors shadow-md shadow-blue-500/20">Готово</button>
                    </div>
                  </div>
                ) : (
                  /* Issue a new password */
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Новый пароль</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text" value={credPw} onChange={e => setCredPw(e.target.value)}
                        placeholder="мин. 6 символов"
                        className="flex-1 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-900 dark:text-white outline-none focus:border-blue-500"
                      />
                      <button onClick={() => setCredPw(genPassword())} title="Сгенерировать другой" className="p-2.5 text-slate-400 hover:text-blue-500 bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors shrink-0"><RefreshCw className="w-4 h-4" /></button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-3">
                      Старый пароль показать нельзя — он хранится в зашифрованном виде. Задайте новый и передайте его ученику.
                    </p>
                    <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setCredStudent(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">Отмена</button>
                      <button onClick={handleIssuePassword} disabled={savingCred || credPw.length < 6}
                        className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-md shadow-blue-500/20">
                        {savingCred ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                        Установить пароль
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
