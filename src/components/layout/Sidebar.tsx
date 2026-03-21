import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { signOut } from '../../services/auth.service';
import LanguageSwitcher from '../LanguageSwitcher';
import {
  GraduationCap, LayoutDashboard, BookOpen, ClipboardList, Radio,
  BarChart3, LogOut, CreditCard, Users, Building2, Activity,
  Settings, Server, Shield, Sun, Moon,
} from 'lucide-react';

const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { profile, role, isSuperAdmin, isStaff } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-white/10 text-white'
        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    }`;

  const sectionTitle = (text: string) => (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{text}</p>
  );

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 bg-[#0f172a] z-40 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>

        {/* ═══ Header — BigShop style ═══ */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-[15px] text-white leading-none tracking-tight">{t('app.name')}</span>
            {isSuperAdmin && (
              <p className="text-[9px] text-primary-400 font-semibold tracking-wide mt-0.5">{t('app.superAdmin')}</p>
            )}
          </div>
        </div>

        {/* ═══ Navigation ═══ */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {isSuperAdmin ? (
            <>
              <NavLink to="/admin" end className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.dashboard')}
              </NavLink>

              {sectionTitle(t('nav.management'))}
              <NavLink to="/admin/organizations" className={linkClass} onClick={onClose}>
                <Building2 className="w-4 h-4" />{t('nav.organizations')}
              </NavLink>
              <NavLink to="/admin/users" className={linkClass} onClick={onClose}>
                <Users className="w-4 h-4" />{t('nav.users')}
              </NavLink>
              <NavLink to="/admin/billing" className={linkClass} onClick={onClose}>
                <CreditCard className="w-4 h-4" />{t('nav.billing')}
              </NavLink>

              {sectionTitle(t('nav.insights'))}
              <NavLink to="/admin/analytics" className={linkClass} onClick={onClose}>
                <BarChart3 className="w-4 h-4" />{t('nav.analytics')}
              </NavLink>
              <NavLink to="/admin/audit-logs" className={linkClass} onClick={onClose}>
                <Activity className="w-4 h-4" />{t('nav.auditLogs')}
              </NavLink>

              {sectionTitle(t('nav.system'))}
              <NavLink to="/admin/system-health" className={linkClass} onClick={onClose}>
                <Server className="w-4 h-4" />{t('nav.systemHealth')}
              </NavLink>
              <NavLink to="/admin/feature-flags" className={linkClass} onClick={onClose}>
                <Settings className="w-4 h-4" />{t('nav.featureFlags')}
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                <LayoutDashboard className="w-4 h-4" />{t('nav.dashboard')}
              </NavLink>

              {sectionTitle(t('nav.learning'))}
              <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                <BookOpen className="w-4 h-4" />{t('nav.lessons')}
              </NavLink>
              <NavLink to="/exams" className={linkClass} onClick={onClose}>
                <ClipboardList className="w-4 h-4" />{t('nav.exams')}
              </NavLink>
              <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                <Radio className="w-4 h-4" />{t('nav.examRooms')}
              </NavLink>

              {role === 'student' && (
                <NavLink to="/my-results" className={linkClass} onClick={onClose}>
                  <BarChart3 className="w-4 h-4" />{t('nav.myResults')}
                </NavLink>
              )}

              {isStaff && !isSuperAdmin && (
                <>
                  {sectionTitle(t('nav.organization'))}
                  <NavLink to="/billing" className={linkClass} onClick={onClose}>
                    <CreditCard className="w-4 h-4" />{t('nav.billingPlans')}
                  </NavLink>
                </>
              )}
            </>
          )}
        </nav>

        {/* ═══ Footer — BigShop style ═══ */}
        <div className="border-t border-white/5 px-3 py-3 space-y-3">
          {/* Version + Theme + Lang row */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-slate-600 font-mono">v1.0.0</span>
            <div className="flex items-center gap-1">
              <LanguageSwitcher compact />
              <button
                onClick={toggle}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* User Card */}
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-emerald-500/20 ring-2 ring-white/10">
              {profile?.displayName?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{profile?.displayName}</p>
              <p className="text-[11px] text-slate-500 capitalize flex items-center gap-1">
                {isSuperAdmin && <Shield className="w-3 h-3 text-primary-400" />}
                {role?.replace('_', ' ')}
              </p>
            </div>
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
