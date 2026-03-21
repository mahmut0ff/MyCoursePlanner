import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../services/auth.service';
import {
  GraduationCap, LayoutDashboard, BookOpen, ClipboardList, Radio,
  BarChart3, LogOut, CreditCard, Users, Building2, Activity,
  Settings, Server, Shield,
} from 'lucide-react';

const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { profile, role, isSuperAdmin, isStaff } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-primary-50 text-primary-700 shadow-sm'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
    }`;

  const sectionTitle = (text: string) => (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{text}</p>
  );

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200/80 z-40 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md shadow-primary-200">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-900 leading-none">MyCoursePlan</span>
              {isSuperAdmin && <p className="text-[10px] text-violet-600 font-semibold">SUPER ADMIN</p>}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
            {isSuperAdmin ? (
              <>
                {/* Super Admin Navigation */}
                <NavLink to="/admin" end className={linkClass} onClick={onClose}>
                  <LayoutDashboard className="w-4 h-4" />Dashboard
                </NavLink>

                {sectionTitle('Management')}
                <NavLink to="/admin/organizations" className={linkClass} onClick={onClose}>
                  <Building2 className="w-4 h-4" />Organizations
                </NavLink>
                <NavLink to="/admin/users" className={linkClass} onClick={onClose}>
                  <Users className="w-4 h-4" />Users
                </NavLink>
                <NavLink to="/admin/billing" className={linkClass} onClick={onClose}>
                  <CreditCard className="w-4 h-4" />Billing
                </NavLink>

                {sectionTitle('Insights')}
                <NavLink to="/admin/analytics" className={linkClass} onClick={onClose}>
                  <BarChart3 className="w-4 h-4" />Analytics
                </NavLink>
                <NavLink to="/admin/audit-logs" className={linkClass} onClick={onClose}>
                  <Activity className="w-4 h-4" />Audit Logs
                </NavLink>

                {sectionTitle('System')}
                <NavLink to="/admin/system-health" className={linkClass} onClick={onClose}>
                  <Server className="w-4 h-4" />System Health
                </NavLink>
                <NavLink to="/admin/feature-flags" className={linkClass} onClick={onClose}>
                  <Settings className="w-4 h-4" />Feature Flags
                </NavLink>
              </>
            ) : (
              <>
                {/* Regular User Navigation */}
                <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
                  <LayoutDashboard className="w-4 h-4" />Dashboard
                </NavLink>

                {sectionTitle('Learning')}
                <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                  <BookOpen className="w-4 h-4" />Lessons
                </NavLink>
                <NavLink to="/exams" className={linkClass} onClick={onClose}>
                  <ClipboardList className="w-4 h-4" />Exams
                </NavLink>
                <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                  <Radio className="w-4 h-4" />Exam Rooms
                </NavLink>

                {role === 'student' && (
                  <NavLink to="/my-results" className={linkClass} onClick={onClose}>
                    <BarChart3 className="w-4 h-4" />My Results
                  </NavLink>
                )}

                {isStaff && !isSuperAdmin && (
                  <>
                    {sectionTitle('Organization')}
                    <NavLink to="/billing" className={linkClass} onClick={onClose}>
                      <CreditCard className="w-4 h-4" />Billing & Plans
                    </NavLink>
                  </>
                )}
              </>
            )}
          </nav>

          {/* User Card */}
          <div className="border-t border-slate-100 px-3 py-3">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm">
                {profile?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{profile?.displayName}</p>
                <p className="text-[11px] text-slate-400 capitalize">
                  {isSuperAdmin && <Shield className="w-3 h-3 inline mr-0.5 text-violet-500" />}
                  {role?.replace('_', ' ')}
                </p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 w-full transition-colors">
              <LogOut className="w-3.5 h-3.5" />Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
