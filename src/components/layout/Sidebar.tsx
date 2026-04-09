import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { signOut } from '../../services/auth.service';

import OrgSwitcher from './OrgSwitcher';
import {
  Building2, Calendar, FileText, GraduationCap,
  LayoutDashboard, Library, Monitor, Shield,
  UsersRound, Settings, BookOpen, UserPlus,
  BarChart3, Gamepad2, History, ChevronDown, TableProperties,
  Users, Layers, Database, Activity, Flag, Plug, FolderOpen,
  ClipboardList, Radio, Award, Trophy, LogOut, CreditCard,
  Bell, Lock, ClipboardCheck, TrendingDown,
  ShieldCheck, Headphones, Bot
} from 'lucide-react';

                        
/* ─── Collapsible section ─── */
const CollapsibleSection: React.FC<{
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isCollapsed?: boolean;
}> = ({ label, icon: Icon, children, defaultOpen = false, isCollapsed }) => {
  const [open, setOpen] = useState(defaultOpen);
  const location = useLocation();

  // Auto-open if any child link is active
  React.useEffect(() => {
    const childLinks = React.Children.toArray(children);
    const hasActive = childLinks.some((child: any) => {
      const to = child?.props?.to;
      return to && location.pathname.startsWith(to);
    });
    if (hasActive) setOpen(true);
  }, [location.pathname]);

  return (
    <div className="mt-1">
      <button
        onClick={() => !isCollapsed && setOpen(!open)}
        className={`group flex items-center w-full py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500/70 hover:text-slate-400 transition-colors select-none gap-2 px-3 ${isCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
        title={isCollapsed ? label : undefined}
      >
        <Icon className="w-3 h-3 shrink-0" />
        <div className={`flex items-center gap-2 flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
          <span className="flex-1 text-left line-clamp-1">{label}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        </div>
      </button>
      {(open || isCollapsed) && <div className="space-y-0.5">{children}</div>}
    </div>
  );
};

const Sidebar: React.FC<{ open: boolean; onClose: () => void; isCollapsed?: boolean; onToggleCollapse?: () => void; orgData?: any }> = ({ open, onClose, isCollapsed, onToggleCollapse, orgData }) => {
  const { t } = useTranslation();
  const { profile, role, isSuperAdmin, isTeacher, isManager, organizationId } = useAuth();
  const { canAccess } = usePlanGate();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center py-2 rounded-lg text-[13px] font-medium transition-all duration-150 relative group outline-none ${
      isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    } ${
      isCollapsed 
        ? 'gap-3 px-3 w-full lg:justify-center lg:px-0 lg:w-12 lg:mx-auto lg:gap-0 [&>span]:block [&>span]:truncate lg:[&>span]:hidden' 
        : 'gap-3 px-3 w-full [&>span]:block [&>span]:truncate'
    }`;

  const isAdmin = role === 'admin';
  const teacherWithOrg = isTeacher && !!organizationId;
  const managerWithOrg = isManager && !!organizationId;



                        

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-60 ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'} bg-[#0f172a] border-r border-slate-700/50 z-40 transform transition-[width,transform] duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`} style={{ paddingTop: 'var(--safe-area-top)' }}>

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5 h-[69px]">
          <img src={orgData?.logo || orgData?.branding?.logoUrl || "/icons/logo.png"} alt={orgData?.name || "Planula"} className="h-9 w-auto object-contain shrink-0" />
          {/* Brand/Logo - hides on large screens when collapsed */}
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <span className="font-bold text-[15px] text-white leading-none tracking-tight truncate block">{orgData?.name && orgData.name !== 'New Organization' ? orgData.name : t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[9px] text-primary-400 font-semibold tracking-wide mt-0.5">{t('app.superAdmin')}</p>
            )}
          </div>
          {/* Toggle Button */}
          {onToggleCollapse && (
            <button 
              onClick={onToggleCollapse} 
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 hidden lg:flex items-center justify-center transition-colors absolute -right-3 top-5 bg-[#0f172a] border border-slate-700/50 shadow-lg z-50 rounded-full"
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
              <NavLink to="/admin" end className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" /><span>{t('nav.overview')}</span>
              </NavLink>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionManagement', 'Управление')} icon={Shield} defaultOpen>
                <NavLink to="/admin/organizations" className={linkClass} onClick={onClose}>
                  <Building2 className="w-4 h-4" /><span>{t('nav.organizations')}</span>
                </NavLink>
                <NavLink to="/admin/users" className={linkClass} onClick={onClose}>
                  <Users className="w-4 h-4" /><span>{t('nav.users')}</span>
                </NavLink>
                <NavLink to="/admin/billing" className={linkClass} onClick={onClose}>
                  <CreditCard className="w-4 h-4" /><span>{t('nav.billing')}</span>
                </NavLink>
                <NavLink to="/admin/plans" className={linkClass} onClick={onClose}>
                  <Layers className="w-4 h-4" /><span>{t('nav.plans')}</span>
                </NavLink>
              </CollapsibleSection>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionSystem', 'Система')} icon={Database}>
                <NavLink to="/admin/audit-logs" className={linkClass} onClick={onClose}>
                  <Activity className="w-4 h-4" /><span>{t('nav.auditLogs')}</span>
                </NavLink>
                <NavLink to="/admin/system-health" className={linkClass} onClick={onClose}>
                  <Monitor className="w-4 h-4" /><span>{t('nav.systemHealth')}</span>
                </NavLink>
                <NavLink to="/admin/feature-flags" className={linkClass} onClick={onClose}>
                  <Flag className="w-4 h-4" /><span>{t('nav.featureFlags')}</span>
                </NavLink>
                <NavLink to="/admin/integrations" className={linkClass} onClick={onClose}>
                  <Plug className="w-4 h-4" /><span>{t('nav.integrations')}</span>
                </NavLink>
                <NavLink to="/admin/analytics" className={linkClass} onClick={onClose}>
                  <BarChart3 className="w-4 h-4" /><span>{t('nav.analytics')}</span>
                </NavLink>
              </CollapsibleSection>
            </>
          )}

          {/* ──────── ORG ADMIN ──────── */}
          {isAdmin && !isSuperAdmin && (
            <>
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" /><span>{t('nav.dashboard')}</span>
              </NavLink>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionPeople', 'Люди и Клиенты')} icon={Users} defaultOpen>
                <NavLink to="/leads" className={linkClass} onClick={onClose}>
                  <Bot className="w-4 h-4 text-primary-400" /><span>Заявки от ИИ</span>
                </NavLink>
                <NavLink to="/managers" className={linkClass} onClick={onClose}>
                  <ShieldCheck className="w-4 h-4" /><span>{t('nav.managers', 'Менеджеры')}</span>
                </NavLink>
                <NavLink to="/students" className={linkClass} onClick={onClose}>
                  <Users className="w-4 h-4" /><span>{t('nav.students')}</span>
                </NavLink>
                <NavLink to="/teachers" className={linkClass} onClick={onClose}>
                  <UserPlus className="w-4 h-4" /><span>{t('nav.teachers')}</span>
                </NavLink>
              </CollapsibleSection>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionOrg', 'Управление и Аналитика')} icon={Building2} defaultOpen>
                <NavLink to="/finances" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('finances') ? 'opacity-50' : ''}`} onClick={onClose}>
                  <CreditCard className="w-4 h-4" /><span>{t('nav.finances', 'Финансы')}</span>
                  {!canAccess('finances') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                </NavLink>
                <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                  <Calendar className="w-4 h-4" /><span>{t('nav.schedule')}</span>
                </NavLink>
                <NavLink to="/results" className={linkClass} onClick={onClose}>
                  <BarChart3 className="w-4 h-4" /><span>{t('nav.results')}</span>
                </NavLink>
                <NavLink to="/teacher-analytics" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('advancedAnalytics') ? 'opacity-50' : ''}`} onClick={onClose}>
                  <Activity className="w-4 h-4" /><span>{t('nav.analytics')}</span>
                  {!canAccess('advancedAnalytics') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                </NavLink>
                <NavLink to="/risk-dashboard" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('advancedAnalytics') ? 'opacity-50' : ''}`} onClick={onClose}>
                  <TrendingDown className="w-4 h-4" /><span>{t('nav.riskDashboard', 'Светофор рисков')}</span>
                  {!canAccess('advancedAnalytics') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                </NavLink>
              </CollapsibleSection>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionEducation', 'Образовательные Продукты')} icon={GraduationCap}>
                <NavLink to="/courses" className={linkClass} onClick={onClose}>
                  <FolderOpen className="w-4 h-4" /><span>{t('nav.courses')}</span>
                </NavLink>
                <NavLink to="/groups" className={linkClass} onClick={onClose}>
                  <UsersRound className="w-4 h-4" /><span>{t('nav.groups')}</span>
                </NavLink>
              </CollapsibleSection>

              <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionLibrary', 'Библиотека Контента')} icon={Library}>
                <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                  <BookOpen className="w-4 h-4" /><span>{t('nav.lessons')}</span>
                </NavLink>
                <NavLink to="/materials" className={linkClass} onClick={onClose}>
                  <FileText className="w-4 h-4" /><span>{t('nav.materials')}</span>
                </NavLink>
                <NavLink to="/exams" className={linkClass} onClick={onClose}>
                  <ClipboardList className="w-4 h-4" /><span>{t('nav.exams')}</span>
                </NavLink>
                <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                  <Gamepad2 className="w-4 h-4" /><span>{t('nav.quizLibrary')}</span>
                </NavLink>
              </CollapsibleSection>
            </>
          )}

          {/* ──────── MANAGER ──────── */}
          {isManager && !isSuperAdmin && (
            <>
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" /><span>{t('nav.dashboard')}</span>
              </NavLink>



              {managerWithOrg && (
                <>
                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionPeople', 'Люди и Клиенты')} icon={Users} defaultOpen>
                    <NavLink to="/leads" className={linkClass} onClick={onClose}>
                      <Bot className="w-4 h-4 text-primary-400" /><span>Заявки от ИИ</span>
                    </NavLink>
                    <NavLink to="/students" className={linkClass} onClick={onClose}>
                      <Users className="w-4 h-4" /><span>{t('nav.students')}</span>
                    </NavLink>
                    <NavLink to="/teachers" className={linkClass} onClick={onClose}>
                      <UserPlus className="w-4 h-4" /><span>{t('nav.teachers')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionOrg', 'Управление и Аналитика')} icon={Building2} defaultOpen>
                    <NavLink to="/finances" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('finances') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <CreditCard className="w-4 h-4" /><span>{t('nav.finances', 'Финансы')}</span>
                      {!canAccess('finances') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                    <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                      <Calendar className="w-4 h-4" /><span>{t('nav.schedule')}</span>
                    </NavLink>
                    <NavLink to="/results" className={linkClass} onClick={onClose}>
                      <BarChart3 className="w-4 h-4" /><span>{t('nav.results')}</span>
                    </NavLink>
                    <NavLink to="/gradebook" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('gradebook') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <TableProperties className="w-4 h-4" /><span>{t('nav.gradebook', 'Успеваемость')}</span>
                      {!canAccess('gradebook') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                    <NavLink to="/notifications" className={linkClass} onClick={onClose}>
                      <Bell className="w-4 h-4" /><span>{t('nav.notifications', 'Уведомления')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionEducation', 'Образовательные Продукты')} icon={GraduationCap}>
                    <NavLink to="/courses" className={linkClass} onClick={onClose}>
                      <FolderOpen className="w-4 h-4" /><span>{t('nav.courses')}</span>
                    </NavLink>
                    <NavLink to="/groups" className={linkClass} onClick={onClose}>
                      <UsersRound className="w-4 h-4" /><span>{t('nav.groups')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionLibrary', 'Библиотека Контента')} icon={Library}>
                    <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                      <BookOpen className="w-4 h-4" /><span>{t('nav.lessons')}</span>
                    </NavLink>
                    <NavLink to="/materials" className={linkClass} onClick={onClose}>
                      <FileText className="w-4 h-4" /><span>{t('nav.materials')}</span>
                    </NavLink>
                    <NavLink to="/exams" className={linkClass} onClick={onClose}>
                      <ClipboardList className="w-4 h-4" /><span>{t('nav.exams')}</span>
                    </NavLink>
                    <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                      <Gamepad2 className="w-4 h-4" /><span>{t('nav.quizLibrary')}</span>
                    </NavLink>
                  </CollapsibleSection>
                </>
              )}
            </>
          )}

          {/* ──────── TEACHER ──────── */}
          {isTeacher && !isSuperAdmin && (
            <>
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" /><span>{t('nav.dashboard')}</span>
              </NavLink>



              {teacherWithOrg && (
                <>
                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionEducation', 'Обучение')} icon={GraduationCap} defaultOpen>
                    <NavLink to="/journal" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('gradebook') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <ClipboardList className="w-4 h-4" /><span>{t('nav.journal', 'Журнал')}</span>
                      {!canAccess('gradebook') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                    <NavLink to="/homework/review" className={linkClass} onClick={onClose}>
                      <ClipboardCheck className="w-4 h-4" /><span>{t('nav.homeworkReview', 'Проверка ДЗ')}</span>
                    </NavLink>
                    <NavLink to="/gradebook" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('gradebook') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <TableProperties className="w-4 h-4" /><span>{t('nav.gradebook', 'Оценки')}</span>
                      {!canAccess('gradebook') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                    <NavLink to="/courses" className={linkClass} onClick={onClose}>
                      <FolderOpen className="w-4 h-4" /><span>{t('nav.courses')}</span>
                    </NavLink>
                    <NavLink to="/groups" className={linkClass} onClick={onClose}>
                      <UsersRound className="w-4 h-4" /><span>{t('nav.groups')}</span>
                    </NavLink>
                    <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                      <BookOpen className="w-4 h-4" /><span>{t('nav.lessons')}</span>
                    </NavLink>
                    <NavLink to="/materials" className={linkClass} onClick={onClose}>
                      <FileText className="w-4 h-4" /><span>{t('nav.materials')}</span>
                    </NavLink>
                    <NavLink to="/exams" className={linkClass} onClick={onClose}>
                      <ClipboardList className="w-4 h-4" /><span>{t('nav.exams')}</span>
                    </NavLink>
                    <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                      <Monitor className="w-4 h-4" /><span>{t('nav.examRooms')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionQuiz', 'Квизы')} icon={Gamepad2}>
                    <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                      <Library className="w-4 h-4" /><span>{t('nav.quizLibrary')}</span>
                    </NavLink>
                    <NavLink to="/quiz/sessions" className={linkClass} onClick={onClose}>
                      <History className="w-4 h-4" /><span>{t('nav.quizSessions')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionOrg', 'Организация')} icon={Building2}>
                    <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                      <Calendar className="w-4 h-4" /><span>{t('nav.schedule')}</span>
                    </NavLink>
                    <NavLink to="/results" className={linkClass} onClick={onClose}>
                      <BarChart3 className="w-4 h-4" /><span>{t('nav.results')}</span>
                    </NavLink>
                    <NavLink to="/teacher-analytics" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('advancedAnalytics') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <Activity className="w-4 h-4" /><span>{t('nav.analytics')}</span>
                      {!canAccess('advancedAnalytics') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                    <NavLink to="/risk-dashboard" className={({ isActive }) => `${linkClass({ isActive })} ${!canAccess('advancedAnalytics') ? 'opacity-50' : ''}`} onClick={onClose}>
                      <TrendingDown className="w-4 h-4" /><span>{t('nav.riskDashboard', 'Светофор рисков')}</span>
                      {!canAccess('advancedAnalytics') && <Lock className="w-3 h-3 ml-auto text-slate-500" />}
                    </NavLink>
                  </CollapsibleSection>
                </>
              )}

              {/* Personal workspace for independent teachers */}
              {!teacherWithOrg && (
                <>
                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionPersonalWorkspace', 'Личное пространство')} icon={FolderOpen} defaultOpen>
                    <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                      <BookOpen className="w-4 h-4" /><span>{t('nav.myLessons', 'Мои уроки')}</span>
                    </NavLink>
                    <NavLink to="/materials" className={linkClass} onClick={onClose}>
                      <FileText className="w-4 h-4" /><span>{t('nav.myMaterials', 'Мои материалы')}</span>
                    </NavLink>
                    <NavLink to="/exams" className={linkClass} onClick={onClose}>
                      <ClipboardList className="w-4 h-4" /><span>{t('nav.myExams', 'Мои экзамены')}</span>
                    </NavLink>
                    <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                      <Monitor className="w-4 h-4" /><span>{t('nav.myExamRooms', 'Экзаменационные комнаты')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionQuiz', 'Квизы')} icon={Gamepad2}>
                    <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                      <Library className="w-4 h-4" /><span>{t('nav.quizLibrary')}</span>
                    </NavLink>
                    <NavLink to="/quiz/sessions" className={linkClass} onClick={onClose}>
                      <History className="w-4 h-4" /><span>{t('nav.quizSessions')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <NavLink to="/catalog" className={linkClass} onClick={onClose}>
                    <Building2 className="w-4 h-4" /><span>{t('nav.findCenter', 'Каталог Организаций')}</span>
                  </NavLink>
                </>
              )}


            </>
          )}

          {/* ──────── STUDENT ──────── */}
          {role === 'student' && (
            <>
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" /><span>{t('nav.dashboard')}</span>
              </NavLink>

              {/* ── Tenant-specific: only when student has an active org ── */}
              {!!organizationId && (
                <>

                  <NavLink to="/diary" className={linkClass} onClick={onClose}>
                    <BookOpen className="w-4 h-4" /><span>{t('nav.diary', 'Мой дневник')}</span>
                  </NavLink>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionEducation', 'Обучение')} icon={GraduationCap} defaultOpen>
                    <NavLink to="/student/courses" className={linkClass} onClick={onClose}>
                      <FolderOpen className="w-4 h-4" /><span>{t('nav.myCourses', 'Мои курсы')}</span>
                    </NavLink>
                    <NavLink to="/student/groups" className={linkClass} onClick={onClose}>
                      <UsersRound className="w-4 h-4" /><span>{t('nav.myGroups', 'Мои группы')}</span>
                    </NavLink>
                    <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                      <BookOpen className="w-4 h-4" /><span>{t('nav.lessons')}</span>
                    </NavLink>
                    <NavLink to="/student/teachers" className={linkClass} onClick={onClose}>
                      <UserPlus className="w-4 h-4" /><span>{t('nav.myTeachers', 'Мои преподаватели')}</span>
                    </NavLink>
                    <NavLink to="/student/schedule" className={linkClass} onClick={onClose}>
                      <Calendar className="w-4 h-4" /><span>{t('nav.schedule')}</span>
                    </NavLink>
                  </CollapsibleSection>

                  <CollapsibleSection isCollapsed={isCollapsed} label={t('nav.sectionExams', 'Экзамены и тесты')} icon={ClipboardList}>
                    <NavLink to="/join" className={linkClass} onClick={onClose}>
                      <Radio className="w-4 h-4" /><span>{t('rooms.join')}</span>
                    </NavLink>
                    <NavLink to="/quiz/join" className={linkClass} onClick={onClose}>
                      <Gamepad2 className="w-4 h-4" /><span>{t('nav.joinQuiz')}</span>
                    </NavLink>
                    <NavLink to="/my-results" className={linkClass} onClick={onClose}>
                      <BarChart3 className="w-4 h-4" /><span>{t('nav.myResults')}</span>
                    </NavLink>
                  </CollapsibleSection>
                </>
              )}

              {/* ── Global: always visible regardless of org ── */}
              {!organizationId && (
                <NavLink to="/catalog" className={linkClass} onClick={onClose}>
                  <Building2 className="w-4 h-4" /><span>{t('nav.findCenter', 'Найти учебный центр')}</span>
                </NavLink>
              )}

              <NavLink to="/certificates" className={linkClass} onClick={onClose}>
                <Award className="w-4 h-4" /><span>{t('nav.certificates', 'Сертификаты')}</span>
              </NavLink>

              <NavLink to="/study-rooms" className={linkClass} onClick={onClose}>
                <Headphones className="w-4 h-4" /><span>{t('nav.studyRooms', 'Co-Study Rooms')}</span>
              </NavLink>

              <NavLink to="/achievements" className={linkClass} onClick={onClose}>
                <Trophy className="w-4 h-4" /><span>{t('nav.achievements', 'Достижения')}</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* ═══ Footer ═══ */}
        <div className={`border-t border-white/5 py-3 px-3 ${isCollapsed ? 'lg:px-1' : ''}`} style={{ paddingBottom: 'max(0.75rem, var(--safe-area-bottom))' }}>
          <div className={`flex items-center gap-2 px-1 ${isCollapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
            <div
              onClick={() => {
                navigate(role === 'teacher' ? '/teacher-profile' : '/profile');
                if (window.innerWidth < 1024) onClose();
              }}
              className={`flex items-center cursor-pointer hover:bg-white/5 p-1.5 rounded-lg transition-colors overflow-hidden ${isCollapsed ? 'gap-3 lg:gap-0 flex-1 lg:flex-none -ml-1.5 lg:mx-auto lg:ml-0 lg:justify-center' : 'gap-3 flex-1 -ml-1.5'}`}
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
            </div>
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
