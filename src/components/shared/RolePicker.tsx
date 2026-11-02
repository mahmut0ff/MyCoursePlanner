import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ShieldCheck } from 'lucide-react';
import type { OrgRole } from '../../lib/rbac';

// The system roles shown in «Роли и доступы»; the org's own roles are listed after them.
const STAFF_ROLES = ['admin', 'manager', 'teacher'];

/** Base roles to store: a custom role sits on its base role (server default 'manager', as apiAssignRole adds). */
export const withCustomBase = (roles: string[], custom?: OrgRole) =>
  custom ? [...new Set([...roles, custom.baseRole || 'manager'])] : roles;

/** Inverse of withCustomBase for display: the custom role stands in for its base role. */
export const withoutCustomBase = (roles: string[], custom?: OrgRole) =>
  custom ? roles.filter((r) => r !== (custom.baseRole || 'manager')) : roles;

interface RolePickerProps {
  roles: string[];
  /** Selected custom role id, '' for none. */
  roleId: string;
  orgRoles: OrgRole[];
  /** Held roles outside the staff list (e.g. student), kept toggleable. */
  extraRoles?: string[];
  onChange: (roles: string[], roleId: string) => void;
}

const RolePicker: React.FC<RolePickerProps> = ({ roles, roleId, orgRoles, extraRoles = [], onChange }) => {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    admin: t('team.sys.admin', 'Администратор'),
    manager: t('team.sys.manager', 'Менеджер (по умолчанию)'),
    teacher: t('team.sys.teacher', 'Преподаватель'),
    student: t('roles.student', 'Студент'),
  };

  // A custom role replaces the manager defaults and is moot under full access,
  // so it excludes admin/manager; teacher (and student) combine with it.
  const toggle = (r: string) => {
    const on = !roles.includes(r);
    onChange(on ? [...roles, r] : roles.filter((x) => x !== r), on && (r === 'admin' || r === 'manager') ? '' : roleId);
  };
  const pick = (id: string) => {
    const on = roleId !== id;
    onChange(on ? roles.filter((r) => r !== 'admin' && r !== 'manager') : roles, on ? id : '');
  };

  const chip = (key: string, on: boolean, onClick: () => void, label: string, icon?: React.ReactNode) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick}
      className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${on ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
      {on ? <Check className="w-3.5 h-3.5" /> : icon}
      {label}
    </button>
  );

  return (
    <div className="flex gap-2 flex-wrap">
      {[...STAFF_ROLES, ...extraRoles.filter((r) => !STAFF_ROLES.includes(r))].map((r) =>
        chip(r, roles.includes(r), () => toggle(r), labels[r] || t(`roles.${r}`, r)))}
      {orgRoles.map((r) => chip(r.id, roleId === r.id, () => pick(r.id), r.name, <ShieldCheck className="w-3.5 h-3.5" />))}
    </div>
  );
};

export default RolePicker;
