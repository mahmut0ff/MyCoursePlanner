import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiGetMemberRoles, apiSetMemberRoles, apiGetRoles, apiAssignRole } from '../../lib/api';
import type { OrgRole } from '../../lib/rbac';
import RolePicker, { withCustomBase, withoutCustomBase } from './RolePicker';

interface MemberRolesEditorProps {
  uid: string;
  orgId: string;
  organizationName?: string;
  /** Called after a successful save with the new role set. */
  onSaved?: (roles: string[]) => void;
  className?: string;
}

/**
 * Reusable editor letting an org admin grant one OR several roles to a member:
 * the system roles plus the org's own roles from «Роли и доступы». When more than
 * one app role is granted, the member gets a role switcher in Settings → «Активная роль».
 * Backed by the multi-role membership API and the RBAC assign API, which validate
 * the set and enforce admin/owner-only writes server-side.
 */
const MemberRolesEditor: React.FC<MemberRolesEditorProps> = ({ uid, orgId, organizationName, onSaved, className }) => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<string[]>([]);
  const [roleId, setRoleId] = useState('');
  const [initial, setInitial] = useState<{ roles: string[]; roleId: string }>({ roles: [], roleId: '' });
  const [orgRoles, setOrgRoles] = useState<OrgRole[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    if (!uid || !orgId) { setRoles([]); setRoleId(''); setInitial({ roles: [], roleId: '' }); setLoaded(true); return; }
    Promise.all([apiGetMemberRoles(uid, orgId), apiGetRoles().catch(() => ({ items: [] }))])
      .then(([m, r]) => {
        if (!alive) return;
        const items: OrgRole[] = r.items || [];
        const id = m.roleId || '';
        const rs = withoutCustomBase(m.roles || [], items.find((x) => x.id === id));
        setOrgRoles(items); setHeld(m.roles || []);
        setRoles(rs); setRoleId(id); setInitial({ roles: rs, roleId: id });
      })
      .catch(() => { if (alive) { setRoles([]); setRoleId(''); setInitial({ roles: [], roleId: '' }); } })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [uid, orgId]);

  const empty = roles.length === 0 && !roleId;
  const dirty = roleId !== initial.roleId || roles.length !== initial.roles.length || roles.some((r) => !initial.roles.includes(r));

  const save = async () => {
    const next = withCustomBase(roles, orgRoles.find((r) => r.id === roleId));
    if (next.length === 0) return;
    setSaving(true);
    try {
      await apiSetMemberRoles(uid, orgId, next);
      if (roleId !== initial.roleId) await apiAssignRole(uid, roleId || null);
      setInitial({ roles, roleId });
      toast.success(t('memberRoles.saved', 'Роли обновлены'));
      onSaved?.(next);
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setSaving(false); }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-4 h-4 text-teal-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t('memberRoles.title', 'Роли в организации')}
        </h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t('memberRoles.hint', 'Выберите одну или несколько ролей. При нескольких — участник сможет переключаться между ними в настройках.')}
        {organizationName ? ` (${organizationName})` : ''}
      </p>

      {!loaded ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : (
        <>
          <div className="mb-3">
            <RolePicker roles={roles} roleId={roleId} orgRoles={orgRoles} extraRoles={held}
              onChange={(r, id) => { setRoles(r); setRoleId(id); }} />
          </div>
          <button
            onClick={save}
            disabled={saving || empty || !dirty}
            className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('common.save', 'Сохранить')}
          </button>
          {empty && (
            <p className="text-[11px] text-amber-500 mt-2">{t('memberRoles.pickOne', 'Выберите хотя бы одну роль.')}</p>
          )}
        </>
      )}
    </div>
  );
};

export default MemberRolesEditor;
