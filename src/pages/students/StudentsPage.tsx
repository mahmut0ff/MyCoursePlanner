import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import {
  orgGetStudents,
  orgGetGroups,
  orgGetCourses,
  orgCreateStudent,
  orgBulkCreateStudents,
  apiGetOrgMembers,
  apiAcceptMembership,
  apiRejectMembership,
  apiDeleteMember,
  orgGetCourseRequests,
  orgApproveCourseRequest,
  orgRejectCourseRequest
} from '../../lib/api';
import { Users, Search, Mail, RefreshCw, CheckCircle, XCircle, UserPlus, Phone, Filter, X, SortAsc, SortDesc, Trash2, Plus, Lightbulb, Link as LinkIcon, Copy, BookOpen, UsersRound, Upload, KeyRound, Eye, EyeOff, Calendar } from 'lucide-react';
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
  const [createForm, setCreateForm] = useState({ displayName: '', phone: '', enrollmentDate: '', courseId: '', groupId: '', username: '', password: '' });
  const [giveLogin, setGiveLogin] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  // Credentials shown once after creating a student with a login
  const [createdInfo, setCreatedInfo] = useState<{ name: string; username?: string; password?: string } | null>(null);

  // Bulk import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importCourseId, setImportCourseId] = useState('');
  const [importGroupId, setImportGroupId] = useState('');
  const [importEnrollmentDate, setImportEnrollmentDate] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped?: number } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

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



  const resetCreateForm = () => {
    setCreateForm({ displayName: '', phone: '', enrollmentDate: '', courseId: '', groupId: '', username: '', password: '' });
    setGiveLogin(false);
    setShowCreatePassword(false);
  };

  const handleCreateStudent = async () => {
    if (!createForm.displayName.trim()) return;
    if (giveLogin) {
      if (createForm.username.trim().length < 3) { toast.error(t('org.students.usernameTooShort', 'Логин — минимум 3 символа')); return; }
      if (createForm.password.length < 6) { toast.error(t('org.students.passwordTooShort', 'Пароль — минимум 6 символов')); return; }
    }
    setCreating(true);
    try {
      const payload: any = {
        displayName: createForm.displayName.trim(),
        phone: createForm.phone,
        courseId: createForm.courseId,
        groupId: createForm.groupId,
      };
      if (createForm.enrollmentDate) payload.enrollmentDate = createForm.enrollmentDate;
      if (giveLogin) {
        payload.username = createForm.username.trim().toLowerCase();
        payload.password = createForm.password;
      }
      const res: any = await orgCreateStudent(payload);
      toast.success(t('org.students.created', 'Студент добавлен!'));
      loadStudents();
      loadGroups();
      if (res?.login) {
        // Keep the modal open to show the login the manager can hand to the student.
        setCreatedInfo({ name: payload.displayName, username: res.login.username || createForm.username.trim().toLowerCase(), password: createForm.password });
      } else {
        setShowCreateModal(false);
        resetCreateForm();
      }
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  // ─── Bulk import (CSV / pasted list) ───
  // Parses a name+phone table. Accepts comma / semicolon / tab delimiters, an
  // optional header row, and a "one name per line" fallback.
  const parsedImport = useMemo(() => {
    const lines = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [] as { displayName: string; phone: string }[];

    const splitRow = (line: string): string[] => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      // Minimal quoted-field aware split
      const out: string[] = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === delim && !inQ) { out.push(cur); cur = ''; continue; }
        cur += ch;
      }
      out.push(cur);
      return out.map(c => c.trim());
    };

    let nameIdx = 0, phoneIdx = 1;
    let start = 0;
    const firstCells = splitRow(lines[0]).map(c => c.toLowerCase());
    const looksLikeHeader = firstCells.some(c => /имя|фио|name|студент|ученик|телефон|phone|тел/.test(c));
    if (looksLikeHeader) {
      const ni = firstCells.findIndex(c => /имя|фио|name|студент|ученик/.test(c));
      const pi = firstCells.findIndex(c => /телефон|phone|тел/.test(c));
      if (ni >= 0) nameIdx = ni;
      if (pi >= 0) phoneIdx = pi;
      start = 1;
    }

    const rows: { displayName: string; phone: string }[] = [];
    for (let i = start; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      const displayName = (cells[nameIdx] || '').trim();
      if (!displayName) continue;
      rows.push({ displayName, phone: (cells[phoneIdx] || '').trim() });
    }
    return rows;
  }, [importText]);

  const importGroupsForCourse = useMemo(() => {
    if (!importCourseId) return [];
    return groups.filter(g => g.courseId === importCourseId);
  }, [groups, importCourseId]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    if (parsedImport.length === 0) { toast.error(t('org.students.importEmpty', 'Не найдено ни одной строки с именем')); return; }
    setImporting(true);
    try {
      const res: any = await orgBulkCreateStudents({
        students: parsedImport,
        courseId: importCourseId || undefined,
        groupId: importGroupId || undefined,
        enrollmentDate: importEnrollmentDate || undefined,
      });
      setImportResult({ created: res?.created || 0, skipped: res?.skipped || 0 });
      toast.success(t('org.students.imported', `Импортировано: ${res?.created || 0}`));
      loadStudents();
      loadGroups();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportText('');
    setImportCourseId('');
    setImportGroupId('');
    setImportEnrollmentDate('');
    setImportResult(null);
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
            {activeTab === 'students' ? `${students.filter(s => ((s as any).status || 'active') === 'active').length} ${t('org.students.total')}` : activeTab === 'applications' ? `${applications.length} ${t('org.students.applicationsCount', 'заявок')}` : `${courseRequests.length} заявок на курсы`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => { loadStudents(); loadGroups(); loadApplications(); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { setImportResult(null); setShowImportModal(true); }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shrink-0">
            <Upload className="w-4 h-4" />
            {t('org.students.import', 'Импорт')}
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
                    <span className="font-semibold text-amber-800 dark:text-amber-200">{t('org.students.hintWay1Title', 'Создать вручную')}</span> — {t('org.students.hintWay1DescV2', 'нажмите «Добавить студента». По умолчанию это запись для журнала и оплат (без входа). Чтобы ученик мог заходить сам — включите «Дать доступ» и задайте логин с паролем. Список целиком удобнее завести через «Импорт».')}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { if (!creating) { setShowCreateModal(false); setCreatedInfo(null); resetCreateForm(); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {createdInfo ? (
              /* ─── Credentials result: show the login to hand to the student ─── */
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.students.createdTitle', 'Ученик создан')}</h2>
                <p className="text-xs text-slate-500 mb-5">{t('org.students.createdDesc', 'Передайте ученику эти данные для входа. Пароль показывается только сейчас.')}</p>

                {createdInfo.username && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('org.students.loginLabel', 'Логин')}</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{createdInfo.username}</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.username || ''); toast.success(t('common.copied', 'Скопировано')); }} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('auth.password', 'Пароль')}</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{createdInfo.password}</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.password || ''); toast.success(t('common.copied', 'Скопировано')); }} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"><Copy className="w-4 h-4" /></button>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${t('org.students.loginLabel', 'Логин')}: ${createdInfo.username}\n${t('auth.password', 'Пароль')}: ${createdInfo.password}`); toast.success(t('common.copied', 'Скопировано')); }}
                      className="w-full text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1.5 pt-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> {t('org.students.copyBoth', 'Скопировать логин и пароль')}
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => { setCreatedInfo(null); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('org.students.addAnother', 'Добавить ещё')}</button>
                  <button onClick={() => { setShowCreateModal(false); setCreatedInfo(null); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all">{t('common.done', 'Готово')}</button>
                </div>
              </div>
            ) : (
            <>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-500" />
              {t('org.students.createTitle', 'Добавить ученика')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">{t('org.students.createDescV2', 'По умолчанию — запись для журнала и оплат, без входа. Включите «Дать доступ», чтобы ученик мог входить сам.')}</p>
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
              {/* Дата поступления (необязательно) */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {t('org.students.enrollmentDate', 'Дата поступления')} <span className="text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span></label>
                <input type="date" value={createForm.enrollmentDate} onChange={e => setCreateForm(f => ({ ...f, enrollmentDate: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
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

              {/* ─── Optional login access ─── */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <KeyRound className="w-4 h-4 text-primary-500" />
                    {t('org.students.giveLogin', 'Дать доступ в систему')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={giveLogin}
                    onClick={() => setGiveLogin(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${giveLogin ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${giveLogin ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>
                {giveLogin && (
                  <div className="space-y-3 mt-3">
                    <p className="text-[11px] text-slate-400">{t('org.students.giveLoginHint', 'Ученик сможет войти по этому логину и паролю на странице входа.')}</p>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.loginLabel', 'Логин')} *</label>
                      <input value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="aibek_t" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('auth.password', 'Пароль')} *</label>
                      <div className="relative">
                        <input type={showCreatePassword ? 'text' : 'password'} value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-11 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                        <button type="button" onClick={() => setShowCreatePassword(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                          {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel', 'Отмена')}</button>
              <button onClick={handleCreateStudent} disabled={creating || !createForm.displayName.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? t('common.loading', 'Добавление...') : t('org.students.addStudent', 'Добавить')}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { if (!importing) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {importResult ? (
              /* ─── Import result ─── */
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.students.importDone', 'Импорт завершён')}</h2>
                <p className="text-sm text-slate-500 mb-2">
                  {t('org.students.importedCount', 'Добавлено учеников')}: <span className="font-bold text-slate-900 dark:text-white">{importResult.created}</span>
                </p>
                {!!importResult.skipped && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">{t('org.students.importSkipped', 'Пропущено из-за лимита тарифа')}: {importResult.skipped}</p>
                )}
                <div className="flex justify-end mt-8">
                  <button onClick={closeImportModal} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all">{t('common.done', 'Готово')}</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary-500" />
                  {t('org.students.importTitle', 'Импорт учеников')}
                </h2>
                <p className="text-xs text-slate-500 mb-5">{t('org.students.importDesc', 'Вставьте список из Excel/таблицы или загрузите CSV-файл. Колонки: имя и телефон.')}</p>

                <div className="space-y-4">
                  {/* Paste / upload */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-500">{t('org.students.importList', 'Список')} *</label>
                      <button onClick={() => importFileRef.current?.click()} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5" /> {t('org.students.importUpload', 'Загрузить CSV')}
                      </button>
                      <input ref={importFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={handleImportFile} />
                    </div>
                    <textarea
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      rows={6}
                      placeholder={'Айбек Тологонов, +996700112233\nАйгерим Осмонова, +996555998877\n...'}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none resize-y"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">{t('org.students.importParsed', 'Распознано записей')}: <span className="font-semibold text-slate-600 dark:text-slate-300">{parsedImport.length}</span></p>
                  </div>

                  {/* Optional course + group for the whole batch */}
                  {courses.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {t('org.students.course', 'Курс')} <span className="text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span></label>
                      <select value={importCourseId} onChange={e => { setImportCourseId(e.target.value); setImportGroupId(''); }} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none appearance-none">
                        <option value="">{t('org.students.selectCourse', '— Выберите курс —')}</option>
                        {courses.map((c: any) => (<option key={c.id} value={c.id}>{c.title}</option>))}
                      </select>
                    </div>
                  )}
                  {importCourseId && importGroupsForCourse.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><UsersRound className="w-3.5 h-3.5" /> {t('org.students.group', 'Группа')}</label>
                      <select value={importGroupId} onChange={e => setImportGroupId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none appearance-none">
                        <option value="">{t('org.students.selectGroup', '— Выберите группу —')}</option>
                        {importGroupsForCourse.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                      </select>
                    </div>
                  )}

                  {/* Дата поступления для всей группы (необязательно) */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {t('org.students.enrollmentDate', 'Дата поступления')} <span className="text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span></label>
                    <input type="date" value={importEnrollmentDate} onChange={e => setImportEnrollmentDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none" />
                  </div>

                  {/* Preview */}
                  {parsedImport.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 max-h-40 overflow-y-auto">
                      {parsedImport.slice(0, 8).map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.displayName}</span>
                          <span className="text-slate-400 shrink-0 ml-3">{r.phone || '—'}</span>
                        </div>
                      ))}
                      {parsedImport.length > 8 && <p className="text-[11px] text-slate-400 pt-1.5">+{parsedImport.length - 8} {t('org.students.more', 'ещё')}</p>}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={closeImportModal} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel', 'Отмена')}</button>
                  <button onClick={handleBulkImport} disabled={importing || parsedImport.length === 0} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                    {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {importing ? t('common.loading', 'Импорт...') : `${t('org.students.importBtn', 'Импортировать')} (${parsedImport.length})`}
                  </button>
                </div>
              </>
            )}
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
