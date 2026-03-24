import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../services/auth.service';
import { apiGetPendingInviteCount, apiLeaveOrganization } from '../../lib/api';
import OrgSwitcher from './OrgSwitcher';
import {
  LayoutDashboard, BookOpen, ClipboardList, Radio,
  BarChart3, CreditCard, Users, Building2, Activity,
  Server, Shield, Puzzle, Tag, Zap, FolderOpen, UsersRound,
  Calendar, FileText, Trophy, UserPlus, MailOpen, UserCircle2, Briefcase, DoorOpen,
  Gamepad2, Settings, LogOut
} from 'lucide-react';

const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { profile, role, isSuperAdmin, isTeacher, organizationId } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-white/10 text-white'
        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    }`;


  const isAdmin = role === 'admin';
  const teacherWithOrg = isTeacher && !!organizationId;

  // Fetch pending invite count for teacher badge
  const [inviteCount, setInviteCount] = useState(0);
  useEffect(() => {
    if (!isTeacher) return;
    apiGetPendingInviteCount()
      .then((data) => setInviteCount(data?.count || 0))
      .catch(() => {});
  }, [isTeacher]);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 bg-[#0f172a] border-r border-slate-700/50 z-40 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
          <img src="/icons/logo.png" alt="Planula" className="h-9 w-auto object-contain" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-[15px] text-white leading-none tracking-tight">{t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[9px] text-primary-400 font-semibold tracking-wide mt-0.5">{t('app.superAdmin')}</p>
            )}
          </div>
        </div>

        {/* ═══ Org Switcher ═══ */}
        {!isSuperAdmin && <OrgSwitcher currentOrgId={organizationId || undefined} />}

        {/* ═══ Navigation ═══ */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {isSuperAdmin ? (
            <>
              {/* SUPER ADMIN */}
              <NavLink to="/admin" end className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.overview')}
              </NavLink>
              <NavLink to="/admin/organizations" className={linkClass} onClick={onClose}>
                <Building2 className="w-4 h-4" />{t('nav.organizations')}
              </NavLink>
              <NavLink to="/admin/users" className={linkClass} onClick={onClose}>
                <Users className="w-4 h-4" />{t('nav.users')}
              </NavLink>
              <NavLink to="/admin/billing" className={linkClass} onClick={onClose}>
                <CreditCard className="w-4 h-4" />{t('nav.billing')}
              </NavLink>
              <NavLink to="/admin/plans" className={linkClass} onClick={onClose}>
                <Tag className="w-4 h-4" />{t('nav.plans')}
              </NavLink>
              <NavLink to="/admin/analytics" className={linkClass} onClick={onClose}>
                <BarChart3 className="w-4 h-4" />{t('nav.analytics')}
              </NavLink>
              <NavLink to="/admin/audit-logs" className={linkClass} onClick={onClose}>
                <Activity className="w-4 h-4" />{t('nav.auditLogs')}
              </NavLink>
              <NavLink to="/admin/system-health" className={linkClass} onClick={onClose}>
                <Server className="w-4 h-4" />{t('nav.systemHealth')}
              </NavLink>
              <NavLink to="/admin/integrations" className={linkClass} onClick={onClose}>
                <Puzzle className="w-4 h-4" />{t('nav.integrations')}
              </NavLink>
              <NavLink to="/admin/feature-flags" className={linkClass} onClick={onClose}>
                <Zap className="w-4 h-4" />{t('nav.featureFlags')}
              </NavLink>
            </>
          ) : isAdmin ? (
            <>
              {/* ORG ADMIN */}
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.dashboard')}
              </NavLink>
              <NavLink to="/courses" className={linkClass} onClick={onClose}>
                <FolderOpen className="w-4 h-4" />{t('nav.courses')}
              </NavLink>
              <NavLink to="/groups" className={linkClass} onClick={onClose}>
                <UsersRound className="w-4 h-4" />{t('nav.groups')}
              </NavLink>
              <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                <BookOpen className="w-4 h-4" />{t('nav.lessons')}
              </NavLink>
              <NavLink to="/materials" className={linkClass} onClick={onClose}>
                <FileText className="w-4 h-4" />{t('nav.materials')}
              </NavLink>
              <NavLink to="/exams" className={linkClass} onClick={onClose}>
                <ClipboardList className="w-4 h-4" />{t('nav.exams')}
              </NavLink>
              <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                <Radio className="w-4 h-4" />{t('nav.examRooms')}
              </NavLink>
              <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                <Gamepad2 className="w-4 h-4" />{t('nav.quizLibrary')}
              </NavLink>
              <NavLink to="/quiz/sessions" className={linkClass} onClick={onClose}>
                <Radio className="w-4 h-4" />{t('nav.quizSessions')}
              </NavLink>
              <NavLink to="/results" className={linkClass} onClick={onClose}>
                <Trophy className="w-4 h-4" />{t('nav.results')}
              </NavLink>
              <NavLink to="/students" className={linkClass} onClick={onClose}>
                <Users className="w-4 h-4" />{t('nav.students')}
              </NavLink>
              <NavLink to="/teachers" className={linkClass} onClick={onClose}>
                <UserPlus className="w-4 h-4" />{t('nav.teachers')}
              </NavLink>
              <NavLink to="/org-users" className={linkClass} onClick={onClose}>
                <Shield className="w-4 h-4" />{t('nav.users')}
              </NavLink>
              <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                <Calendar className="w-4 h-4" />{t('nav.schedule')}
              </NavLink>
              <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                <Calendar className="w-4 h-4" />{t('nav.schedule')}
              </NavLink>
            </>
          ) : isTeacher ? (
            <>
              {/* TEACHER */}
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.dashboard')}
              </NavLink>
              {teacherWithOrg && (
                <>
                  <NavLink to="/courses" className={linkClass} onClick={onClose}>
                    <FolderOpen className="w-4 h-4" />{t('nav.courses')}
                  </NavLink>
                  <NavLink to="/groups" className={linkClass} onClick={onClose}>
                    <UsersRound className="w-4 h-4" />{t('nav.groups')}
                  </NavLink>
                  <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                    <BookOpen className="w-4 h-4" />{t('nav.lessons')}
                  </NavLink>
                  <NavLink to="/materials" className={linkClass} onClick={onClose}>
                    <FileText className="w-4 h-4" />{t('nav.materials')}
                  </NavLink>
                  <NavLink to="/exams" className={linkClass} onClick={onClose}>
                    <ClipboardList className="w-4 h-4" />{t('nav.exams')}
                  </NavLink>
                  <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                    <Radio className="w-4 h-4" />{t('nav.examRooms')}
                  </NavLink>
                  <NavLink to="/results" className={linkClass} onClick={onClose}>
                    <Trophy className="w-4 h-4" />{t('nav.results')}
                  </NavLink>
                  <NavLink to="/schedule" className={linkClass} onClick={onClose}>
                    <Calendar className="w-4 h-4" />{t('nav.schedule')}
                  </NavLink>
                  <NavLink to="/quiz/library" className={linkClass} onClick={onClose}>
                    <Gamepad2 className="w-4 h-4" />{t('nav.quizLibrary')}
                  </NavLink>
                  <NavLink to="/quiz/sessions" className={linkClass} onClick={onClose}>
                    <Radio className="w-4 h-4" />{t('nav.quizSessions')}
                  </NavLink>
                </>
              )}
              <NavLink to="/teacher-profile" className={linkClass} onClick={onClose}>
                <UserCircle2 className="w-4 h-4" />{t('nav.myProfile')}
              </NavLink>
              <NavLink to="/invites" className={linkClass} onClick={onClose}>
                <MailOpen className="w-4 h-4" />{t('nav.invites')}
                {inviteCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 animate-pulse">
                    {inviteCount}
                  </span>
                )}
              </NavLink>
              <NavLink to="/my-applications" className={linkClass} onClick={onClose}>
                <Briefcase className="w-4 h-4" />{t('nav.myApplications')}
              </NavLink>
              <NavLink to="/teacher-analytics" className={linkClass} onClick={onClose}>
                <BarChart3 className="w-4 h-4" />{t('nav.analytics')}
              </NavLink>
              {organizationId && (
                <button
                  onClick={() => {
                    if (confirm(t('teacher.leaveOrgConfirm'))) {
                      apiLeaveOrganization().then(() => window.location.reload());
                    }
                  }}
                  className="flex items-center gap-3 px-3 py-2 text-xs rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full mt-2"
                >
                  <DoorOpen className="w-4 h-4" />{t('teacher.leaveOrg')}
                </button>
              )}
            </>
          ) : role === 'student' ? (
            <>
              {/* STUDENT */}
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.dashboard')}
              </NavLink>
              <NavLink to="/student/courses" className={linkClass} onClick={onClose}>
                <FolderOpen className="w-4 h-4" />{t('nav.myCourses', 'Мои курсы')}
              </NavLink>
              <NavLink to="/student/groups" className={linkClass} onClick={onClose}>
                <UsersRound className="w-4 h-4" />{t('nav.myGroups', 'Мои группы')}
              </NavLink>
              <NavLink to="/student/teachers" className={linkClass} onClick={onClose}>
                <UserPlus className="w-4 h-4" />{t('nav.myTeachers', 'Мои преподаватели')}
              </NavLink>
              <NavLink to="/directory" className={linkClass} onClick={onClose}>
                <Building2 className="w-4 h-4" />{t('nav.directory', 'Учебные центры')}
              </NavLink>
              <NavLink to="/join" className={linkClass} onClick={onClose}>
                <Radio className="w-4 h-4" />{t('rooms.join')}
              </NavLink>
              <NavLink to="/quiz/join" className={linkClass} onClick={onClose}>
                <Gamepad2 className="w-4 h-4" />{t('nav.joinQuiz')}
              </NavLink>
              <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                <BookOpen className="w-4 h-4" />{t('nav.lessons')}
              </NavLink>
              <NavLink to="/certificates" className={linkClass} onClick={onClose}>
                <Trophy className="w-4 h-4" />{t('certificate.title')}
              </NavLink>
            </>
          ) : null}
        </nav>

        {/* ═══ Footer ═══ */}
        <div className="border-t border-white/5 px-3 py-3">
          <div className="flex items-center gap-2 px-1">
            <div 
              onClick={() => {
                navigate(role === 'teacher' ? '/teacher-profile' : '/profile');
                if (window.innerWidth < 1024) onClose();
              }}
              className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-white/5 p-1.5 -ml-1.5 rounded-lg transition-colors overflow-hidden"
              title={t('nav.profile')}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-lg shadow-emerald-500/20 ring-2 ring-white/10 shrink-0" />
              ) : (
                <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-emerald-500/20 ring-2 ring-white/10 shrink-0">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{profile?.displayName}</p>
                <p className="text-[11px] text-slate-500 capitalize flex items-center gap-1">
                  {isSuperAdmin && <Shield className="w-3 h-3 text-primary-400" />}
                  {role?.replace('_', ' ')}
                </p>
              </div>
            </div>
            {isSuperAdmin && (
              <NavLink
                to="/admin/settings"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors"
                title={t('nav.settings')}
              >
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
