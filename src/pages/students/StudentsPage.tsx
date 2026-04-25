import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { 
  orgGetStudents, 
  orgGetGroups,
  orgGetCourses,
  orgCreateStudent,
  apiGetOrgMembers,
  apiAcceptMembership,
  apiRejectMembership,
  apiDeleteMember,
  orgGetCourseRequests,
  orgApproveCourseRequest,
  orgRejectCourseRequest
} from '../../lib/api';
import { Users, Search, Mail, RefreshCw, CheckCircle, XCircle, UserPlus, Phone, Filter, X, SortAsc, SortDesc, Trash2, Plus, Lightbulb, Link as LinkIcon, Copy, BookOpen, UsersRound } from 'lucide-react';
import type { UserProfile, Group } from '../../types';
import toast from 'react-hot-toast';
import { PinnedBadgesDisplay } from '../../lib/badges';
import BranchFilter from '../../components/ui/BranchFilter';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

type SortField = 'name' | 'email' | 'date';
type SortDir = 'asc' | 'desc';

const StudentsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, organizationId } = useAuth();
  const { limits } = usePlanGate();

  const [activeTab, setActiveTab] = useState<'students' | 'applications' | 'courseRequests'>('students');
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);

  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const [courseRequests, setCourseRequests] = useState<any[]>([]);
  const [loadingCourseReqs, setLoadingCourseReqs] = useState(false);
  const [showCourseReqModal, setShowCourseReqModal] = useState(false);
  const [selectedCourseReq, setSelectedCourseReq] = useState<any>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expelled'>('active');

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState('');

  // Create student modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ displayName: '', phone: '', courseId: '', groupId: '' });
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);

  // Branch filter for the list
  const [branchFilter, setBranchFilter] = useState<string | null>(null);

  // Onboarding hint
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem('students_invite_hint_dismissed') === '1');
  const [hintCopied, setHintCopied] = useState(false);

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem('students_invite_hint_dismissed', '1');
  };

  // Public invite URL
  const orgSlug = organizationId || '';
  const publicInviteUrl = orgSlug ? `${window.location.origin}/org/${orgSlug}` : '';

  const copyInviteLink = () => {
    if (!publicInviteUrl) return;
    navigator.clipboard.writeText(publicInviteUrl);
    setHintCopied(true);
    toast.success(t('common.copied', 'Ссылка скопирована!'));
    setTimeout(() => setHintCopied(false), 2000);
  };

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const loadStudents = (silent = false) => { 
    if (!silent) { setLoading(true); setError(''); }
    orgGetStudents(branchFilter || undefined)
      .then(setStudents)
      .catch((e) => { if (!silent) setError(e.message || 'Error'); })
      .finally(() => { if (!silent) setLoading(false); }); 
  };

  const loadGroups = async () => {
    try {
      const data = await orgGetGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  };

  const loadCourses = async () => {
    try {
      const data = await orgGetCourses();
      setCourses(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  };

  const loadApplications = async (silent = false) => {
    if (!organizationId) return;
    if (!silent) setLoadingApps(true);
    try {
      const apps = await apiGetOrgMembers(organizationId, 'pending', 'student');
      setApplications(apps);
    } catch (e: any) {
      if (!silent) toast.error(e.message || t('common.loadError', 'Ошибка загрузки'));
    } finally {
      if (!silent) setLoadingApps(false);
    }
  };

  const loadCourseRequests = async (silent = false) => {
    if (!silent) setLoadingCourseReqs(true);
    try {
      const reqs = await orgGetCourseRequests();
      setCourseRequests(reqs || []);
    } catch (e: any) {
      // silent or error
    } finally {
      if (!silent) setLoadingCourseReqs(false);
    }
  };

  useEffect(() => {
    loadStudents();
    loadGroups();
    loadCourses();
    loadApplications();
    loadCourseRequests();
  }, [organizationId, branchFilter]);

  // Reset page when filters change
  useEffect(() => setPage(1), [search, selectedGroup, statusFilter, sortField, sortDir]);

  // Filtered & sorted students
  const filteredStudents = useMemo(() => {
    let result = [...students];

    // Search by name, email, phone
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(s =>
        s.displayName?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      );
    }

    // Filter by group
    if (selectedGroup !== 'all') {
      const group = groups.find(g => g.id === selectedGroup);
      if (group) {
        const studentIdsInGroup = new Set(group.studentIds || []);
        result = result.filter(s => studentIdsInGroup.has(s.uid));
      }
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(s => ((s as any).status || 'active') === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.displayName || '').localeCompare(b.displayName || '', 'ru');
      } else if (sortField === 'email') {
        cmp = (a.email || '').localeCompare(b.email || '');
      } else if (sortField === 'date') {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [students, search, selectedGroup, groups, sortField, sortDir, statusFilter]);

  const handleApprove = async (userId: string) => {
    if (!organizationId) return;

    if (limits.maxStudents !== -1 && students.length >= limits.maxStudents) {
      toast.error(t('org.settings.maxStudentsReached', 'Достигнут лимит студентов для вашего тарифа'));
      return;
    }

    try {
      await apiAcceptMembership(userId, organizationId);
      // Optimistic: remove from local applications list immediately
      setApplications(prev => prev.filter(a => a.userId !== userId));
      toast.success(t('directory.applicationApproved', 'Заявка одобрена!'));
      // Silent background refresh
      loadStudents(true);
    } catch (e: any) {
      toast.error(e.message);
      loadApplications(true); // Restore real state on error
    }
  };

  const handleReject = async (userId: string) => {
    if (!organizationId) return;
    try {
      await apiRejectMembership(userId, organizationId);
      // Optimistic: remove from local list immediately
      setApplications(prev => prev.filter(a => a.userId !== userId));
      toast.success(t('directory.applicationRejected', 'Заявка отклонена'));
    } catch (e: any) {
      toast.error(e.message);
      loadApplications(true); // Restore real state on error
    }
  };

  const handleApproveCourseReq = async (groupId: string) => {
    if (!selectedCourseReq || !groupId) return;
    const reqId = selectedCourseReq.id;
    try {
      await orgApproveCourseRequest(reqId, groupId);
      // Optimistic: remove from local list
      setCourseRequests(prev => prev.filter(r => r.id !== reqId));
      toast.success('Заявка на курс одобрена, студент добавлен в группу');
      setShowCourseReqModal(false);
      setSelectedCourseReq(null);
      loadGroups(); // Refresh group counts silently
    } catch (e: any) {
      toast.error(e.message || 'Error');
      loadCourseRequests(true); // Restore real state on error
    }
  };

  const handleRejectCourseReq = async (reqId: string) => {
    try {
      await orgRejectCourseRequest(reqId);
      // Optimistic: remove from local list
      setCourseRequests(prev => prev.filter(r => r.id !== reqId));
      toast.success('Заявка на курс отклонена');
    } catch (e: any) {
      toast.error(e.message || 'Error');
      loadCourseRequests(true); // Restore real state on error
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };



  const handleCreateStudent = async () => {
    if (!createForm.displayName) return;
    setCreating(true);
    try {
      await orgCreateStudent(createForm);
      toast.success(t('org.students.created', 'Студент добавлен!'));
      setShowCreateModal(false);
      setCreateForm({ displayName: '', phone: '', courseId: '', groupId: '' });
      loadStudents();
      loadGroups();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  // Groups filtered by selected course in the create form
  const filteredGroupsForCreate = useMemo(() => {
    if (!createForm.courseId) return [];
    return groups.filter(g => g.courseId === createForm.courseId);
  }, [groups, createForm.courseId]);

  // Pagination computation
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedStudents = filteredStudents.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleDeleteExpelled = async (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    if (!organizationId) return;
    if (!window.confirm(t('org.students.confirmDeleteExpelled', 'Вы уверены что хотите полностью удалить этого студента из организации? Это действие необратимо.'))) return;
    
    setDeletingId(uid);
    try {
      await apiDeleteMember(uid, organizationId);
      toast.success(t('org.students.deleted', 'Студент полностью удален'));
      setStudents(prev => prev.filter(s => s.uid !== uid));
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setDeletingId(null);
    }
  };

  // Get group name for a student
  const getStudentGroups = (uid: string): string[] => {
    return groups
      .filter(g => (g.studentIds || []).includes(uid))
      .map(g => g.name);
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('nav.students')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {activeTab === 'students' ? `${students.length} ${t('org.students.total')}` : activeTab === 'applications' ? `${applications.length} ${t('org.students.applicationsCount', 'заявок')}` : `${courseRequests.length} заявок на курсы`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => { loadStudents(); loadGroups(); loadApplications(); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreateModal(true)} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
            <Plus className="w-4 h-4" />
            {t('org.students.create', 'Добавить студента')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('students')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'students' ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          {t('org.students.activeTabs', 'Активные студенты')}
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'applications' ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          {t('org.students.applicationsTab', 'Заявки')}
          {applications.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {applications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('courseRequests')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'courseRequests' ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          Заявки на курсы
          {courseRequests.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {courseRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Onboarding Hint for Managers */}
      {!hintDismissed && (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'super_admin') && (
        <div className="mb-6 relative overflow-hidden bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/20 dark:via-orange-900/15 dark:to-yellow-900/10 border border-amber-200/80 dark:border-amber-700/40 rounded-2xl p-4 shadow-sm">
          <button
            onClick={dismissHint}
            className="absolute top-3 right-3 p-1 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/30 rounded-lg transition-colors"
            title={t('common.close', 'Закрыть')}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 dark:bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-2">
                {t('org.students.hintTitle', 'Как добавить студентов?')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">1</span>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                    <span className="font-semibold text-amber-800 dark:text-amber-200">{t('org.students.hintWay1Title', 'Создать вручную')}</span> — {t('org.students.hintWay1Desc', 'нажмите кнопку «Добавить студента» вверху и введите имя и пароль. Студент сможет войти по этим данным.')}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">2</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      <span className="font-semibold text-amber-800 dark:text-amber-200">{t('org.students.hintWay2Title', 'Отправить ссылку')}</span> — {t('org.students.hintWay2Desc', 'поделитесь публичной ссылкой, и студенты зарегистрируются сами:')}
                    </p>
                    {publicInviteUrl && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex items-center gap-1.5 bg-white/80 dark:bg-slate-800/60 border border-amber-200/60 dark:border-amber-700/30 rounded-lg px-2.5 py-1.5 min-w-0 flex-1">
                          <LinkIcon className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="text-[11px] text-amber-700 dark:text-amber-300 truncate font-mono">{publicInviteUrl}</span>
                        </div>
                        <button
                          onClick={copyInviteLink}
                          className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300/50 dark:border-amber-600/30 transition-colors"
                        >
                          {hintCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {hintCopied ? t('common.copied', 'Скопировано') : t('common.copy', 'Копировать')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">3</span>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                    <span className="font-semibold text-amber-800 dark:text-amber-200">{t('org.students.hintWay3Title', 'Заявки')}</span> — {t('org.students.hintWay3Desc', 'студенты, перешедшие по ссылке, появятся во вкладке «Заявки», где вы сможете одобрить или отклонить их.')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {activeTab === 'students' && (
        <>
          {/* Unified Filter Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder={t('org.students.searchPlaceholder', 'Поиск по имени, email или телефону...')}
                className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" 
              />
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
              {groups.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none">
                    <option value="all">{t('org.students.allGroups', 'Все группы')}</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <BranchFilter value={branchFilter} onChange={setBranchFilter} compact />

              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0 ml-2">
                {(['active', 'expelled', 'all'] as const).map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {s === 'active' ? t('org.students.statusActive', 'Активные') : s === 'expelled' ? t('org.students.statusExpelled', 'Отчисленные') : t('org.students.statusAll', 'Все')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Count */}
          {(search || selectedGroup !== 'all') && (
            <div className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {t('org.students.found', 'Найдено')}: <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredStudents.length}</span> {t('org.students.ofTotal', 'из')} {students.length}
            </div>
          )}

          {filteredStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search || selectedGroup !== 'all' ? t('org.students.noSearchResults', 'Студенты не найдены') : t('org.students.empty')}
              description={search || selectedGroup !== 'all' ? 'Попробуйте изменить фильтры поиска' : 'Добавьте первого студента'}
              actionLabel={t('org.students.create', 'Добавить студента')}
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_180px_120px_130px_100px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span className="cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 select-none" onClick={() => toggleSort('name')}>
                  {t('org.results.student')}
                  {sortField === 'name' && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                </span>
                <span className="cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 select-none" onClick={() => toggleSort('email')}>
                  Email
                  {sortField === 'email' && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                </span>
                <span>{t('common.phone')}</span>
                <span>{t('org.students.groupCol', 'Группа')}</span>
                <span>{t('common.status')}</span>
              </div>

              {paginatedStudents.map((s) => {
                const studentGroupNames = getStudentGroups(s.uid);
                return (
                  <div
                    key={s.uid}
                    onClick={() => navigate(`/students/${s.uid}`)}
                    className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_180px_120px_130px_100px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
                  >
                    {/* Name + avatar */}
                    <div className="flex items-center gap-3 min-w-0 w-full">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0 hover:scale-110 transition-transform cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpandedAvatar(s.avatarUrl!); }} />
                      ) : (
                        <div className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">{s.displayName?.[0]?.toUpperCase() || '?'}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors flex items-center gap-2">
                          {s.displayName}
                          <PinnedBadgesDisplay badges={s.pinnedBadges} />
                        </h3>
                        {/* Mobile-only meta */}
                        <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                          {s.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                          {s.phone && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(s as any).status === 'expelled' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                            {(s as any).status === 'expelled' ? t('common.expelled', 'Отчислен') : t('common.active', 'Активен')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>

                    {/* Phone */}
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {s.phone ? (
                        <><Phone className="w-3.5 h-3.5 text-slate-400" /><span>{s.phone}</span></>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>

                    {/* Groups */}
                    <div className="hidden md:flex flex-wrap gap-1">
                      {studentGroupNames.length > 0 ? (
                        <>
                          {studentGroupNames.slice(0, 2).map((name, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium truncate max-w-[100px]">{name}</span>
                          ))}
                          {studentGroupNames.length > 2 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-medium">+{studentGroupNames.length - 2}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="hidden md:flex items-center gap-2">
                      {(s as any).status === 'expelled' ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{t('common.expelled', 'Отчислен')}</span>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{t('common.active', 'Активен')}</span>
                      )}
                      {(s as any).status === 'expelled' && (
                        <button
                          onClick={(e) => handleDeleteExpelled(e, s.uid)}
                          disabled={deletingId === s.uid}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                          title={t('common.delete', 'Удалить навсегда')}
                        >
                          {deletingId === s.uid ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-slate-500">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredStudents.length)} из {filteredStudents.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">←</button>
                <span className="text-sm font-medium text-slate-500 px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'applications' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {loadingApps ? (
            <ListSkeleton rows={4} />
          ) : applications.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={t('org.students.noApplications', 'Нет входящих заявок')}
              description="Когда студенты подадут заявки, они появятся здесь"
            />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_200px_120px_100px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>{t('org.results.student')}</span>
                <span>{t('common.email', 'Email')}</span>
                <span>{t('common.date')}</span>
                <span className="text-right">{t('common.actions')}</span>
              </div>
              {applications.map((app) => (
                <div key={app.id} className="flex flex-col md:grid md:grid-cols-[1fr_200px_120px_100px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 w-full">
                    {(app as any).userAvatarUrl ? (
                      <img src={(app as any).userAvatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 bg-amber-500 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0">{app.userName?.[0]?.toUpperCase() || '?'}</div>
                    )}
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{app.userName}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{app.userEmail}</span>
                  </div>
                  <div className="hidden md:block text-[11px] text-slate-500">{new Date(app.createdAt).toLocaleDateString()}</div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleApprove(app.userId)} className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title={t('common.accept')}>
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleReject(app.userId)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors" title={t('common.reject')}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'courseRequests' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {loadingCourseReqs ? (
            <ListSkeleton rows={4} />
          ) : courseRequests.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Нет заявок на курсы"
              description="Заявки студентов на курсы появятся здесь"
            />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_200px_120px_100px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>Студент</span>
                <span>Курс</span>
                <span>Дата</span>
                <span className="text-right">Действия</span>
              </div>
              {courseRequests.map((req) => (
                <div key={req.id} className="flex flex-col md:grid md:grid-cols-[1fr_200px_120px_100px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 w-full">
                    {req.userAvatarUrl ? (
                      <img src={req.userAvatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 bg-violet-500 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0">{req.userName?.[0]?.toUpperCase() || '?'}</div>
                    )}
                    <div>
                      <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{req.userName}</span>
                      <span className="block md:hidden text-[10px] text-slate-500 truncate">{req.courseName}</span>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                    <span className="truncate">{req.courseName}</span>
                  </div>
                  <div className="hidden md:block text-[11px] text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setSelectedCourseReq(req); setShowCourseReqModal(true); }} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-all" title={t('common.accept')}>
                      Одобрить
                    </button>
                    <button onClick={() => handleRejectCourseReq(req.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors" title={t('common.reject')}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {showCourseReqModal && selectedCourseReq && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { setShowCourseReqModal(false); setSelectedCourseReq(null); }}>
           <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Одобрение заявки на курс</h2>
             <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Студент <span className="font-bold">{selectedCourseReq.userName}</span> хочет на курс <span className="font-bold">{selectedCourseReq.courseName}</span>. Выберите группу для зачисления:</p>
             
             <div className="space-y-4">
               {groups.filter(g => g.courseId === selectedCourseReq.courseId).length > 0 ? (
                 <div className="grid grid-cols-1 gap-2">
                   {groups.filter(g => g.courseId === selectedCourseReq.courseId).map(g => (
                     <button
                       key={g.id}
                       onClick={() => handleApproveCourseReq(g.id)}
                       className="p-3 text-left border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all group"
                     >
                       <div className="font-bold text-slate-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300">{g.name}</div>
                       <div className="text-xs text-slate-500">{g.studentIds?.length || 0} студентов</div>
                     </button>
                   ))}
                 </div>
               ) : (
                 <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-sm">
                   У этого курса пока нет ни одной группы. Создайте группу в карточке курса, прежде чем одобрять заявку.
                 </div>
               )}
             </div>

             <div className="flex justify-end mt-6">
               <button onClick={() => { setShowCourseReqModal(false); setSelectedCourseReq(null); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
                 Отмена
               </button>
             </div>
           </div>
         </div>
      )}

      {/* Create Student Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-500" />
              {t('org.students.createTitle', 'Добавить ученика')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">{t('org.students.createDesc', 'Для учеников, которых добавляет менеджер (без аккаунта)')}</p>
            <div className="space-y-4">
              {/* ФИО */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.fullName', 'ФИО')} *</label>
                <input autoFocus value={createForm.displayName} onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} placeholder={t('org.students.namePlaceholder', 'ФИО студента')} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              {/* Телефон */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('common.phone', 'Телефон')}</label>
                <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              {/* Курс */}
              {courses.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {t('org.students.course', 'Курс')}</label>
                  <select
                    value={createForm.courseId}
                    onChange={e => setCreateForm(f => ({ ...f, courseId: e.target.value, groupId: '' }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none"
                  >
                    <option value="">{t('org.students.selectCourse', '— Выберите курс —')}</option>
                    {courses.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Группа */}
              {createForm.courseId && filteredGroupsForCreate.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><UsersRound className="w-3.5 h-3.5" /> {t('org.students.group', 'Группа')}</label>
                  <select
                    value={createForm.groupId}
                    onChange={e => setCreateForm(f => ({ ...f, groupId: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none"
                  >
                    <option value="">{t('org.students.selectGroup', '— Выберите группу —')}</option>
                    {filteredGroupsForCreate.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {createForm.courseId && filteredGroupsForCreate.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t('org.students.noGroupsForCourse', 'У этого курса пока нет групп. Студент будет создан без группы.')}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => { setShowCreateModal(false); setCreateForm({ displayName: '', phone: '', courseId: '', groupId: '' }); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel', 'Отмена')}</button>
              <button onClick={handleCreateStudent} disabled={creating || !createForm.displayName.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? t('common.loading', 'Добавление...') : t('org.students.addStudent', 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Full-Screen Modal */}
      {expandedAvatar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setExpandedAvatar(null)}>
          <div className="relative max-w-2xl max-h-[90vh] w-full flex justify-center" onClick={e => e.stopPropagation()}>
            <img src={expandedAvatar} alt="Expanded Avatar" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
            <button onClick={() => setExpandedAvatar(null)} className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors bg-black/40 hover:bg-black/60 rounded-full">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsPage;
