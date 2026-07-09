import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Briefcase, GraduationCap, BookOpen, UserCog, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types';

const ROLE_ICON: Record<string, React.ElementType> = {
  admin: Shield, manager: Briefcase, teacher: GraduationCap, student: BookOpen,
};

/**
 * Settings card that lets a multi-role member switch which role is currently
 * active. Renders nothing for single-role members, so it can be dropped into any
 * settings surface safely. Replaces the old sidebar RoleSwitcher — moved here so
 * it no longer crowds the sidebar. The backend validates every switch against the
 * roles the membership actually grants (anti-escalation).
 */
const ActiveRoleCard: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { role, availableRoles, switchRole } = useAuth();
  const [switching, setSwitching] = useState<UserRole | null>(null);

  // Only multi-role members get the switcher.
  if (!availableRoles || availableRoles.length < 2) return null;

  const roleLabels: Record<string, string> = {
    admin: t('membership.admin', 'Директор'),
    manager: t('membership.manager', 'Менеджер'),
    teacher: t('membership.teacher', 'Преподаватель'),
    student: t('membership.student', 'Студент'),
  };

  const handleSwitch = async (next: UserRole) => {
    if (next === role || switching) return;
    setSwitching(next);
    try {
      await switchRole(next);
      // Full reload so route guards, sidebar and data contexts re-derive from the new role.
      window.location.reload();
    } catch (e) {
      console.error('Switch role failed:', e);
      setSwitching(null);
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <UserCog className="w-4 h-4 text-teal-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('role.activeRole', 'Активная роль')}</h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t('role.switchHint', 'У вас несколько ролей в этой организации. Выберите, в какой работать — интерфейс переключится сразу.')}
      </p>
      <div className="flex gap-2 flex-wrap">
        {availableRoles.map((r) => {
          const Icon = ROLE_ICON[r] || UserCog;
          const isActive = r === role;
          const isLoading = switching === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => handleSwitch(r)}
              disabled={!!switching}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                isActive
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              } disabled:opacity-60`}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
              {roleLabels[r] || r}
              {isActive && !isLoading && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveRoleCard;
