import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../LanguageSwitcher';
import NotificationDropdown from '../notifications/NotificationDropdown';
import {
  Menu, Search, Sun, Moon, X,
  LayoutDashboard, Building2, Users, CreditCard, BarChart3,
  Activity, Server, BookOpen, ClipboardList, Radio, Tag, Puzzle, Zap,
  Settings, UserCircle2, MailOpen, Briefcase, LogOut, Shield,
} from 'lucide-react';
import { signOut } from '../../services/auth.service';

interface TopbarProps {
  onMenuClick: () => void;
}

/* ── search items by role ── */
const ADMIN_ITEMS = [
  { icon: LayoutDashboard, label: 'nav.overview', path: '/admin' },
  { icon: Building2, label: 'nav.organizations', path: '/admin/organizations' },
  { icon: Users, label: 'nav.users', path: '/admin/users' },
  { icon: CreditCard, label: 'nav.billing', path: '/admin/billing' },
  { icon: Tag, label: 'nav.plans', path: '/admin/plans' },
  { icon: BarChart3, label: 'nav.analytics', path: '/admin/analytics' },
  { icon: Activity, label: 'nav.auditLogs', path: '/admin/audit-logs' },
  { icon: Server, label: 'nav.systemHealth', path: '/admin/system-health' },
  { icon: Puzzle, label: 'nav.integrations', path: '/admin/integrations' },
  { icon: Zap, label: 'nav.featureFlags', path: '/admin/feature-flags' },
];

const USER_ITEMS = [
  { icon: LayoutDashboard, label: 'nav.dashboard', path: '/dashboard' },
  { icon: BookOpen, label: 'nav.lessons', path: '/lessons' },
  { icon: ClipboardList, label: 'nav.exams', path: '/exams' },
  { icon: Radio, label: 'nav.examRooms', path: '/rooms' },
  { icon: BarChart3, label: 'nav.myResults', path: '/my-results' },
];

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const { isTeacher, role, profile } = useAuth();
  const isAdmin = role === 'admin';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const items = isSuperAdmin ? ADMIN_ITEMS : USER_ITEMS;
  const filtered = query.trim()
    ? items.filter((i) => t(i.label).toLowerCase().includes(query.toLowerCase()))
    : items;

  // ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIdx(0);
    }
  }, [searchOpen]);

  const go = useCallback((path: string) => {
    navigate(path);
    setSearchOpen(false);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[selectedIdx]) { go(filtered[selectedIdx].path); }
  };

  return (
    <>
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between px-4 md:px-6 shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* ⌘K Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.search')}...</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-[10px] font-mono text-slate-400 dark:text-slate-400 ml-2">⌘K</kbd>
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <LanguageSwitcher compact />

          {/* Theme Toggle */}
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <NotificationDropdown />

          {/* User Menu Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-9 h-9 ml-2 bg-emerald-600 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-emerald-500/20 ring-2 ring-transparent hover:ring-primary-500/30 transition-all"
            >
              {profile?.displayName?.[0]?.toUpperCase() || '?'}
            </button>
            
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700/60 overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/60 mb-1">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{profile?.displayName}</p>
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                    {isSuperAdmin && <Shield className="w-3 h-3 text-primary-400" />}
                    {role?.replace('_', ' ')}
                  </p>
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                  {/* Common or Role-specific profile/settings */}
                  {isSuperAdmin && (
                    <button onClick={() => { navigate('/admin/settings'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <Settings className="w-4 h-4" />{t('nav.settings')}
                    </button>
                  )}
                  
                  {isAdmin && !isSuperAdmin && (
                    <>
                      <button onClick={() => { navigate('/billing'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <CreditCard className="w-4 h-4" />{t('nav.billingPlans')}
                      </button>
                      <button onClick={() => { navigate('/org-settings'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <Settings className="w-4 h-4" />{t('nav.settings')}
                      </button>
                    </>
                  )}

                  {isTeacher && !isSuperAdmin && (
                    <>
                      <button onClick={() => { navigate('/teacher-profile'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <UserCircle2 className="w-4 h-4" />{t('nav.myProfile')}
                      </button>
                      <button onClick={() => { navigate('/invites'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <MailOpen className="w-4 h-4" />{t('nav.invites')}
                      </button>
                      <button onClick={() => { navigate('/my-applications'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <Briefcase className="w-4 h-4" />{t('nav.myApplications')}
                      </button>
                      <button onClick={() => { navigate('/teacher-settings'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <Settings className="w-4 h-4" />{t('nav.settings')}
                      </button>
                    </>
                  )}

                  {role === 'student' && (
                    <button onClick={() => { navigate('/profile'); setUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <UserCircle2 className="w-4 h-4" />{t('nav.profile')}
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-700/60 mt-1 pt-1">
                  <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10">
                    <LogOut className="w-4 h-4" />{t('app.signOut')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══ Global Search Modal ═══ */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]" onClick={() => setSearchOpen(false)}>
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder={`${t('common.search')}...`}
                className="bg-transparent text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none w-full"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">{t('common.noData')}</p>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={`flex items-center gap-3 w-full px-5 py-3 text-sm transition-colors ${
                        idx === selectedIdx
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="font-medium">{t(item.label)}</span>
                      <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 font-mono">{item.path}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hints */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">↑↓</kbd> {t('common.navigate') || 'navigate'}</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">↵</kbd> {t('common.select') || 'select'}</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">esc</kbd> {t('common.close') || 'close'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Topbar;
