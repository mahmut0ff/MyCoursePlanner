import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../services/auth.service';
import {
  LayoutDashboard, BookOpen, ClipboardList, Radio, X, LogOut, GraduationCap,
} from 'lucide-react';

interface SidebarProps {
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { profile, role } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isStaff = role === 'admin' || role === 'teacher';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-slate-900">MyCoursePlan</span>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </NavLink>

        <NavLink to="/lessons" className={linkClass} onClick={onClose}>
          <BookOpen className="w-5 h-5" />
          Lesson Plans
        </NavLink>

        {isStaff && (
          <NavLink to="/exams" className={linkClass} onClick={onClose}>
            <ClipboardList className="w-5 h-5" />
            Exams
          </NavLink>
        )}

        {isStaff && (
          <NavLink to="/rooms" className={linkClass} onClick={onClose}>
            <Radio className="w-5 h-5" />
            Exam Rooms
          </NavLink>
        )}

        {!isStaff && (
          <NavLink to="/join" className={linkClass} onClick={onClose}>
            <Radio className="w-5 h-5" />
            Join Exam
          </NavLink>
        )}

        <NavLink to="/results" className={linkClass} onClick={onClose}>
          <ClipboardList className="w-5 h-5" />
          My Results
        </NavLink>
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
            {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{profile?.displayName}</p>
            <p className="text-xs text-slate-500 capitalize">{role}</p>
          </div>
          <button onClick={handleSignOut} className="text-slate-400 hover:text-red-500 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
