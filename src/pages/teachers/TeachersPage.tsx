import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  orgGetTeachers,
  orgCreateTeacher,
  orgListBranches,
  orgGetGroups,
  apiDeleteMember
} from '../../lib/api';
import { usePlanGate } from '../../contexts/PlanContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { UserPlus, Search, Mail, RefreshCw, Phone, CheckCircle, Lightbulb, Copy, X, Plus, KeyRound, Eye, EyeOff, MessageCircle, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import type { UserProfile, Group, Branch } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import RowMenu, { type RowMenuItem } from '../../components/ui/RowMenu';
import EditTeacherModal from '../../components/teachers/EditTeacherModal';
import BulkActionBar from '../../components/roster/BulkActionBar';
import { ListSkeleton } from '../../components/ui/Skeleton';
import { useOrgPresence } from '../../hooks/useOrgPresence';
import { PresenceBadge, PresenceDot } from '../../components/presence/PresenceBadge';

/**
 * Номер для wa.me: только цифры, без «+», обязательно с кодом страны — на
 * локальный `0700 99 88 77` WhatsApp открывает пустой чат, а не преподавателя.
 * Ведущий 0 у 10-значного номера — кыргызстанский местный формат (его же
 * подсказывает плейсхолдер «+996 …» в форме добавления), меняем его на 996.
 * Всё, что не похоже на номер, пункт меню просто не получает.
 */
const toWhatsappNumber = (phone?: string): string | null => {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (/^0\d{9}$/.test(digits)) return `996${digits.slice(1)}`;
  return digits.length >= 11 ? digits : null;
};

const TeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const { limits } = usePlanGate();
  const { profile, role, organizationId } = useAuth();
  const { canWrite, canDelete, loaded: permsLoaded } = usePermissions();
  const navigate = useNavigate();
  const presence = useOrgPresence(organizationId);

  // Selection exists to feed the bulk bar, so it appears whenever at least one bulk
  // action is available: migrating takes teachers:write, deleting teachers:delete.
  // The bar gates each action on its own grant, and the server enforces both.
  const bulkEnabled = permsLoaded && (canWrite('teachers') || canDelete('teachers'));
  const mayAdd = permsLoaded && canWrite('teachers');

  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  // Bulk selection (desktop table only — the mobile layout has no checkbox column)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [branches, setBranches] = useState<Branch[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Direct add (create a teacher account with credentials) — mirrors the student add flow
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ displayName: '', phone: '', username: '', password: '' });
  const [giveLogin, setGiveLogin] = useState(true);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);
  // Holds the generated credentials so the manager can hand them to the teacher (shown once).
  const [createdInfo, setCreatedInfo] = useState<{ name: string; username?: string; password?: string } | null>(null);

  // Onboarding hint
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem('teachers_invite_hint_dismissed') === '1');

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem('teachers_invite_hint_dismissed', '1');
  };

  const loadTeachers = async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const data: any = await orgGetTeachers();
      // Mirror the server's union semantics (memberHoldsRole in api-org.ts), narrowed
      // to the teaching roles: a multi-role member (manager + teacher) or a mentor
      // belongs here too. Matching on the primary `role` alone dropped them.
      // Admins/owners stay excluded — the endpoint returns them, but listing them
      // would both pollute this page and inflate the plan-limit check below.
      let teachersOnly = (Array.isArray(data) ? data : []).filter(
        (u: any) => [u.role, ...(u.roles || [])].some((r: string) => r === 'teacher' || r === 'mentor')
      );
      if (role === 'student' && profile?.uid) {
        const allGroups: any[] = await orgGetGroups().catch(() => []);
        const myGroups = allGroups.filter((g: any) => g.studentIds?.includes(profile.uid));
        const myTeacherIds = new Set(myGroups.flatMap((g: any) => g.teacherIds || []));
        teachersOnly = teachersOnly.filter((t: any) => myTeacherIds.has(t.uid));
      }
      setTeachers(teachersOnly);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Destinations for bulk migration. Only fetched for members who can actually run
  // a bulk action, so a read-only viewer costs nothing extra. orgListBranches already
  // narrows a branch-scoped manager to their own branches.
  const loadBulkTargets = async () => {
    const [b, g] = await Promise.all([
      orgListBranches().catch(() => []),
      orgGetGroups().catch(() => []),
    ]);
    setBranches(Array.isArray(b) ? b : []);
    setGroups(Array.isArray(g) ? g : []);
  };

  useEffect(() => {
    loadTeachers();
  }, [organizationId]);

  useEffect(() => { if (bulkEnabled) loadBulkTargets(); }, [organizationId, bulkEnabled]);

  const filtered = teachers.filter((t) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));

  // A selection only means something for rows still on screen — drop it when the
  // search narrows the list under it.
  useEffect(() => setSelected(new Set()), [search]);

  // ─── Bulk selection ───
  const toggleSelect = (uid: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const allSelected = filtered.length > 0 && filtered.every(x => selected.has(x.uid));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map(x => x.uid)));

  // Columns shift by one when the checkbox column is present.
  const gridCols = bulkEnabled
    ? 'md:grid-cols-[28px_1fr_190px_130px_150px_44px]'
    : 'md:grid-cols-[1fr_190px_130px_150px_44px]';

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('common.copied', 'Скопировано'));
    } catch {
      toast.error(`${label}: ${value}`);
    }
  };

  // Удаление сотрудника необратимо. У преподавателей нет мягкого «отчислить», как
  // у студентов: api-memberships кладёт им status:'removed', список тянет только
  // 'active', а restore серверу разрешён исключительно для студентов — доступ
  // сотрудника живёт в RBAC, а не в статусе членства. Поэтому здесь сразу delete,
  // с той же формулировкой, что и в BulkActionBar.
  const handleDelete = async (teacher: UserProfile) => {
    if (!organizationId) return;
    const name = teacher.displayName || t('nav.teachers');
    if (!window.confirm(
      `Удалить ${name} из организации? Преподаватель будет исключён из всех групп. Аккаунт для входа сохранится — удалится только связь с организацией. Действие необратимо.`
    )) return;

    setDeletingId(teacher.uid);
    try {
      await apiDeleteMember(teacher.uid, organizationId);
      toast.success(t('org.teachers.deleted', 'Преподаватель удалён из организации'));
      setTeachers(prev => prev.filter(x => x.uid !== teacher.uid));
      setSelected(prev => { const n = new Set(prev); n.delete(teacher.uid); return n; });
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setDeletingId(null);
    }
  };

  // Одно меню на строку. Контакты строятся из тех же полей, что уже показаны в
  // строке, так что ничего нового они не раскрывают и правами не закрыты.
  // Пустой массив — RowMenu не рисует кнопку вообще.
  const buildRowMenu = (teacher: UserProfile): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    const waNumber = toWhatsappNumber(teacher.phone);

    if (waNumber) {
      items.push({
        label: t('common.writeWhatsapp', 'Написать в WhatsApp'),
        icon: MessageCircle,
        onSelect: () => window.open(`https://wa.me/${waNumber}`, '_blank', 'noopener,noreferrer'),
      });
    }
    if (teacher.email) {
      items.push({
        label: t('common.writeEmail', 'Написать на почту'),
        icon: Mail,
        onSelect: () => { window.location.href = `mailto:${teacher.email}`; },
      });
    }
    if (teacher.phone) {
      items.push({
        label: t('common.copyPhone', 'Скопировать телефон'),
        icon: Copy,
        onSelect: () => copy(teacher.phone!, t('common.phone', 'Телефон')),
      });
    }

    if (permsLoaded && canWrite('teachers')) {
      items.push({
        label: t('common.edit', 'Редактировать'),
        icon: Pencil,
        separated: items.length > 0,
        onSelect: () => setEditing(teacher),
      });
    }

    // Себя из организации через этот список не удалить — для выхода есть «Покинуть
    // организацию» в профиле, и там другой серверный путь.
    if (permsLoaded && canDelete('teachers') && teacher.uid !== profile?.uid) {
      items.push({
        // Свой ключ, а не common.delete: тот уже переведён как просто «Удалить»
        // и съел бы уточнение, что удаляется членство, а не аккаунт.
        label: t('org.teachers.removeFromOrg', 'Удалить из организации'),
        icon: Trash2,
        danger: true,
        separated: items.length > 0,
        onSelect: () => handleDelete(teacher),
      });
    }

    return items;
  };

  const resetCreateForm = () => {
    setCreateForm({ displayName: '', phone: '', username: '', password: '' });
    setGiveLogin(true);
    setShowCreatePassword(false);
  };

  const handleCreateTeacher = async () => {
    if (!createForm.displayName.trim()) return;

    if (limits.maxTeachers !== -1 && teachers.length >= limits.maxTeachers) {
      toast.error(t('org.settings.maxTeachersReached', 'Достигнут лимит преподавателей для вашего тарифа'));
      return;
    }
    if (giveLogin) {
      if (createForm.username.trim().length < 3) { toast.error(t('org.teachers.usernameTooShort', 'Логин — минимум 3 символа')); return; }
      if (createForm.password.length < 6) { toast.error(t('org.teachers.passwordTooShort', 'Пароль — минимум 6 символов')); return; }
    }
    setCreating(true);
    try {
      const payload: any = {
        displayName: createForm.displayName.trim(),
        phone: createForm.phone,
      };
      if (giveLogin) {
        payload.username = createForm.username.trim().toLowerCase();
        payload.password = createForm.password;
      }
      const res: any = await orgCreateTeacher(payload);
      toast.success(t('org.teachers.created', 'Преподаватель создан!'));
      loadTeachers();
      if (res?.login) {
        // Keep the modal open to show the login the manager can hand to the teacher.
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

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('nav.teachers')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {`${teachers.length} ${t('org.teachers.total')}`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => loadTeachers()} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          {mayAdd && (
            <button onClick={() => setShowCreateModal(true)} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
              <Plus className="w-4 h-4" />
              {t('org.teachers.add', 'Добавить')}
            </button>
          )}
        </div>
      </div>

      {/* Onboarding Hint for Managers */}
      {!hintDismissed && (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'super_admin') && (
        <div className="mb-6 relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
          <button
            onClick={dismissHint}
            className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={t('common.close', 'Закрыть')}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                {t('org.teachers.hintTitle', 'Как добавить преподавателя?')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('org.teachers.hintAddDesc', 'Нажмите «Добавить», введите ФИО и задайте логин с паролем. Передайте эти данные преподавателю — самому регистрироваться не нужно.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      <>
          {/* Unified Filter Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
                className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
          </div>

          {/* Bulk actions — renders itself only when something is selected */}
          <div className="mb-4 empty:mb-0">
            <BulkActionBar
              kind="teacher"
              selected={selected}
              branches={branches}
              groups={groups}
              onClear={() => setSelected(new Set())}
              onDone={() => { setSelected(new Set()); loadTeachers(true); loadBulkTargets(); }}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={search ? 'Преподаватели не найдены' : t('org.teachers.empty')}
              description={search ? 'Попробуйте изменить поисковый запрос' : t('org.teachers.emptyDesc', 'Добавьте первого преподавателя')}
              actionLabel={mayAdd ? t('org.teachers.add', 'Добавить') : undefined}
              onAction={mayAdd ? () => setShowCreateModal(true) : undefined}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className={`hidden md:grid ${gridCols} gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500`}>
                {bulkEnabled && (
                  <span className="flex items-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
                      title={t('roster.bulk.selectAll', 'Выбрать всех')}
                    />
                  </span>
                )}
                <span>{t('nav.teachers')}</span>
                <span>{t('common.email', 'Email')}</span>
                <span>{t('common.phone')}</span>
                <span>{t('common.status', 'Статус')}</span>
                <span className="sr-only">{t('common.actions', 'Действия')}</span>
              </div>

              {filtered.map((teacher) => {
                const online = presence.isOnline(teacher.uid);
                const lastSeenMs = presence.lastSeenMs(teacher.uid);
                return (
                <div
                  key={teacher.uid}
                  onClick={() => navigate(`/teachers/${teacher.uid}`)}
                  className={`relative cursor-pointer group flex flex-col md:grid ${gridCols} gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors`}
                >
                  {/* Select — the whole row navigates, so keep the click to itself */}
                  {bulkEnabled && (
                    <div className="hidden md:flex items-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(teacher.uid)}
                        onChange={() => toggleSelect(teacher.uid)}
                        className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Name + avatar — на мобиле уступаем место меню в углу */}
                  <div className="flex items-center gap-3 min-w-0 w-full pr-8 md:pr-0">
                    <div className="relative shrink-0">
                      {teacher.avatarUrl ? (
                        <img src={teacher.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 hover:scale-110 transition-transform" />
                      ) : (
                        <div className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm">{teacher.displayName?.[0]?.toUpperCase() || '?'}</div>
                      )}
                      <PresenceDot
                        online={online}
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3"
                        title={online ? t('presence.online', 'В сети') : t('presence.offline', 'Не в сети')}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{teacher.displayName}</h3>
                      {/* Mobile meta */}
                      <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                        {teacher.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{teacher.email}</span>}
                        <PresenceBadge online={online} lastSeenMs={lastSeenMs} />
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{teacher.email}</span>
                  </div>

                  {/* Phone */}
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {teacher.phone ? (
                      <><Phone className="w-3.5 h-3.5 text-slate-400" /><span>{teacher.phone}</span></>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </div>

                  {/* Presence status */}
                  <div className="hidden md:block">
                    <PresenceBadge online={online} lastSeenMs={lastSeenMs} />
                  </div>

                  {/* Actions — на мобиле карточка вертикальная, поэтому меню
                      прижато к верхнему правому углу вместо своей колонки. */}
                  <div className="absolute top-3 right-3 md:static md:flex md:justify-end">
                    {deletingId === teacher.uid
                      ? <RefreshCw className="w-4 h-4 m-1.5 animate-spin text-slate-400" />
                      : <RowMenu items={buildRowMenu(teacher)} />}
                  </div>
                </div>
                );
              })}
            </div>
          )}
      </>

      {editing && (
        <EditTeacherModal
          teacher={editing as any}
          onClose={() => setEditing(null)}
          onSaved={patch => setTeachers(prev => prev.map(x => (x.uid === editing.uid ? { ...x, ...patch } : x)))}
        />
      )}

      {/* Create Teacher Modal — add a teacher directly, no self-registration */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { if (!creating) { setShowCreateModal(false); setCreatedInfo(null); resetCreateForm(); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {createdInfo ? (
              /* ─── Credentials result: show the login to hand to the teacher ─── */
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.teachers.createdTitle', 'Преподаватель создан')}</h2>
                <p className="text-xs text-slate-500 mb-5">{t('org.teachers.createdDesc', 'Передайте преподавателю эти данные для входа. Пароль показывается только сейчас.')}</p>

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
              {t('org.teachers.createTitle', 'Добавить преподавателя')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">{t('org.teachers.createDescV2', 'Создайте аккаунт преподавателя с логином и паролем. Отключите «Дать доступ», чтобы завести только запись без входа.')}</p>
            <div className="space-y-4">
              {/* ФИО */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.fullName', 'ФИО')} *</label>
                <input autoFocus value={createForm.displayName} onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} placeholder={t('org.teachers.namePlaceholder', 'ФИО преподавателя')} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              {/* Телефон */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('common.phone', 'Телефон')}</label>
                <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>

              {/* ─── Optional login access ─── */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <KeyRound className="w-4 h-4 text-primary-500" />
                    {t('org.teachers.giveLogin', 'Дать доступ в систему')}
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
                    <p className="text-[11px] text-slate-400">{t('org.teachers.giveLoginHint', 'Преподаватель сможет войти по этому логину и паролю на странице входа.')}</p>
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
              <button onClick={handleCreateTeacher} disabled={creating || !createForm.displayName.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? t('common.loading', 'Добавление...') : t('org.teachers.add', 'Добавить')}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default TeachersPage;
