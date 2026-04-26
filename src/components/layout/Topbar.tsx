import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Settings, HelpCircle
} from 'lucide-react';
import { usePageHelp } from '../../hooks/usePageHelp';
import { HelpDrawer } from './HelpDrawer';
import { orgGetStudents, orgGetCourses, orgGetGroups, apiGetLessons, apiGetExams } from '../../lib/api';

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

const TEACHER_ITEMS = [
  { icon: LayoutDashboard, label: 'nav.dashboard', path: '/dashboard' },
  { icon: BookOpen, label: 'nav.lessons', path: '/lessons' },
  { icon: ClipboardList, label: 'nav.exams', path: '/exams' },
  { icon: Radio, label: 'nav.examRooms', path: '/rooms' },
  { icon: BarChart3, label: 'nav.results', path: '/results' },
  { icon: Users, label: 'nav.students', path: '/students' },
  { icon: Users, label: 'nav.groups', path: '/groups' },
  { icon: BookOpen, label: 'nav.courses', path: '/courses' },
  { icon: Activity, label: 'nav.schedule', path: '/schedule' },
  { icon: ClipboardList, label: 'nav.journal', path: '/journal' },
  { icon: BarChart3, label: 'nav.gradebook', path: '/gradebook' },
  { icon: Puzzle, label: 'nav.quizLibrary', path: '/quiz/library' },
  { icon: Settings, label: 'nav.settings', path: '/teacher-settings' },
];

const STUDENT_ITEMS = [
  { icon: LayoutDashboard, label: 'nav.dashboard', path: '/dashboard' },
  { icon: BookOpen, label: 'nav.lessons', path: '/lessons' },
  { icon: Radio, label: 'nav.examRooms', path: '/join' },
  { icon: BarChart3, label: 'nav.myResults', path: '/my-results' },
  { icon: Activity, label: 'nav.schedule', path: '/schedule' },
  { icon: BookOpen, label: 'nav.myCourses', path: '/courses' },
  { icon: Users, label: 'nav.myGroups', path: '/groups' },
  { icon: Zap, label: 'nav.achievements', path: '/achievements' },
  { icon: BookOpen, label: 'nav.diary', path: '/diary' },
];

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { t } = useTranslation();
  const { isSuperAdmin, role, isTeacher } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const pageHelp = usePageHelp();
  const [helpOpen, setHelpOpen] = useState(false);

  const [globalData, setGlobalData] = useState<{
    students: any[];
    courses: any[];
    groups: any[];
    lessons: any[];
    exams: any[];
  }>({ students: [], courses: [], groups: [], lessons: [], exams: [] });
  const [globalDataLoaded, setGlobalDataLoaded] = useState(false);

  // When search opens, fetch global data
  useEffect(() => {
    if (searchOpen && !globalDataLoaded && !isSuperAdmin) {
      const load = async () => {
        try {
          const [studentsRes, coursesRes, groupsRes, lessonsRes, examsRes] = await Promise.allSettled([
            (isTeacher || role === 'admin' || role === 'manager') ? orgGetStudents() : Promise.resolve([]),
            orgGetCourses(),
            orgGetGroups(),
            apiGetLessons(),
            apiGetExams()
          ]);
          setGlobalData({
            students: studentsRes.status === 'fulfilled' ? studentsRes.value : [],
            courses: coursesRes.status === 'fulfilled' ? coursesRes.value : [],
            groups: groupsRes.status === 'fulfilled' ? groupsRes.value : [],
            lessons: lessonsRes.status === 'fulfilled' ? lessonsRes.value : [],
            exams: examsRes.status === 'fulfilled' ? examsRes.value : [],
          });
          setGlobalDataLoaded(true);
        } catch (e) {
          console.error('Failed to load search data', e);
        }
      };
      load();
    }
  }, [searchOpen, globalDataLoaded, isSuperAdmin, isTeacher, role]);

  const items = isSuperAdmin ? ADMIN_ITEMS : role === 'teacher' ? TEACHER_ITEMS : role === 'student' ? STUDENT_ITEMS : USER_ITEMS;
  
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    
    // 1. Navigation items
    const navResults = items
      .filter((i) => t(i.label).toLowerCase().includes(q))
      .map(i => ({ ...i, type: 'nav' as const }));

    if (!q) return navResults; // Only show nav items when empty query

    // 2. Global Data Search
    const studentResults = globalData.students
      .filter((s: any) => s.displayName?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
      .map((s: any) => ({
        icon: Users,
        label: s.displayName || s.email,
        path: `/students/${s.uid}`,
        type: 'student' as const,
        meta: t('org.results.student', 'Студент')
      }));

    const courseResults = globalData.courses
      .filter((c: any) => c.title?.toLowerCase().includes(q))
      .map((c: any) => ({
        icon: BookOpen,
        label: c.title,
        path: `/courses/${c.id}`,
        type: 'course' as const,
        meta: t('org.results.course', 'Курс')
      }));

    const groupResults = globalData.groups
      .filter((g: any) => g.name?.toLowerCase().includes(q))
      .map((g: any) => ({
        icon: Users,
        label: g.name,
        path: `/groups/${g.id}`,
        type: 'group' as const,
        meta: t('org.results.group', 'Группа')
      }));

    const lessonResults = globalData.lessons
      .filter((l: any) => l.title?.toLowerCase().includes(q))
      .map((l: any) => ({
        icon: BookOpen,
        label: l.title,
        path: `/lessons/${l.id}`,
        type: 'lesson' as const,
        meta: t('org.results.lesson', 'Урок')
      }));

    const examResults = globalData.exams
      .filter((e: any) => e.title?.toLowerCase().includes(q))
      .map((e: any) => ({
        icon: ClipboardList,
        label: e.title,
        path: `/exams/${e.id}`,
        type: 'exam' as const,
        meta: t('org.results.exam', 'Экзамен')
      }));

    return [...navResults, ...studentResults, ...courseResults, ...groupResults, ...lessonResults, ...examResults].slice(0, 20);
  }, [query, items, globalData, t]);

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
          {/* Student Stats */}
          {role === 'student' && (
            <div className="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700/60 pr-2 mr-1">
              <button onClick={() => navigate('/achievements')} className="p-2 rounded-lg text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title={t('gamification.badges')}>
                <Zap className="w-5 h-5" />
              </button>
              <button onClick={() => navigate('/my-results')} className="p-2 rounded-lg text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title={t('nav.myResults')}>
                <BarChart3 className="w-5 h-5" />
              </button>
            </div>
          )}

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

          {/* Help Button (Contextual) */}
          {pageHelp && (
            <button
              onClick={() => setHelpOpen(true)}
              className="p-2 rounded-lg text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title={t('common.howItWorks', "Как работает модуль?")}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          )}

          {/* Settings & Billing (Admin/Teacher) */}
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700/60 pl-2 ml-1">
            {role === 'admin' && !isSuperAdmin && (
              <button onClick={() => navigate('/billing')} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={t('nav.billingPlans')}>
                <CreditCard className="w-5 h-5" />
              </button>
            )}
            {(role === 'admin' || isTeacher) && !isSuperAdmin && (
              <button onClick={() => navigate(role === 'admin' ? '/org-settings' : '/teacher-settings')} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={t('nav.settings')}>
                <Settings className="w-5 h-5" />
              </button>
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
                      <span className="font-medium truncate max-w-[200px] md:max-w-xs text-left">
                        {item.type === 'nav' ? t(item.label) : item.label}
                      </span>
                      {item.type !== 'nav' && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 rounded font-semibold shrink-0">
                          {item.meta}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[150px]">{item.path}</span>
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
      
      {/* ═══ Help Drawer ═══ */}
      <HelpDrawer 
        isOpen={helpOpen} 
        onClose={() => setHelpOpen(false)} 
        config={pageHelp} 
      />
    </>
  );
};

export default Topbar;
