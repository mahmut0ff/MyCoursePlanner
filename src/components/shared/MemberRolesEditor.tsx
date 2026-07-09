import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Check, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiGetMemberRoles, apiSetMemberRoles } from '../../lib/api';

// App-level roles an admin can grant within an organization (multi-role membership).
const ASSIGNABLE_ROLES = ['admin', 'manager', 'teacher', 'student'] as const;

interface MemberRolesEditorProps {
  uid: string;
  orgId: string;
  organizationName?: string;
  /** Called after a successful save with the new role set. */
  onSaved?: (roles: string[]) => void;
  className?: string;
}

/**
 * Reusable editor letting an org admin grant one OR several app-level roles to a
 * member. When more than one role is granted, the member gets a role switcher in
 * Settings → «Активная роль». Backed by the multi-role membership API, which
 * validates the set and enforces admin/owner-only writes server-side.
 */
const MemberRolesEditor: React.FC<MemberRolesEditorProps> = ({ uid, orgId, organizationName, onSaved, className }) => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const roleLabels: Record<string, string> = {
    admin: t('membership.admin', 'Директор'),
    manager: t('membership.manager', 'Менеджер'),
    teacher: t('membership.teacher', 'Преподаватель'),
    student: t('membership.student', 'Студент'),
  };

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    if (!uid || !orgId) { setRoles([]); setInitial([]); setLoaded(true); return; }
    apiGetMemberRoles(uid, orgId)
      .then((r) => { if (!alive) return; const rs = r.roles || []; setRoles(rs); setInitial(rs); })
      .catch(() => { if (alive) { setRoles([]); setInitial([]); } })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [uid, orgId]);

  const toggle = (r: string) =>
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const dirty = roles.length !== initial.length || roles.some((r) => !initial.includes(r));

  const save = async () => {
    if (roles.length === 0) return;
    setSaving(true);
    try {
      await apiSetMemberRoles(uid, orgId, roles);
      setInitial(roles);
      toast.success(t('memberRoles.saved', 'Роли обновлены'));
      onSaved?.(roles);
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
          <div className="flex gap-2 flex-wrap mb-3">
            {ASSIGNABLE_ROLES.map((r) => {
              const selected = roles.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                    selected
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {selected && <Check className="w-3.5 h-3.5" />}
                  {roleLabels[r] || r}
                </button>
              );
            })}
          </div>
          <button
            onClick={save}
            disabled={saving || roles.length === 0 || !dirty}
            className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('common.save', 'Сохранить')}
          </button>
          {roles.length === 0 && (
            <p className="text-[11px] text-amber-500 mt-2">{t('memberRoles.pickOne', 'Выберите хотя бы одну роль.')}</p>
          )}
        </>
      )}
    </div>
  );
};

export default MemberRolesEditor;
