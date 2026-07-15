import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search, Loader2, ShieldCheck, Users as UsersIcon, Mail, UserPlus, Check, SlidersHorizontal, X, Save } from 'lucide-react';
import { apiGetTeamMembers, apiGetRoles, apiAssignRole, apiSetMemberOverrides, orgCreateUser } from '../../lib/api';
import {
  roleAccent, resolvePermissionSet, applyOverrides, diffOverrides,
  type OrgRole, type PermissionOverrides, type RbacAction,
} from '../../lib/rbac';
import PermissionGrid from './PermissionGrid';

interface Member {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  roles?: string[];
  roleId: string | null;
  overrides?: PermissionOverrides | null;
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
const overrideCount = (o?: PermissionOverrides | null) =>
  o ? ((o.grants || []).reduce((s, p) => s + p.actions.length, 0) + (o.revokes || []).reduce((s, p) => s + p.actions.length, 0)) : 0;

const MembersTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // Bulk selection + assign
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRoleId, setBulkRoleId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Per-member override editor (drawer)
  const [ovMember, setOvMember] = useState<Member | null>(null);
  const [ovSet, setOvSet] = useState<Set<string>>(new Set());
  const [ovBaseline, setOvBaseline] = useState<Set<string>>(new Set());
  const [ovSaving, setOvSaving] = useState(false);
  const [ovHelp, setOvHelp] = useState<string | null>(null);
  const [ovCollapsed, setOvCollapsed] = useState<Record<string, boolean>>({});

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
      setSelected(new Set());
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

  // ─── Bulk selection ───
  const assignableMembers = filtered.filter(m => {
    const held = m.roles?.length ? m.roles : [m.role];
    return !held.some(isFullAccessRole); // full-access members have no assignable custom role
  });
  const toggleSelect = (uid: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const allSelected = assignableMembers.length > 0 && assignableMembers.every(m => selected.has(m.uid));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(assignableMembers.map(m => m.uid)));

  const handleBulkAssign = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const next = bulkRoleId || null;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(uid => apiAssignRole(uid, next)));
      setMembers(prev => prev.map(m => selected.has(m.uid) ? { ...m, roleId: next } : m));
      toast.success(`${t('team.bulkAssigned', 'Роль назначена')} · ${ids.length}`);
      setSelected(new Set());
      setBulkRoleId('');
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setBulkSaving(false); }
  };

  // ─── Per-member overrides ───
  const openOverrides = (member: Member) => {
    const customRole = member.roleId ? roles.find(r => r.id === member.roleId) || null : null;
    const baseline = resolvePermissionSet({ baseRole: member.role, customRole });
    const effective = applyOverrides(baseline, member.overrides || null);
    setOvMember(member);
    setOvBaseline(baseline);
    setOvSet(new Set(effective));
    setOvHelp(null);
    setOvCollapsed({});
  };
  const closeOverrides = () => { setOvMember(null); setOvHelp(null); };

  const ovHas = (r: string, a: RbacAction) => ovSet.has(`${r}:${a}`);
  const ovToggle = (r: string, a: RbacAction) =>
    setOvSet(prev => { const n = new Set(prev); const k = `${r}:${a}`; n.has(k) ? n.delete(k) : n.add(k); return n; });
  const ovToggleAll = (r: string, allowed: RbacAction[]) =>
    setOvSet(prev => {
      const n = new Set(prev);
      const isFull = allowed.every(a => n.has(`${r}:${a}`));
      allowed.forEach(a => { const k = `${r}:${a}`; isFull ? n.delete(k) : n.add(k); });
      return n;
    });

  const saveOverrides = async () => {
    if (!ovMember) return;
    const diff = diffOverrides(ovBaseline, ovSet);
    const hasAny = diff.grants.length > 0 || diff.revokes.length > 0;
    setOvSaving(true);
    try {
      await apiSetMemberOverrides(ovMember.uid, diff.grants, diff.revokes);
      setMembers(prev => prev.map(m => m.uid === ovMember.uid ? { ...m, overrides: hasAny ? diff : null } : m));
      toast.success(hasAny ? t('team.overridesSaved', 'Доступ настроен') : t('team.overridesCleared', 'Доступ сброшен к роли'));
      closeOverrides();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setOvSaving(false); }
  };

  const resetOverrides = () => setOvSet(new Set(ovBaseline));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;

  const ovDiffCount = ovMember ? overrideCount(diffOverrides(ovBaseline, ovSet)) : 0;

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

      {/* Bulk action bar */}
      {isAdmin && selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-500/30">
          <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
            {t('team.selectedCount', 'Выбрано')}: {selected.size}
          </span>
          <div className="flex items-center gap-2 sm:ml-auto">
            <select className="input text-sm !py-1.5" value={bulkRoleId} onChange={e => setBulkRoleId(e.target.value)}>
              <option value="">{t('team.defaultForRole', 'По умолчанию для роли')}</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={bulkSaving}
              className="btn-primary !py-1.5 text-sm inline-flex items-center gap-1.5 shrink-0">
              {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('team.assignToSelected', 'Назначить')}
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" title={t('common.cancel', 'Отмена')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <UsersIcon className="w-9 h-9 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">{t('team.noMembers', 'Сотрудники не найдены.')}</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
          {/* Select-all header */}
          {isAdmin && assignableMembers.length > 0 && (
            <label className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-primary-600 cursor-pointer" />
              {t('team.selectAll', 'Выбрать всех')}
            </label>
          )}
          {filtered.map(member => {
            const heldRoles = member.roles?.length ? member.roles : [member.role];
            const accent = roleAccent({ id: member.role, name: member.role });
            const full = heldRoles.some(isFullAccessRole);
            // Assigned fine-grained access role (RBAC) — shown as a badge so it reads
            // alongside the base roles, not just inside the edit dropdown.
            const rbacRole = !full ? roles.find(r => r.id === member.roleId) : undefined;
            const ovCount = overrideCount(member.overrides);
            return (
              <div key={member.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                {/* Select */}
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selected.has(member.uid)}
                    disabled={full}
                    onChange={() => toggleSelect(member.uid)}
                    className="w-4 h-4 rounded accent-primary-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 self-start sm:self-auto"
                    title={full ? t('team.fullAccessNoAssign', 'Полный доступ — роль не назначается') : ''}
                  />
                )}
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
                  {!full && ovCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 border border-amber-300 dark:border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10">
                      <SlidersHorizontal className="w-3 h-3" />{t('team.customAccess', 'особый доступ')}
                    </span>
                  )}
                </div>

                {/* Role assignment + overrides */}
                <div className="sm:w-64 shrink-0">
                  {full ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" /> {t('team.fullAccess', 'Полный доступ')}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        className="input text-sm !py-1.5 flex-1"
                        value={member.roleId || ''}
                        disabled={!isAdmin || savingUid === member.uid}
                        onChange={e => assign(member, e.target.value)}
                      >
                        <option value="">{t('team.defaultForRole', 'По умолчанию для роли')}</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {savingUid === member.uid && <Loader2 className="w-4 h-4 animate-spin text-primary-500 shrink-0" />}
                      {isAdmin && (
                        <button
                          onClick={() => openOverrides(member)}
                          title={t('team.tuneAccess', 'Тонкая настройка доступа')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </button>
                      )}
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

      {/* ─── Per-member override drawer ─── */}
      {ovMember && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeOverrides} />
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col animate-[slideIn_.2s_ease]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{t('team.tuneAccessFor', 'Настройка доступа')}: {ovMember.displayName}</h3>
                  <p className="text-[11px] text-slate-400">{t('team.overrideHint', 'Точечно расширьте или ограничьте доступ поверх роли.')}</p>
                </div>
              </div>
              <button onClick={closeOverrides} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-amber-400 inline-block" /> {t('team.changedFromRole', 'отличается от роли')}</span>
              {ovDiffCount > 0 && <span className="ml-auto font-semibold text-amber-600 dark:text-amber-400">{ovDiffCount} {t('team.changes', 'изменений')}</span>}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <PermissionGrid
                hasPerm={ovHas}
                togglePerm={ovToggle}
                toggleAll={ovToggleAll}
                viewOnly={false}
                openHelp={ovHelp}
                setOpenHelp={setOvHelp}
                collapsed={ovCollapsed}
                setCollapsed={setOvCollapsed}
                baselineHas={(r, a) => ovBaseline.has(`${r}:${a}`)}
              />
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={resetOverrides} disabled={ovDiffCount === 0} className="btn-ghost !py-2 text-sm text-slate-500 disabled:opacity-40">
                {t('team.resetToRole', 'Сбросить к роли')}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={closeOverrides} className="btn-secondary !py-2 text-sm">{t('common.cancel', 'Отмена')}</button>
                <button onClick={saveOverrides} disabled={ovSaving} className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5">
                  {ovSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('common.save', 'Сохранить')}
                </button>
              </div>
            </div>
          </div>
        </>
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
                    const selectedRole = createRoles.includes(r);
                    return (
                      <button key={r} type="button" onClick={() => toggleCreateRole(r)}
                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${selectedRole ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                        {selectedRole && <Check className="w-3.5 h-3.5" />}
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
