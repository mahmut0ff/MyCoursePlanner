import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetUsers, orgInviteUser, orgCreateUser } from '../../lib/api';
import { Search, Plus, RefreshCw, Mail, Users, UserPlus, Check, Loader2 } from 'lucide-react';
import type { UserProfile } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  manager: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  teacher: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  student: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  manager: 'Менеджер',
  teacher: 'Преподаватель',
  student: 'Студент',
  super_admin: 'Супер админ'
};

const OrgUsersPage: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('student');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create a real account with a custom set of roles (multi-role).
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ displayName: '', username: '', email: '', password: '', phone: '' });
  const [createRoles, setCreateRoles] = useState<string[]>(['student']);
  const [creating, setCreating] = useState(false);

  const CREATE_ROLE_LABELS: Record<string, string> = {
    admin: 'Директор', manager: 'Менеджер', teacher: 'Преподаватель', student: 'Студент',
  };
  const toggleCreateRole = (r: string) =>
    setCreateRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const resetCreate = () => {
    setCreateForm({ displayName: '', username: '', email: '', password: '', phone: '' });
    setCreateRoles(['student']);
  };

  const handleCreate = async () => {
    if (!createForm.displayName.trim()) { setError('Укажите имя'); return; }
    if (!createForm.username.trim() && !createForm.email.trim()) { setError('Укажите логин или email'); return; }
    if (createForm.password.length < 6) { setError('Пароль минимум 6 символов'); return; }
    if (createRoles.length === 0) { setError('Выберите хотя бы одну роль'); return; }
    setCreating(true); setError('');
    try {
      await orgCreateUser({
        displayName: createForm.displayName.trim(),
        username: createForm.username.trim() || undefined,
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        phone: createForm.phone.trim() || undefined,
        roles: createRoles,
      });
      setShowCreate(false);
      resetCreate();
      setSuccess('Пользователь создан!');
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (e: any) {
      setError(e.message || 'Ошибка');
    } finally { setCreating(false); }
  };

  const load = () => { setLoading(true); orgGetUsers().then(setUsers).catch((e) => setError(e.message || 'Error')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = users.filter((u) => {
    const matchesSearch = u.displayName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = Array.from(new Set(users.map(u => u.role))).filter(Boolean);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return; setSaving(true); setError('');
    try { await orgInviteUser(inviteEmail, inviteRole); setShowInvite(false); setInviteEmail(''); setSuccess('Приглашение отправлено!'); setTimeout(() => setSuccess(''), 3000); load(); }
    catch (e: any) { setError(e.message || 'Error'); } finally { setSaving(false); }
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t('nav.users')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{filtered.length} {t('org.users.total')}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { resetCreate(); setError(''); setShowCreate(true); }} className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shrink-0">
            <UserPlus className="w-4 h-4" />
            Создать пользователя
          </button>
          <button onClick={() => setShowInvite(true)} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
            <Plus className="w-4 h-4" />
            {t('org.users.invite')}
          </button>
        </div>
      </div>

      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}
      {success && <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-600 dark:text-emerald-400">{success}</div>}

      {/* Unified Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" />
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1 shrink-0">
            <button onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${roleFilter === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t('common.all', 'Все')}
            </button>
            {uniqueRoles.map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${roleFilter === r ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {ROLE_LABELS[r] || r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || roleFilter !== 'all' ? 'Пользователи не найдены' : 'Пользователей пока нет'}
          description={search || roleFilter !== 'all' ? 'Попробуйте изменить фильтры поиска' : 'Пригласите первого пользователя'}
          actionLabel={t('org.users.invite')}
          onAction={() => setShowInvite(true)}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_200px_100px_120px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>{t('common.name')}</span>
            <span>Email</span>
            <span>{t('org.users.role')}</span>
            <span>{t('org.users.joined')}</span>
          </div>

          {filtered.map((u) => (
            <div
              key={u.uid}
              onClick={() => navigate(`/org-users/${u.uid}`)}
              className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_200px_100px_120px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
            >
              {/* Name + avatar */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                {u.avatarUrl ? (
                   <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0 hover:scale-110 transition-transform" />
                ) : (
                   <div className="w-9 h-9 bg-slate-600 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">{u.displayName?.[0]?.toUpperCase() || '?'}</div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors flex items-center gap-2">
                    {u.displayName}
                    <PinnedBadgesDisplay badges={u.pinnedBadges} />
                  </h3>
                  {/* Mobile meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {u.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ROLE_COLORS[u.role] || ROLE_COLORS.student}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{u.email}</span>
              </div>

              {/* Role */}
              <div className="hidden md:block">
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${ROLE_COLORS[u.role] || ROLE_COLORS.student}`}>{ROLE_LABELS[u.role] || u.role}</span>
              </div>

              {/* Date */}
              <div className="hidden md:block text-[11px] text-slate-400">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('org.users.invite')}</h2>
            <p className="text-xs text-slate-500 mb-6">Пригласите пользователя по email и выберите роль</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Email</label>
                <input type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.users.role')}</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none">
                  <option value="student">{t('org.users.roleStudent')}</option>
                  <option value="teacher">{t('org.users.roleTeacher')}</option>
                  <option value="admin">{t('org.users.roleAdmin')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowInvite(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '...' : t('org.users.sendInvite')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal (real account + custom set of roles) */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!creating) setShowCreate(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><UserPlus className="w-5 h-5" /> Создать пользователя</h2>
            <p className="text-xs text-slate-500 mb-6">Создаёт аккаунт с логином и паролем. Выберите одну или несколько ролей — при нескольких пользователь сможет переключаться между ними.</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Имя *</label>
                <input type="text" value={createForm.displayName} onChange={(e) => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Логин</label>
                  <input type="text" value={createForm.username} onChange={(e) => setCreateForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="john_doe" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Email <span className="text-slate-400 font-normal">(необяз.)</span></label>
                  <input type="email" value={createForm.email} onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="user@example.com" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">Укажите логин или email — по нему пользователь будет входить.</p>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Пароль *</label>
                <input type="text" value={createForm.password} onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="минимум 6 символов" className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-2 block">Роли *</label>
                <div className="flex gap-2 flex-wrap">
                  {(['admin', 'manager', 'teacher', 'student'] as const).map((r) => {
                    const selected = createRoles.includes(r);
                    return (
                      <button key={r} type="button" onClick={() => toggleCreateRole(r)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${selected ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                        {selected && <Check className="w-3.5 h-3.5" />}
                        {CREATE_ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowCreate(false)} disabled={creating} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={creating || !createForm.displayName.trim() || createRoles.length === 0}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Создание...</> : <>Создать</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgUsersPage;
