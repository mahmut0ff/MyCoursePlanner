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
  apiDeleteMember
} from '../../lib/api';
import { Users, Search, Mail, RefreshCw, CheckCircle, XCircle, UserPlus, Phone, Filter, X, ChevronDown, SortAsc, SortDesc, Trash2, Lock, Plus, Building2, Lightbulb, Link as LinkIcon, Copy, ExternalLink, BookOpen, UsersRound } from 'lucide-react';
import type { UserProfile, Group } from '../../types';
import toast from 'react-hot-toast';
import { PinnedBadgesDisplay } from '../../lib/badges';
import BranchFilter from '../../components/ui/BranchFilter';

type SortField = 'name' | 'email' | 'date';
type SortDir = 'asc' | 'desc';

const StudentsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { limits } = usePlanGate();

  const [activeTab, setActiveTab] = useState<'students' | 'applications'>('students');
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);

  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
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
  const orgSlug = (profile as any)?.activeOrgId || profile?.organizationId || '';
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

  const loadStudents = () => { 
    setLoading(true); 
    setError(''); 
    orgGetStudents(branchFilter || undefined)
      .then(setStudents)
      .catch((e) => setError(e.message || 'Error'))
      .finally(() => setLoading(false)); 
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

  const loadApplications = async () => {
    if (!profile?.activeOrgId) return;
    setLoadingApps(true);
    try {
      const apps = await apiGetOrgMembers(profile.activeOrgId, 'pending', 'student');
      setApplications(apps);
    } catch (e: any) {
      toast.error(e.message || t('common.loadError', 'Ошибка загрузки'));
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    loadStudents();
    loadGroups();
    loadCourses();
    loadApplications();
  }, [profile?.activeOrgId, branchFilter]);

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
  }, [students, search, selectedGroup, groups, sortField, sortDir]);

  const handleApprove = async (userId: string) => {
    if (!profile?.activeOrgId) return;

    if (limits.maxStudents !== -1 && students.length >= limits.maxStudents) {
      toast.error(t('org.settings.maxStudentsReached', 'Достигнут лимит студентов для вашего тарифа'));
      return;
    }

    try {
      await apiAcceptMembership(userId, profile.activeOrgId);
      toast.success(t('directory.applicationApproved', 'Заявка одобрена!'));
      loadApplications();
      loadStudents();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async (userId: string) => {
    if (!profile?.activeOrgId) return;
    try {
      await apiRejectMembership(userId, profile.activeOrgId);
      toast.success(t('directory.applicationRejected', 'Заявка отклонена'));
      loadApplications();
    } catch (e: any) {
      toast.error(e.message);
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

  const activeFiltersCount = (selectedGroup !== 'all' ? 1 : 0) + (statusFilter !== 'active' ? 1 : 0) + (branchFilter ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setSelectedGroup('all');
    setStatusFilter('active');
    setBranchFilter(null);
    setSortField('name');
    setSortDir('asc');
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
    if (!profile?.activeOrgId) return;
    if (!window.confirm(t('org.students.confirmDeleteExpelled', 'Вы уверены что хотите полностью удалить этого студента из организации? Это действие необратимо.'))) return;
    
    setDeletingId(uid);
    try {
      await apiDeleteMember(uid, profile.activeOrgId);
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.students')}</h1>
          <p className="text-[11px] text-slate-500">
            {activeTab === 'students' ? `${students.length} ${t('org.students.total')}` : `${applications.length} ${t('org.students.applicationsCount', 'заявок')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" />
            {t('org.students.create', 'Добавить студента')}
          </button>
          <button onClick={() => { loadStudents(); loadGroups(); loadApplications(); }} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-4">
        <button
          onClick={() => setActiveTab('students')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'students' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t('org.students.activeTabs', 'Активные студенты')}
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'applications' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t('org.students.applicationsTab', 'Заявки')}
          {applications.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {applications.length}
            </span>
          )}
        </button>
      </div>

      {/* Onboarding Hint for Managers */}
      {!hintDismissed && (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'super_admin') && (
        <div className="mb-4 relative overflow-hidden bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/20 dark:via-orange-900/15 dark:to-yellow-900/10 border border-amber-200/80 dark:border-amber-700/40 rounded-2xl p-4 shadow-sm">
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

      {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}

      {activeTab === 'students' && (
        <>
          {/* Search & Filter Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
            <div className="flex items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder={t('org.students.searchPlaceholder', 'Поиск по имени, email или телефону...')}
                  className="w-full bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all" 
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Toggle */}
              <button 
                onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${showFilters || activeFiltersCount > 0 ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400' : 'bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}
              >
                <Filter className="w-3.5 h-3.5" />
                {t('common.filter', 'Фильтр')}
                {activeFiltersCount > 0 && (
                  <span className="bg-primary-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFiltersCount}</span>
                )}
              </button>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700/50">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Group Filter */}
                  {groups.length > 0 && (
                    <div className="relative">
                      <select 
                        value={selectedGroup} 
                        onChange={e => setSelectedGroup(e.target.value)}
                        className="appearance-none bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-primary-500 cursor-pointer min-w-[160px]"
                      >
                        <option value="all">{t('org.students.allGroups', 'Все группы')}</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                  )}

                  {/* Branch Filter */}
                  <BranchFilter
                    value={branchFilter}
                    onChange={setBranchFilter}
                    compact
                  />

                  {/* Status Filter */}
                  <div className="relative">
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="appearance-none bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-primary-500 cursor-pointer"
                    >
                      <option value="active">{t('org.students.statusActive', 'Активные')}</option>
                      <option value="expelled">{t('org.students.statusExpelled', 'Отчисленные')}</option>
                      <option value="all">{t('org.students.statusAll', 'Все статусы')}</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Sort */}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[10px] text-slate-400 mr-1">{t('org.students.sortBy', 'Сортировка:')}</span>
                    {(['name', 'email', 'date'] as SortField[]).map(field => (
                      <button
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${sortField === field ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                      >
                        {field === 'name' && t('common.name', 'Имя')}
                        {field === 'email' && 'Email'}
                        {field === 'date' && t('common.date', 'Дата')}
                        {sortField === field && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                      </button>
                    ))}
                  </div>

                  {/* Clear Filters */}
                  {(activeFiltersCount > 0 || search) && (
                    <button 
                      onClick={clearFilters}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                      <X className="w-3 h-3" />
                      {t('org.students.clearFilters', 'Сбросить')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Results Count */}
          {(search || selectedGroup !== 'all') && !loading && (
            <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t('org.students.found', 'Найдено')}: <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredStudents.length}</span> {t('org.students.ofTotal', 'из')} {students.length}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                {search || selectedGroup !== 'all' 
                  ? t('org.students.noSearchResults', 'Студенты не найдены по вашему запросу') 
                  : t('org.students.empty')
                }
              </p>
              {(search || selectedGroup !== 'all') && (
                <button onClick={clearFilters} className="mt-2 text-[11px] text-primary-500 hover:text-primary-600 font-medium">
                  {t('org.students.clearFilters', 'Сбросить фильтры')}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">
                      {t('org.results.student')}
                      {sortField === 'name' && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none" onClick={() => toggleSort('email')}>
                    <div className="flex items-center gap-1">
                      {t('common.email', 'Email')}
                      {sortField === 'email' && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">{t('common.phone')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden lg:table-cell">{t('org.students.groupCol', 'Группа')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.status')}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                  {paginatedStudents.map((s) => {
                    const studentGroupNames = getStudentGroups(s.uid);
                    return (
                      <tr key={s.uid} onClick={() => navigate(`/students/${s.uid}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 hover:scale-110 transition-transform cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpandedAvatar(s.avatarUrl!); }} />
                            ) : (
                              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-[11px] text-white font-bold shadow-sm">{s.displayName?.[0]?.toUpperCase() || '?'}</div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-2">
                                {s.displayName}
                                <PinnedBadgesDisplay badges={s.pinnedBadges} />
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden sm:table-cell"><div className="flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[180px]">{s.email}</span></div></td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden md:table-cell">{s.phone ? <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</div> : <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          {studentGroupNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {studentGroupNames.slice(0, 2).map((name, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium truncate max-w-[100px]">{name}</span>
                              ))}
                              {studentGroupNames.length > 2 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-medium">+{studentGroupNames.length - 2}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {(s as any).status === 'expelled' ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">{t('common.expelled', 'Отчислен')}</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">{t('common.active', 'Активен')}</span>
                            )}
                            {(s as any).status === 'expelled' && (
                              <button
                                onClick={(e) => handleDeleteExpelled(e, s.uid)}
                                disabled={deletingId === s.uid}
                                className="p-1 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/20 rounded-md transition-colors ml-auto"
                                title={t('common.delete', 'Удалить навсегда')}
                              >
                                {deletingId === s.uid ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-[11px] text-slate-500">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredStudents.length)} из {filteredStudents.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">←</button>
                <span className="text-[11px] font-medium text-slate-500 px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'applications' && (
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
          {loadingApps ? (
             <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
          ) : applications.length === 0 ? (
             <div className="text-center py-16">
               <UserPlus className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
               <p className="text-xs text-slate-400">{t('org.students.noApplications', 'Нет входящих заявок')}</p>
             </div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.results.student')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">{t('common.email', 'Email')}</th>
                <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.date')}</th>
                <th className="text-right text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('common.actions')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {(app as any).userAvatarUrl ? (
                          <img src={(app as any).userAvatarUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                        ) : (
                          <div className="w-6 h-6 bg-amber-500 rounded-md flex items-center justify-center text-[9px] text-white font-bold">{app.userName?.[0]?.toUpperCase() || '?'}</div>
                        )}
                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{app.userName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden sm:table-cell"><div className="flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[180px]">{app.userEmail}</span></div></td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500">{new Date(app.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 flex justify-end gap-2">
                      <button onClick={() => handleApprove(app.userId)} className="p-1 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors" title={t('common.accept')}>
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleReject(app.userId)} className="p-1 text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors" title={t('common.reject')}>
                        <XCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Student Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary-500" />
                {t('org.students.createTitle', 'Добавить ученика')}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{t('org.students.createDesc', 'Для учеников, которых добавляет менеджер (без аккаунта)')}</p>
            </div>
            <div className="p-5 space-y-3.5">
              {/* ФИО */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('org.students.fullName', 'ФИО')} *</label>
                <input autoFocus value={createForm.displayName} onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} placeholder={t('org.students.namePlaceholder', 'ФИО студента')} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 transition-colors" />
              </div>
              {/* Телефон */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Phone className="w-3 h-3" /> {t('common.phone', 'Телефон')}</label>
                <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 transition-colors" />
              </div>
              {/* Курс */}
              {courses.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><BookOpen className="w-3 h-3" /> {t('org.students.course', 'Курс')}</label>
                  <div className="relative">
                    <select
                      value={createForm.courseId}
                      onChange={e => setCreateForm(f => ({ ...f, courseId: e.target.value, groupId: '' }))}
                      className="appearance-none w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm outline-none focus:border-primary-500 transition-colors cursor-pointer"
                    >
                      <option value="">{t('org.students.selectCourse', '— Выберите курс —')}</option>
                      {courses.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
              {/* Группа — filtered by selected course */}
              {createForm.courseId && filteredGroupsForCreate.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><UsersRound className="w-3 h-3" /> {t('org.students.group', 'Группа')}</label>
                  <div className="relative">
                    <select
                      value={createForm.groupId}
                      onChange={e => setCreateForm(f => ({ ...f, groupId: e.target.value }))}
                      className="appearance-none w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm outline-none focus:border-primary-500 transition-colors cursor-pointer"
                    >
                      <option value="">{t('org.students.selectGroup', '— Выберите группу —')}</option>
                      {filteredGroupsForCreate.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
              {createForm.courseId && filteredGroupsForCreate.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('org.students.noGroupsForCourse', 'У этого курса пока нет групп. Студент будет создан без группы.')}</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
              <button onClick={() => { setShowCreateModal(false); setCreateForm({ displayName: '', phone: '', courseId: '', groupId: '' }); }} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel', 'Отмена')}</button>
              <button onClick={handleCreateStudent} disabled={creating || !createForm.displayName.trim()} className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm">
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
