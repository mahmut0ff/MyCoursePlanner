import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebarPrefs } from '../../lib/sidebarPrefs';
import { signOut } from '../../services/auth.service';
import { useNavModel } from './navModel';

import BranchSwitcher from './BranchSwitcher';
import TelegramNotifyButton from '../telegram/TelegramNotifyButton';
import SidebarTips from './SidebarTips';
import {
  Settings, ChevronsLeft, LogOut, Lock,
} from 'lucide-react';

/* ─── Spacing between uncaptioned groups ─── */
const Divider = () => <div className="h-3" aria-hidden="true" />;

/* ─── Group caption (collapses to a rule on a folded desktop sidebar) ─── */
const SectionLabel: React.FC<{ label: string; isCollapsed?: boolean }> = ({ label, isCollapsed }) => (
  <>
    {isCollapsed && <div className="hidden lg:block my-2 mx-2 border-t border-slate-200 dark:border-slate-700" />}
    <p className={`px-2 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 select-none ${isCollapsed ? 'lg:hidden' : ''}`}>
      {label}
    </p>
  </>
);

/* Square ghost button for the footer actions */
const iconBtn = 'w-8 h-8 lg:w-7 lg:h-7 flex items-center justify-center shrink-0 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/50 transition-colors';

/* ─── Single navigation entry. Owns the active state, tooltip and lock state. ─── */
const NavItem: React.FC<{
  to: string;
  icon: React.ElementType;
  label: string;
  isCollapsed?: boolean;
  onClose: () => void;
  end?: boolean;
  locked?: boolean;
  /** Счётчик справа от пункта (непрочитанные чаты). 0 не рисуем. */
  badge?: number;
}> = ({ to, icon: Icon, label, isCollapsed, onClose, end, locked, badge }) => {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-2 w-full h-9 lg:h-7 px-2 rounded-md text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
      isActive
        ? 'bg-slate-200/70 text-slate-900 font-medium dark:bg-slate-700/80 dark:text-slate-100'
        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-slate-100'
    } ${locked ? 'opacity-50' : ''} ${isCollapsed ? 'lg:justify-center lg:px-0 lg:h-8' : ''}`;

  return (
    <NavLink to={to} end={end} onClick={onClose} title={label} className={cls}>
      {({ isActive }) => (
        <>
          <Icon className={`w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0 ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'}`} />
          <span className={`flex-1 truncate ${isCollapsed ? 'lg:hidden' : ''}`}>{label}</span>
          {!!badge && badge > 0 && (
            // В свёрнутом меню подписи нет, поэтому счётчик садится точкой на иконку —
            // иначе он уехал бы за границу узкой колонки.
            <span className={`shrink-0 min-w-[18px] h-[18px] px-1 rounded bg-primary-600 text-white
              text-[11px] font-medium tabular-nums flex items-center justify-center ${isCollapsed
              ? 'lg:absolute lg:top-1 lg:right-2 lg:min-w-0 lg:w-2 lg:h-2 lg:p-0 lg:text-[0px] lg:rounded-full'
              : ''}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {locked && <Lock aria-hidden="true" className={`w-3 h-3 shrink-0 text-slate-400 dark:text-slate-500 ${isCollapsed ? 'lg:hidden' : ''}`} />}
        </>
      )}
    </NavLink>
  );
};

const Sidebar: React.FC<{ open: boolean; onClose: () => void; isCollapsed?: boolean; onToggleCollapse?: () => void; orgData?: any }> = ({ open, onClose, isCollapsed, onToggleCollapse, orgData }) => {
  const { t } = useTranslation();
  const { profile, role, isSuperAdmin, isTeacher, membershipRole } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const goProfile = () => {
    // Профиль и настройки — один экран для всех ролей (/teacher-settings слит с ним).
    navigate('/profile');
    if (window.innerWidth < 1024) onClose();
  };

  const isAdmin = role === 'admin';

  // The menu is data (navModel) minus whatever this person chose to hide. Hiding
  // is cosmetic — RBAC still owns access, the routes stay reachable.
  const sections = useNavModel(orgData?.institutionType);
  const { isHidden } = useSidebarPrefs(profile?.uid);
  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !isHidden(it.id)) }))
    .filter((s) => s.items.length > 0);

  // Localized label for the ACTIVE role — matches the org switcher and role switcher.
  // Uses the assigned custom RBAC role's own name when the active role is its base.
  const roleLabels: Record<string, string> = {
    owner: t('membership.owner', 'Владелец'),
    admin: t('membership.admin', 'Директор'),
    manager: t('membership.manager', 'Менеджер'),
    teacher: t('membership.teacher', 'Преподаватель'),
    student: t('membership.student', 'Студент'),
    super_admin: t('app.superAdmin', 'Супер админ'),
  };
  const BASE_TO_APP: Record<string, string> = { owner: 'admin', admin: 'admin', manager: 'manager', teacher: 'teacher', mentor: 'teacher', student: 'student' };
  const activeRoleLabel = (membershipRole && BASE_TO_APP[membershipRole.baseRole] === role)
    ? membershipRole.name
    : (roleLabels[role || ''] || role || '');

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside role="navigation" aria-label={t('nav.mainNavigation', 'Основная навигация')} className={`fixed top-0 left-0 bottom-0 w-64 ${isCollapsed ? 'lg:w-14' : 'lg:w-[220px]'} bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-40 transform transition-[width,transform] duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`} style={{ paddingTop: 'var(--safe-area-top)' }}>

        {/* ═══ Header ═══ */}
        {/* h-11 matches the Topbar so the two rows line up across the fold. */}
        <div className={`flex items-center gap-2 h-11 px-3 shrink-0 ${isCollapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <img src={orgData?.logo || orgData?.branding?.logoUrl || "/icons/logo.png"} alt={orgData?.name || "SabakHub"} className={`h-6 w-auto max-w-[80px] object-contain rounded-md shrink-0 ${isCollapsed ? 'lg:max-w-[32px]' : ''}`} />
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <span className="block truncate text-[13px] font-semibold leading-4 text-slate-900 dark:text-slate-100">{orgData?.name && orgData.name !== 'New Organization' ? orgData.name : t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[10px] leading-3 font-medium text-primary-600 dark:text-primary-400">{t('app.superAdmin')}</p>
            )}
          </div>
        </div>

        {/* ═══ Branch Switcher ═══ */}
        {/* Replaces the old org switcher for every role. Scoping is global: pages
            read the selection from BranchContext instead of each carrying a filter. */}
        {!isSuperAdmin && <BranchSwitcher onClose={onClose} isCollapsed={isCollapsed} />}

        {/* Role switching for multi-role members now lives in Settings → «Активная роль» (ActiveRoleCard). */}

        {/* ═══ Navigation ═══ */}
        <nav className="flex-1 px-2 pt-1 pb-2 space-y-px overflow-y-auto">
          {visibleSections.map((section, i) => (
            <React.Fragment key={section.id}>
              {/* Captioned groups get their label; the ungrouped trailing ones (join a
                  test, achievements, catalog) are set apart by a gap. */}
              {section.label
                ? <SectionLabel label={section.label} isCollapsed={isCollapsed} />
                : i > 0 && <Divider />}
              {section.items.map((item) => (
                <NavItem
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  icon={item.icon}
                  label={item.label}
                  locked={item.locked}
                  badge={item.badge}
                  isCollapsed={isCollapsed}
                  onClose={onClose}
                />
              ))}
            </React.Fragment>
          ))}
        </nav>

        {/* ═══ Tips ═══ */}
        <div className="mt-auto">
          <SidebarTips isCollapsed={isCollapsed} />
        </div>

        {/* ═══ Footer ═══ */}
        <div className={`border-t border-slate-200 dark:border-slate-700 p-2 space-y-1 ${isCollapsed ? 'lg:px-1.5' : ''}`} style={{ paddingBottom: 'max(0.5rem, var(--safe-area-bottom))' }}>
          {/* Telegram CTA */}
          {!isSuperAdmin && <TelegramNotifyButton isCollapsed={isCollapsed} onClose={onClose} />}

          <div className={`flex items-center gap-0.5 ${isCollapsed ? 'lg:flex-col lg:gap-1' : ''}`}>
            <button
              type="button"
              onClick={goProfile}
              className={`flex items-center gap-2 flex-1 min-w-0 h-10 lg:h-9 px-1.5 rounded-md text-left outline-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40 ${isCollapsed ? 'lg:flex-none lg:justify-center lg:px-0 lg:w-9' : ''}`}
              title={t('nav.profile')}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 aspect-square" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-semibold uppercase shrink-0 aspect-square">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className={`min-w-0 flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-[13px] font-medium leading-4 text-slate-900 dark:text-slate-100 truncate">{profile?.displayName}</p>
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400 truncate">{activeRoleLabel}</p>
              </div>
            </button>
            {isSuperAdmin && (
              <NavLink to="/admin/settings" className={iconBtn} title={t('nav.settings')}>
                <Settings className="w-3.5 h-3.5" />
              </NavLink>
            )}
            {isAdmin && !isSuperAdmin && (
              <NavLink to="/org-settings" className={iconBtn} title={t('nav.settings')}>
                <Settings className="w-3.5 h-3.5" />
              </NavLink>
            )}
            {isTeacher && !isSuperAdmin && (
              <NavLink to="/profile" className={iconBtn} title={t('nav.settings')}>
                <Settings className="w-3.5 h-3.5" />
              </NavLink>
            )}
            <button
              onClick={handleSignOut}
              className={`${iconBtn} hover:!text-red-600 dark:hover:!text-red-400`}
              title={t('app.signOut')}
              aria-label={t('app.signOut')}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ═══ Collapse (desktop only) ═══ */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? t('nav.expandSidebar', 'Развернуть меню') : t('nav.collapseSidebar', 'Свернуть меню')}
            title={isCollapsed ? t('nav.expandSidebar', 'Развернуть меню') : undefined}
            className={`hidden lg:flex items-center gap-2 h-9 shrink-0 px-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 ${isCollapsed ? 'justify-center px-0' : ''}`}
          >
            <ChevronsLeft className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} />
            {!isCollapsed && <span className="truncate">{t('nav.collapseSidebar', 'Свернуть меню')}</span>}
          </button>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
