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
  Settings, ChevronDown, LogOut, Lock,
} from 'lucide-react';

/* ─── Thin divider between groups ─── */
const Divider = () => <div className="my-2 mx-3 border-t border-slate-200 dark:border-white/[0.06]" />;

/* ─── Group caption (collapses to a divider on a folded desktop sidebar) ─── */
const SectionLabel: React.FC<{ label: string; isCollapsed?: boolean }> = ({ label, isCollapsed }) => (
  <>
    {isCollapsed && <div className="hidden lg:block my-2 mx-3 border-t border-slate-200 dark:border-white/[0.06]" />}
    <p className={`px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500/80 select-none ${isCollapsed ? 'lg:hidden' : ''}`}>
      {label}
    </p>
  </>
);

/* ─── Single navigation entry. Owns the active accent bar, tooltip and lock state. ─── */
const NavItem: React.FC<{
  to: string;
  icon: React.ElementType;
  label: string;
  isCollapsed?: boolean;
  onClose: () => void;
  end?: boolean;
  locked?: boolean;
}> = ({ to, icon: Icon, label, isCollapsed, onClose, end, locked }) => {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center py-2 rounded-lg text-[13px] font-medium transition-all duration-150 relative group outline-none ${
      isActive ? 'bg-primary-50 text-primary-700 dark:bg-white/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
    } ${locked ? 'opacity-50' : ''} ${
      isCollapsed
        ? 'gap-3 px-3 w-full lg:justify-center lg:px-0 lg:w-12 lg:mx-auto lg:gap-0 [&>span.label]:block [&>span.label]:truncate lg:[&>span.label]:hidden'
        : 'gap-3 px-3 w-full [&>span.label]:block [&>span.label]:truncate'
    }`;

  return (
    <NavLink to={to} end={end} onClick={onClose} title={label} className={cls}>
      {({ isActive }) => (
        <>
          {/* Active accent bar */}
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-500 transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          />
          <Icon className="w-4 h-4 shrink-0" />
          <span className="label">{label}</span>
          {locked && <Lock aria-hidden="true" className={`w-3 h-3 ml-auto text-slate-400 dark:text-slate-500 ${isCollapsed ? 'lg:hidden' : ''}`} />}
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
    navigate(role === 'teacher' ? '/teacher-profile' : '/profile');
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
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside role="navigation" aria-label={t('nav.mainNavigation', 'Main navigation')} className={`fixed top-0 left-0 bottom-0 w-60 ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'} bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-700/50 z-40 transform transition-[width,transform] duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`} style={{ paddingTop: 'var(--safe-area-top)' }}>

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200 dark:border-white/5 h-[69px]">
          <img src={orgData?.logo || orgData?.branding?.logoUrl || "/icons/logo.png"} alt={orgData?.name || "SabakHub"} className="h-9 w-auto object-contain shrink-0" />
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <span className="font-bold text-[15px] text-slate-900 dark:text-white leading-none tracking-tight truncate block">{orgData?.name && orgData.name !== 'New Organization' ? orgData.name : t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[9px] text-primary-600 dark:text-primary-400 font-semibold tracking-wide mt-0.5">{t('app.superAdmin')}</p>
            )}
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/10 hidden lg:flex items-center justify-center transition-colors absolute -right-3 top-5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700/50 shadow-lg z-50 rounded-full"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          )}
        </div>

        {/* ═══ Branch Switcher ═══ */}
        {/* Replaces the old org switcher for every role. Scoping is global: pages
            read the selection from BranchContext instead of each carrying a filter. */}
        {!isSuperAdmin && <BranchSwitcher onClose={onClose} isCollapsed={isCollapsed} />}

        {/* Role switching for multi-role members now lives in Settings → «Активная роль» (ActiveRoleCard). */}

        {/* ═══ Navigation ═══ */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          {visibleSections.map((section, i) => (
            <React.Fragment key={section.id}>
              {/* Captioned groups get their label; the ungrouped trailing ones (join a
                  test, achievements, catalog) keep the thin rule they had before. */}
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
        <div className={`border-t border-slate-200 dark:border-white/5 py-3 px-3 space-y-2 ${isCollapsed ? 'lg:px-1' : ''}`} style={{ paddingBottom: 'max(0.75rem, var(--safe-area-bottom))' }}>
          {/* Telegram CTA */}
          {!isSuperAdmin && <TelegramNotifyButton isCollapsed={isCollapsed} onClose={onClose} />}

          <div className={`flex items-center gap-2 px-1 ${isCollapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
            <button
              type="button"
              onClick={goProfile}
              className={`flex items-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 p-1.5 rounded-lg transition-colors overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${isCollapsed ? 'gap-3 lg:gap-0 flex-1 lg:flex-none -ml-1.5 lg:mx-auto lg:ml-0 lg:justify-center' : 'gap-3 flex-1 -ml-1.5'}`}
              title={t('nav.profile')}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm ring-2 ring-slate-200 dark:ring-white/10 shrink-0 aspect-square" />
              ) : (
                <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-slate-200 dark:ring-white/10 shrink-0 aspect-square">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className={`min-w-0 flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{profile?.displayName}</p>
                <p className="text-[10px] text-slate-500">{activeRoleLabel}</p>
              </div>
            </button>
            {isSuperAdmin && (
              <NavLink to="/admin/settings" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            {isAdmin && !isSuperAdmin && (
              <NavLink to="/org-settings" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            {isTeacher && !isSuperAdmin && (
              <NavLink to="/teacher-settings" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-white/5 transition-colors"
              title={t('app.signOut')}
              aria-label={t('app.signOut')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
