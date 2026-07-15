import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Shield, ShieldCheck, Plus, X, Save, Trash2, Edit2,
  Loader2, Lock, Copy, Users,
} from 'lucide-react';
import { apiGetRoles, apiCreateRole, apiUpdateRole, apiDeleteRole, apiGetTeamMembers } from '../../lib/api';
import {
  RESOURCE_GROUPS, RBAC_ACTIONS,
  countPermissions, roleAccent, fullPermissionSet,
  MANAGER_DEFAULT, TEACHER_DEFAULT,
  type OrgRole, type RolePermission, type RbacAction,
} from '../../lib/rbac';
import PermissionGrid from './PermissionGrid';

// Synthetic, read-only reference roles derived from the base-role defaults.
const SYSTEM_ROLES: (OrgRole & { full?: boolean })[] = [
  { id: '__admin', name: 'Администратор', description: 'Полный доступ ко всем модулям организации', isSystem: true, full: true, permissions: [] },
  { id: '__manager', name: 'Менеджер (по умолчанию)', description: 'Операционный доступ без финансов и настроек', isSystem: true, permissions: MANAGER_DEFAULT },
  { id: '__teacher', name: 'Преподаватель', description: 'Уроки, экзамены, оценки и журнал', isSystem: true, permissions: TEACHER_DEFAULT },
];

const FULL_COUNT = fullPermissionSet().size;

const RoleMatrix: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Drawer / editor state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<(OrgRole & { full?: boolean }) | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; permissions: RolePermission[] }>({ name: '', description: '', permissions: [] });
  const [saving, setSaving] = useState(false);
  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const [res, members] = await Promise.all([apiGetRoles(), apiGetTeamMembers().catch(() => ({ items: [] }))]);
      setRoles(res.items || []);
      // Tally how many staff hold each custom role, to show usage on the cards.
      const tally: Record<string, number> = {};
      (members.items || []).forEach((m: any) => { if (m.roleId) tally[m.roleId] = (tally[m.roleId] || 0) + 1; });
      setCounts(tally);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRoles(); }, []);

  const openCreate = () => {
    setEditing(null);
    setViewOnly(false);
    setForm({ name: '', description: '', permissions: [] });
    setOpen(true);
  };

  const openRole = (role: OrgRole & { full?: boolean }) => {
    setEditing(role);
    setViewOnly(!!role.isSystem || !isAdmin);
    const perms = role.full
      ? RESOURCE_GROUPS.flatMap(g => g.resources.map(r => ({ resource: r.id, actions: (r.actions ?? RBAC_ACTIONS) as RbacAction[] })))
      : (role.permissions || []).map(p => ({ resource: p.resource, actions: [...p.actions] }));
    setForm({ name: role.name, description: role.description || '', permissions: perms });
    setOpen(true);
  };

  // Clone any role (system or custom) into a fresh, editable draft.
  const duplicateRole = (role: OrgRole & { full?: boolean }) => {
    setEditing(null);
    setViewOnly(false);
    const perms = role.full
      ? RESOURCE_GROUPS.flatMap(g => g.resources.map(r => ({ resource: r.id, actions: (r.actions ?? RBAC_ACTIONS) as RbacAction[] })))
      : (role.permissions || []).map(p => ({ resource: p.resource, actions: [...p.actions] }));
    setForm({ name: `${role.name} ${t('team.copySuffix', '(копия)')}`, description: role.description || '', permissions: perms });
    setOpen(true);
  };

  const close = () => { setOpen(false); setEditing(null); setOpenHelp(null); };

  const hasPerm = (resource: string, action: RbacAction) =>
    form.permissions.find(p => p.resource === resource)?.actions.includes(action) || false;

  const togglePerm = (resource: string, action: RbacAction) => {
    if (viewOnly) return;
    setForm(prev => {
      const perms = prev.permissions.map(p => ({ ...p, actions: [...p.actions] }));
      const idx = perms.findIndex(p => p.resource === resource);
      if (idx === -1) {
        perms.push({ resource, actions: [action] });
      } else if (perms[idx].actions.includes(action)) {
        perms[idx].actions = perms[idx].actions.filter(a => a !== action);
        if (perms[idx].actions.length === 0) perms.splice(idx, 1);
      } else {
        perms[idx].actions.push(action);
      }
      return { ...prev, permissions: perms };
    });
  };

  const toggleAll = (resource: string, allowed: RbacAction[]) => {
    if (viewOnly) return;
    setForm(prev => {
      const perms = prev.permissions.filter(p => p.resource !== resource);
      const current = prev.permissions.find(p => p.resource === resource);
      const isFull = current && allowed.every(a => current.actions.includes(a));
      if (!isFull) perms.push({ resource, actions: [...allowed] });
      return { ...prev, permissions: perms };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('team.nameRequired', 'Укажите название роли')); return; }
    setSaving(true);
    try {
      if (editing && !editing.isSystem) {
        await apiUpdateRole(editing.id, { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        toast.success(t('team.roleSaved', 'Роль обновлена'));
      } else {
        await apiCreateRole({ name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        toast.success(t('team.roleCreated', 'Роль создана'));
      }
      close();
      fetchRoles();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setSaving(false); }
  };

  const handleDelete = async (role: OrgRole) => {
    if (!window.confirm(t('team.deleteConfirm', `Удалить роль «${role.name}»? Сотрудников нужно будет переназначить.`))) return;
    try {
      await apiDeleteRole(role.id);
      toast.success(t('team.roleDeleted', 'Роль удалена'));
      fetchRoles();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    }
  };

  return (
    <div className="space-y-6">
      {/* System roles */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t('team.systemRoles', 'Системные роли')}</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SYSTEM_ROLES.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              count={role.full ? FULL_COUNT : countPermissions(role)}
              full={role.full}
              onClick={() => openRole(role)}
              onDuplicate={isAdmin ? () => duplicateRole(role) : undefined}
            />
          ))}
        </div>
      </section>

      {/* Custom roles */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('team.customRoles', 'Свои роли')}</h3>
          {isAdmin && (
            <button onClick={openCreate} className="btn-primary !py-2 !px-3.5 text-sm inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> {t('team.addRole', 'Создать роль')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
        ) : roles.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <Shield className="w-9 h-9 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">{t('team.noRoles', 'Пока нет своих ролей. Создайте первую, чтобы тонко настроить доступы.')}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                count={countPermissions(role)}
                memberCount={counts[role.id] || 0}
                onClick={() => openRole(role)}
                onDelete={isAdmin ? () => handleDelete(role) : undefined}
                onDuplicate={isAdmin ? () => duplicateRole(role) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* Editor drawer */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={close} />
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col animate-[slideIn_.2s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${roleAccent(editing || { id: form.name, name: form.name })}1a` }}>
                  <Shield className="w-4 h-4" style={{ color: roleAccent(editing || { id: form.name, name: form.name }) }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {viewOnly ? (editing?.name || t('team.viewRole', 'Просмотр роли')) : editing ? t('team.editRole', 'Изменить роль') : t('team.newRole', 'Новая роль')}
                  </h3>
                  {viewOnly && <p className="text-[11px] text-slate-400">{t('team.readOnly', 'Только просмотр')}</p>}
                </div>
              </div>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Name + description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">{t('team.roleName', 'Название')} <span className="text-red-500">*</span></label>
                  <input className="input text-sm" value={form.name} disabled={viewOnly}
                    onChange={e => setForm({ ...form, name: e.target.value })} placeholder="напр. Администратор ресепшн" />
                </div>
                <div>
                  <label className="label text-xs">{t('team.roleDesc', 'Описание')}</label>
                  <input className="input text-sm" value={form.description} disabled={viewOnly}
                    onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('team.roleDescPh', 'Что может эта роль?')} />
                </div>
              </div>

              {editing?.full ? (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/15 p-6 text-center">
                  <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{t('team.fullAccess', 'Полный доступ')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('team.fullAccessDesc', 'Администратор имеет неограниченный доступ. Права изменить нельзя.')}</p>
                </div>
              ) : (
                <PermissionGrid
                  hasPerm={hasPerm}
                  togglePerm={togglePerm}
                  toggleAll={toggleAll}
                  viewOnly={viewOnly}
                  openHelp={openHelp}
                  setOpenHelp={setOpenHelp}
                  collapsed={collapsed}
                  setCollapsed={setCollapsed}
                />
              )}
            </div>

            {/* Footer */}
            {!viewOnly && (
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700">
                <button onClick={close} className="btn-secondary !py-2 text-sm">{t('common.cancel', 'Отмена')}</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('common.save', 'Сохранить')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Role card ───
const RoleCard: React.FC<{
  role: OrgRole & { full?: boolean };
  count: number;
  full?: boolean;
  memberCount?: number;
  onClick: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}> = ({ role, count, full, memberCount, onClick, onDelete, onDuplicate }) => {
  const { t } = useTranslation();
  const accent = roleAccent(role);
  return (
    <button onClick={onClick} className="card text-left p-4 group relative hover:border-primary-400 dark:hover:border-primary-500/60 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}1a` }}>
          <Shield className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{role.name}</span>
            {role.isSystem && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
          </div>
          {role.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{role.description}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 min-w-0">
          {full ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('team.fullAccess', 'Полный доступ')}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500"><strong className="text-slate-700 dark:text-slate-300">{count}</strong> {t('team.permissions', 'прав')}</span>
          )}
          {memberCount !== undefined && memberCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-2">
              <Users className="w-3 h-3" /> {memberCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onDuplicate && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDuplicate(); } }}
              title={t('team.duplicate', 'Дублировать')}
              className="p-1 rounded-md text-slate-300 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </span>
          )}
          {onDelete && !role.isSystem && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDelete(); } }}
              title={t('common.delete', 'Удалить')}
              className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </span>
          )}
          {!onDelete && !onDuplicate && !full && <Edit2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />}
        </div>
      </div>
    </button>
  );
};

export default RoleMatrix;
