import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../services/auth.service';
import {
  GraduationCap, LayoutDashboard, BookOpen, ClipboardList, Radio,
  BarChart3, LogOut, CreditCard, Users, Building2,
} from 'lucide-react';

const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { profile, role, isSuperAdmin, isStaff } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-40 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">MyCoursePlan</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
              <LayoutDashboard className="w-5 h-5" />Dashboard
            </NavLink>

            {isSuperAdmin ? (
              <>
                <p className="px-3 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase">Platform</p>
                <NavLink to="/platform/organizations" className={linkClass} onClick={onClose}>
                  <Building2 className="w-5 h-5" />Organizations
                </NavLink>
                <NavLink to="/platform/users" className={linkClass} onClick={onClose}>
                  <Users className="w-5 h-5" />All Users
                </NavLink>
              </>
            ) : (
              <>
                <p className="px-3 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase">Learning</p>
                <NavLink to="/lessons" className={linkClass} onClick={onClose}>
                  <BookOpen className="w-5 h-5" />Lessons
                </NavLink>
                <NavLink to="/exams" className={linkClass} onClick={onClose}>
                  <ClipboardList className="w-5 h-5" />Exams
                </NavLink>
                <NavLink to="/rooms" className={linkClass} onClick={onClose}>
                  <Radio className="w-5 h-5" />Exam Rooms
                </NavLink>

                {role === 'student' && (
                  <NavLink to="/my-results" className={linkClass} onClick={onClose}>
                    <BarChart3 className="w-5 h-5" />My Results
                  </NavLink>
                )}

                {isStaff && !isSuperAdmin && (
                  <>
                    <p className="px-3 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase">Organization</p>
                    <NavLink to="/billing" className={linkClass} onClick={onClose}>
                      <CreditCard className="w-5 h-5" />Billing & Plans
                    </NavLink>
                  </>
                )}
              </>
            )}
          </nav>

          {/* User */}
          <div className="border-t px-4 py-4">
            <div className="flex items-center gap-3 mb-3 px-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">
                {profile?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{profile?.displayName}</p>
                <p className="text-xs text-slate-500 capitalize">{role} {profile?.organizationName ? `· ${profile.organizationName}` : ''}</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 w-full transition-colors">
              <LogOut className="w-4 h-4" />Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
