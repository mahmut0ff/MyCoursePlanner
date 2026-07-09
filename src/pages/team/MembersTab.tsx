import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search, Loader2, ShieldCheck, Users as UsersIcon, Mail, UserPlus, Check } from 'lucide-react';
import { apiGetTeamMembers, apiGetRoles, apiAssignRole, orgCreateUser } from '../../lib/api';
import { roleAccent, type OrgRole } from '../../lib/rbac';

interface Member {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  roles?: string[];
  roleId: string | null;
  avatarUrl?: string;
}

const BASE_ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  teacher: 'Преподаватель',
  mentor: 'Наставник',
  student: 'Студент',
};

const isFullAccessRole = (r: string) => r === 'admin' || r === 'owner';

const MembersTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // Create a staff account + optionally assign a custom RBAC role in one step.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ displayName: '', username: '', email: '', password: '' });
  const [createRoles, setCreateRoles] = useState<string[]>(['manager']);
  const [createRoleId, setCreateRoleId] = useState('');
  const [creating, setCreating] = useState(false);

  const CREATE_ROLE_LABELS: Record<string, string> = {
    admin: 'Директор', manager: 'Менеджер', teacher: 'Преподаватель', student: 'Студент',
  };
  const toggleCreateRole = (r: string) =>
    setCreateRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  const openCreate = () => {
    setCreateForm({ displayName: '', username: '', email: '', password: '' });
    setCreateRoles(['manager']);
    setCreateRoleId('');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createForm.displayName.trim()) { toast.error('Укажите имя'); return; }
    if (!createForm.username.trim() && !createForm.email.trim()) { toast.error('Укажите логин или email'); return; }
    if (createForm.password.length < 6) { toast.error('Пароль минимум 6 символов'); return; }
    if (createRoles.length === 0) { toast.error('Выберите хотя бы одну роль'); return; }
    setCreating(true);
    try {
      const created: any = await orgCreateUser({
        displayName: createForm.displayName.trim(),
        username: createForm.username.trim() || undefined,
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        roles: createRoles,
      });
      // Account is created — assigning the fine-grained RBAC role is best-effort so a
      // failure here never leaves the modal open (which would risk a duplicate account).
      if (createRoleId && created?.uid) {
        try {
          await apiAssignRole(created.uid, createRoleId);
        } catch (e: any) {
          toast.error('Аккаунт создан, но роль доступа не назначена: ' + (e.message || 'ошибка'));
        }
      }
      toast.success('Сотрудник создан');
      setShowCreate(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setCreating(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([apiGetTeamMembers(), apiGetRoles()]);
      setMembers(m.items || []);
      setRoles(r.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const assign = async (member: Member, roleId: string) => {
    const next = roleId || null;
    setSavingUid(member.uid);
    try {
      await apiAssignRole(member.uid, next);
      setMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, roleId: next } : m));
      toast.success(t('team.roleAssigned', 'Роль назначена'));
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setSavingUid(null); }
  };

  const filtered = members.filter(m =>
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Search + create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('common.search', 'Поиск') + '...'}
            className="input pl-9 text-sm w-full"
          />
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="ml-auto shrink-0 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow-md">
            <UserPlus className="w-4 h-4" />
            {t('team.createStaff', 'Создать сотрудника')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <UsersIcon className="w-9 h-9 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">{t('team.noMembers', 'Сотрудники не найдены.')}</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
          {filtered.map(member => {
            const heldRoles = member.roles?.length ? member.roles : [member.role];
            const accent = roleAccent({ id: member.role, name: member.role });
            const full = heldRoles.some(isFullAccessRole);
            // Assigned fine-grained access role (RBAC) — shown as a badge so it reads
            // alongside the base roles, not just inside the edit dropdown.
            const rbacRole = !full ? roles.find(r => r.id === member.roleId) : undefined;
            return (
              <div key={member.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                {/* Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: accent }}>
                      {member.displayName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{member.displayName || '—'}</p>
                    {member.email && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" />{member.email}</p>
                    )}
                  </div>
                </div>

                {/* Base role badges — a member may hold several roles (multi-role) */}
                <div className="flex flex-wrap gap-1 self-start sm:self-auto shrink-0">
                  {heldRoles.map(r => {
                    const rAccent = roleAccent({ id: r, name: r });
                    return (
                      <span
                        key={r}
                        className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: `${rAccent}1a`, color: rAccent }}
                      >
                        {BASE_ROLE_LABELS[r] || r}
                      </span>
                    );
                  })}
                  {rbacRole && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 border border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10">
                      <ShieldCheck className="w-3 h-3" />{rbacRole.name}
                    </span>
                  )}
                </div>

                {/* Role assignment */}
                <div className="sm:w-56 shrink-0">
                  {full ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" /> {t('team.fullAccess', 'Полный доступ')}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        className="input text-sm !py-1.5"
                        value={member.roleId || ''}
                        disabled={!isAdmin || savingUid === member.uid}
                        onChange={e => assign(member, e.target.value)}
                      >
                        <option value="">{t('team.defaultForRole', 'По умолчанию для роли')}</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {savingUid === member.uid && <Loader2 className="w-4 h-4 animate-spin text-primary-500 shrink-0" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {roles.length === 0 && isAdmin && (
        <p className="text-xs text-slate-400 text-center">
          {t('team.noRolesHint', 'Создайте роли во вкладке «Роли и доступы», чтобы назначать их сотрудникам.')}
        </p>
      )}

      {/* Create staff modal — real account + roles + optional custom RBAC role */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!creating) setShowCreate(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><UserPlus className="w-5 h-5" /> {t('team.createStaff', 'Создать сотрудника')}</h2>
            <p className="text-xs text-slate-500 mb-6">Создаёт аккаунт с логином и паролем. Выберите роли и, при необходимости, кастомную роль доступа (RBAC).</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Имя *</label>
                <input type="text" value={createForm.displayName} onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                  className="input w-full" autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Логин</label>
                  <input type="text" value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="john_doe" className="input w-full" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Email <span className="text-slate-400 font-normal">(необяз.)</span></label>
                  <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="user@example.com" className="input w-full" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">Укажите логин или email — по нему сотрудник будет входить.</p>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Пароль *</label>
                <input type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="минимум 6 символов" className="input w-full font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-2 block">Роли *</label>
                <div className="flex gap-2 flex-wrap">
                  {(['admin', 'manager', 'teacher', 'student'] as const).map(r => {
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
              {roles.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Роль доступа (RBAC) <span className="text-slate-400 font-normal">(необяз.)</span></label>
                  <select value={createRoleId} onChange={e => setCreateRoleId(e.target.value)} className="input w-full text-sm">
                    <option value="">{t('team.defaultForRole', 'По умолчанию для роли')}</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowCreate(false)} disabled={creating} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">{t('common.cancel', 'Отмена')}</button>
              <button onClick={handleCreate} disabled={creating || !createForm.displayName.trim() || createRoles.length === 0}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Создание...</> : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MembersTab;
