import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check, Shield, Briefcase, GraduationCap, BookOpen, Loader2, UserCog } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types';

interface RoleSwitcherProps {
  onClose?: () => void;
  isCollapsed?: boolean;
}

const ROLE_ICON: Record<string, React.ElementType> = {
  admin: Shield,
  manager: Briefcase,
  teacher: GraduationCap,
  student: BookOpen,
};

/**
 * Lets a member who holds more than one role in the active org switch which
 * role is currently active. Hidden entirely for single-role users. The backend
 * validates every switch against the roles the membership actually grants.
 */
const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ onClose, isCollapsed }) => {
  const { t } = useTranslation();
  const { role, availableRoles, switchRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Only multi-role members get a switcher.
  if (!availableRoles || availableRoles.length < 2) return null;

  const roleLabels: Record<string, string> = {
    admin: t('membership.admin', 'Директор'),
    manager: t('membership.manager', 'Менеджер'),
    teacher: t('membership.teacher', 'Преподаватель'),
    student: t('membership.student', 'Студент'),
  };

  const handleSwitch = async (next: UserRole) => {
    if (next === role) { setOpen(false); return; }
    setSwitching(true);
    try {
      await switchRole(next);
      setOpen(false);
      onClose?.();
      window.location.reload();
    } catch (e) {
      console.error('Switch role failed:', e);
    } finally {
      setSwitching(false);
    }
  };

  const CurrentIcon = ROLE_ICON[role || ''] || UserCog;

  return (
    <div className={`relative px-3 pb-2 ${isCollapsed ? 'lg:flex lg:justify-center lg:px-0' : ''}`}>
      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className={`group flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/[0.08] transition w-full gap-2.5 px-3 py-2 text-left ${isCollapsed ? 'lg:w-10 lg:h-10 lg:mx-auto lg:p-0' : ''}`}
        title={isCollapsed ? (roleLabels[role || ''] || role || '') : undefined}
      >
        <div className="rounded-lg flex items-center justify-center shrink-0 w-8 h-8 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 dark:from-teal-500/30 dark:to-emerald-500/30 ring-1 ring-slate-200 dark:ring-white/10">
          {switching
            ? <Loader2 className="w-4 h-4 text-teal-600 dark:text-teal-300 animate-spin" />
            : <CurrentIcon className="w-4 h-4 text-teal-600 dark:text-teal-300" />}
        </div>
        <div className={`flex items-center gap-2.5 flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider leading-none mb-0.5">
              {t('role.activeRole', 'Активная роль')}
            </p>
            <p className="text-[13px] text-slate-900 dark:text-white truncate font-semibold leading-tight">
              {roleLabels[role || ''] || role}
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 overflow-hidden bg-white dark:bg-[#151f2e] border border-slate-200 dark:border-slate-600/30 rounded-2xl shadow-2xl ${isCollapsed ? 'lg:left-[76px] lg:-top-2 lg:w-[220px] left-3 right-3 top-full mt-1' : 'left-3 right-3 top-full mt-1'}`}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">
              {t('role.switchRole', 'Переключить роль')}
            </p>
            <div className="py-1">
              {availableRoles.map((r) => {
                const Icon = ROLE_ICON[r] || UserCog;
                const isActive = r === role;
                return (
                  <button
                    key={r}
                    onClick={() => handleSwitch(r)}
                    disabled={switching}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 transition"
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-teal-500/20 text-teal-700 ring-1 ring-teal-400/30 dark:bg-teal-500/30 dark:text-teal-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className={`text-xs flex-1 truncate ${isActive ? 'text-slate-900 font-semibold dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                      {roleLabels[r] || r}
                    </span>
                    {isActive && <Check className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RoleSwitcher;
