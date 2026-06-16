import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { term } from '../../lib/terminology';
import { signOut } from '../../services/auth.service';

import OrgSwitcher from './OrgSwitcher';
import TelegramNotifyButton from '../telegram/TelegramNotifyButton';
import SidebarTips from './SidebarTips';
import {
  Building2, Calendar, FileText,
  LayoutDashboard, Monitor,
  Settings, BookOpen, UserPlus,
  BarChart3, Gamepad2, ChevronDown, TableProperties,
  Users, Layers, Activity, Flag, Plug, FolderOpen,
  ClipboardList, Radio, LogOut, CreditCard, Trophy,
  Lock, ClipboardCheck,
  ShieldCheck, Inbox,
  NotebookText, NotebookPen, MapPin, UserCog,
} from 'lucide-react';

/* ─── Thin divider between groups ─── */
const Divider = () => <div className="my-2 mx-3 border-t border-white/[0.06]" />;

/* ─── Group caption (collapses to a divider on a folded desktop sidebar) ─── */
const SectionLabel: React.FC<{ label: string; isCollapsed?: boolean }> = ({ label, isCollapsed }) => (
  <>
    {isCollapsed && <div className="hidden lg:block my-2 mx-3 border-t border-white/[0.06]" />}
    <p className={`px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500/80 select-none ${isCollapsed ? 'lg:hidden' : ''}`}>
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
      isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
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
          {locked && <Lock aria-hidden="true" className={`w-3 h-3 ml-auto text-slate-500 ${isCollapsed ? 'lg:hidden' : ''}`} />}
        </>
      )}
    </NavLink>
  );
};

const Sidebar: React.FC<{ open: boolean; onClose: () => void; isCollapsed?: boolean; onToggleCollapse?: () => void; orgData?: any }> = ({ open, onClose, isCollapsed, onToggleCollapse, orgData }) => {
  const { t } = useTranslation();
  const { profile, role, isSuperAdmin, isTeacher, isManager, organizationId, hasPermission } = useAuth();
  const { canAccess } = usePlanGate();
  const { canRead } = usePermissions();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const goProfile = () => {
    navigate(role === 'teacher' ? '/teacher-profile' : '/profile');
    if (window.innerWidth < 1024) onClose();
  };

  const isAdmin = role === 'admin';
  const teacherWithOrg = isTeacher && !!organizationId;
  const instType = orgData?.institutionType;

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside role="navigation" aria-label={t('nav.mainNavigation', 'Main navigation')} className={`fixed top-0 left-0 bottom-0 w-60 ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'} bg-[#0f172a] border-r border-slate-700/50 z-40 transform transition-[width,transform] duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`} style={{ paddingTop: 'var(--safe-area-top)' }}>

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5 h-[69px]">
          <img src={orgData?.logo || orgData?.branding?.logoUrl || "/icons/logo.png"} alt={orgData?.name || "SabakHub"} className="h-9 w-auto object-contain shrink-0" />
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <span className="font-bold text-[15px] text-white leading-none tracking-tight truncate block">{orgData?.name && orgData.name !== 'New Organization' ? orgData.name : t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[9px] text-primary-400 font-semibold tracking-wide mt-0.5">{t('app.superAdmin')}</p>
            )}
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 hidden lg:flex items-center justify-center transition-colors absolute -right-3 top-5 bg-[#0f172a] border border-slate-700/50 shadow-lg z-50 rounded-full"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          )}
        </div>

        {/* ═══ Org Switcher ═══ */}
        {!isSuperAdmin && <OrgSwitcher currentOrgId={organizationId || undefined} userRole={role} onClose={onClose} isCollapsed={isCollapsed} />}

        {/* ═══ Navigation ═══ */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">

          {/* ──────── SUPER ADMIN ──────── */}
          {isSuperAdmin && (
            <>
              <NavItem to="/admin" end icon={LayoutDashboard} label={t('nav.overview')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secManagement', 'Управление')} isCollapsed={isCollapsed} />
              <NavItem to="/admin/organizations" icon={Building2} label={t('nav.organizations')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/demo-requests" icon={Inbox} label={t('nav.demoRequests', 'Заявки на демо')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/users" icon={Users} label={t('nav.users')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/billing" icon={CreditCard} label={t('nav.billing')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/plans" icon={Layers} label={t('nav.plans')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secSystem', 'Система')} isCollapsed={isCollapsed} />
              <NavItem to="/admin/audit-logs" icon={Activity} label={t('nav.auditLogs')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/system-health" icon={Monitor} label={t('nav.systemHealth')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/feature-flags" icon={Flag} label={t('nav.featureFlags')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/admin/integrations" icon={Plug} label={t('nav.integrations')} isCollapsed={isCollapsed} onClose={onClose} />
            </>
          )}

          {/* ──────── ORG ADMIN ──────── */}
          {isAdmin && !isSuperAdmin && (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secPeople', 'Люди')} isCollapsed={isCollapsed} />
              <NavItem to="/students" icon={Users} label={term(t, instType, 'students')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/teachers" icon={UserPlus} label={t('nav.teachers')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/managers" icon={ShieldCheck} label={t('nav.managers', 'Менеджеры')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/team" icon={UserCog} label={t('nav.team', 'Команда и роли')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('rbac')} />

              <SectionLabel label={t('nav.secLearning', 'Обучение')} isCollapsed={isCollapsed} />
              <NavItem to="/courses" icon={FolderOpen} label={t('nav.courses')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/lessons" icon={BookOpen} label={t('nav.lessons')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/exams" icon={ClipboardList} label={t('nav.exams')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/schedule" icon={Calendar} label={t('nav.schedule')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secManagement', 'Управление')} isCollapsed={isCollapsed} />
              <NavItem to="/finances" icon={CreditCard} label={t('nav.finances', 'Финансы')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('finances')} />
              <NavItem to="/teacher-analytics" icon={BarChart3} label={t('nav.analytics')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('advancedAnalytics')} />
            </>
          )}

          {/* ──────── MANAGER ──────── */}
          {isManager && !isSuperAdmin && (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secPeople', 'Люди')} isCollapsed={isCollapsed} />
              <NavItem to="/students" icon={Users} label={term(t, instType, 'students')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/teachers" icon={UserPlus} label={t('nav.teachers')} isCollapsed={isCollapsed} onClose={onClose} />
              {hasPermission('managers') && (
                <NavItem to="/managers" icon={ShieldCheck} label={t('nav.managers', 'Менеджеры')} isCollapsed={isCollapsed} onClose={onClose} />
              )}
              {canRead('team') && (
                <NavItem to="/team" icon={UserCog} label={t('nav.team', 'Команда и роли')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('rbac')} />
              )}

              <SectionLabel label={t('nav.secLearning', 'Обучение')} isCollapsed={isCollapsed} />
              <NavItem to="/courses" icon={FolderOpen} label={t('nav.courses')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/groups" icon={Layers} label={term(t, instType, 'groups')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/lessons" icon={BookOpen} label={t('nav.lessons')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/exams" icon={ClipboardList} label={t('nav.exams')} isCollapsed={isCollapsed} onClose={onClose} />
              <NavItem to="/schedule" icon={Calendar} label={t('nav.schedule')} isCollapsed={isCollapsed} onClose={onClose} />

              <SectionLabel label={t('nav.secManagement', 'Управление')} isCollapsed={isCollapsed} />
              {hasPermission('finances') && (
                <NavItem to="/finances" icon={CreditCard} label={t('nav.finances', 'Финансы')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('finances')} />
              )}
              {hasPermission('branches') && (
                <NavItem to="/branches" icon={MapPin} label={t('nav.branches', 'Филиалы')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('branches')} />
              )}
              {hasPermission('settings') && (
                <NavItem to="/org-settings" icon={Settings} label={t('nav.orgSettings', 'Настройки')} isCollapsed={isCollapsed} onClose={onClose} />
              )}
              <NavItem to="/gradebook" icon={TableProperties} label={t('nav.gradebook', 'Успеваемость')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('gradebook')} />
            </>
          )}

          {/* ──────── TEACHER ──────── */}
          {isTeacher && !isSuperAdmin && (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} isCollapsed={isCollapsed} onClose={onClose} />

              {teacherWithOrg && (
                <>
                  <SectionLabel label={t('nav.secLearning', 'Обучение')} isCollapsed={isCollapsed} />
                  <NavItem to="/journal" icon={NotebookPen} label={t('nav.journal', 'Журнал')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('gradebook')} />
                  <NavItem to="/homework/review" icon={ClipboardCheck} label={t('nav.homeworkReview', 'Проверка ДЗ')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/gradebook" icon={TableProperties} label={t('nav.gradebook', 'Оценки')} isCollapsed={isCollapsed} onClose={onClose} locked={!canAccess('gradebook')} />

                  <SectionLabel label={t('nav.secContent', 'Контент')} isCollapsed={isCollapsed} />
                  <NavItem to="/courses" icon={FolderOpen} label={t('nav.courses')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/lessons" icon={BookOpen} label={t('nav.lessons')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/exams" icon={ClipboardList} label={t('nav.exams')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/schedule" icon={Calendar} label={t('nav.schedule')} isCollapsed={isCollapsed} onClose={onClose} />
                </>
              )}

              {/* Independent teacher (no org) */}
              {!teacherWithOrg && (
                <>
                  <SectionLabel label={t('nav.secContent', 'Контент')} isCollapsed={isCollapsed} />
                  <NavItem to="/lessons" icon={BookOpen} label={t('nav.myLessons', 'Мои уроки')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/materials" icon={FileText} label={t('nav.myMaterials', 'Мои материалы')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/exams" icon={ClipboardList} label={t('nav.myExams', 'Мои экзамены')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/quiz/library" icon={Gamepad2} label={t('nav.quizLibrary')} isCollapsed={isCollapsed} onClose={onClose} />

                  <Divider />
                  <NavItem to="/catalog" icon={Building2} label={t('nav.findCenter', 'Каталог Организаций')} isCollapsed={isCollapsed} onClose={onClose} />
                </>
              )}
            </>
          )}

          {/* ──────── STUDENT ──────── */}
          {role === 'student' && (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} isCollapsed={isCollapsed} onClose={onClose} />

              {!!organizationId && (
                <>
                  <NavItem to="/diary" icon={NotebookText} label={t('nav.diary', 'Дневник')} isCollapsed={isCollapsed} onClose={onClose} />

                  <SectionLabel label={t('nav.secLearning', 'Обучение')} isCollapsed={isCollapsed} />
                  <NavItem to="/student/courses" icon={FolderOpen} label={t('nav.myCourses', 'Курсы')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/lessons" icon={BookOpen} label={t('nav.lessons')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/student/homework" icon={ClipboardCheck} label={t('nav.myHomework', 'Мои ДЗ')} isCollapsed={isCollapsed} onClose={onClose} />
                  <NavItem to="/student/schedule" icon={Calendar} label={t('nav.schedule')} isCollapsed={isCollapsed} onClose={onClose} />

                  <Divider />
                  <NavItem to="/join" icon={Radio} label={t('nav.joinTest', 'Войти в тест')} isCollapsed={isCollapsed} onClose={onClose} />
                </>
              )}

              {!organizationId && (
                <NavItem to="/catalog" icon={Building2} label={t('nav.findCenter', 'Найти учебный центр')} isCollapsed={isCollapsed} onClose={onClose} />
              )}

              <Divider />
              <NavItem to="/achievements" icon={Trophy} label={t('nav.achievements', 'Достижения')} isCollapsed={isCollapsed} onClose={onClose} />
            </>
          )}
        </nav>

        {/* ═══ Tips ═══ */}
        <div className="mt-auto">
          <SidebarTips isCollapsed={isCollapsed} />
        </div>

        {/* ═══ Footer ═══ */}
        <div className={`border-t border-white/5 py-3 px-3 space-y-2 ${isCollapsed ? 'lg:px-1' : ''}`} style={{ paddingBottom: 'max(0.75rem, var(--safe-area-bottom))' }}>
          {/* Telegram CTA */}
          {!isSuperAdmin && <TelegramNotifyButton isCollapsed={isCollapsed} onClose={onClose} />}

          <div className={`flex items-center gap-2 px-1 ${isCollapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
            <button
              type="button"
              onClick={goProfile}
              className={`flex items-center cursor-pointer hover:bg-white/5 p-1.5 rounded-lg transition-colors overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${isCollapsed ? 'gap-3 lg:gap-0 flex-1 lg:flex-none -ml-1.5 lg:mx-auto lg:ml-0 lg:justify-center' : 'gap-3 flex-1 -ml-1.5'}`}
              title={t('nav.profile')}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm ring-2 ring-white/10 shrink-0 aspect-square" />
              ) : (
                <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-white/10 shrink-0 aspect-square">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className={`min-w-0 flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-semibold text-white truncate">{profile?.displayName}</p>
                <p className="text-[10px] text-slate-500 capitalize">{role === 'admin' && !isSuperAdmin ? t('roles.director', 'Директор') : role?.replace('_', ' ')}</p>
              </div>
            </button>
            {isSuperAdmin && (
              <NavLink to="/admin/settings" className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            {isAdmin && !isSuperAdmin && (
              <NavLink to="/org-settings" className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            {isTeacher && !isSuperAdmin && (
              <NavLink to="/teacher-settings" className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors" title={t('nav.settings')}>
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-white/5 transition-colors"
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
