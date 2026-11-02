import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { term } from '../../lib/terminology';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import LanguageSwitcher from '../LanguageSwitcher';
import NotificationDropdown from '../notifications/NotificationDropdown';
import {
  Menu, Search, Sun, Moon, X,
  Users, CreditCard, BarChart3, BookOpen, ClipboardList, Zap,
  HelpCircle
} from 'lucide-react';
import { usePageHelp } from '../../hooks/usePageHelp';
import { HelpDrawer } from './HelpDrawer';
import { useNavModel } from './navModel';
import { orgGetStudents, orgGetCourses, orgGetGroups, apiGetLessons, apiGetExams } from '../../lib/api';

interface TopbarProps {
  onMenuClick: () => void;
}

/* ── current-page title (longest-prefix match) ── */
const TITLE_MAP: [string, string, string][] = [
  ['/admin/organizations', 'nav.organizations', 'Организации'],
  ['/admin/demo-requests', 'nav.demoRequests', 'Заявки на демо'],
  ['/admin/users', 'nav.users', 'Пользователи'],
  ['/admin/billing', 'nav.billing', 'Биллинг'],
  ['/admin/plans', 'nav.plans', 'Тарифы'],
  ['/admin/audit-logs', 'nav.auditLogs', 'Журнал аудита'],
  ['/admin/system-health', 'nav.systemHealth', 'Система'],
  ['/admin/feature-flags', 'nav.featureFlags', 'Флаги'],
  ['/admin/integrations', 'nav.integrations', 'Интеграции'],
  ['/admin/settings', 'nav.settings', 'Настройки'],
  ['/admin', 'nav.overview', 'Обзор'],
  ['/dashboard', 'nav.dashboard', 'Дашборд'],
  ['/student/courses', 'nav.myCourses', 'Курсы'],
  ['/student/homework', 'nav.myHomework', 'Мои ДЗ'],
  ['/student/schedule', 'nav.schedule', 'Расписание'],
  ['/students', 'nav.students', 'Студенты'],
  ['/leads', 'nav.leads', 'Заявки'],
  ['/teachers', 'nav.teachers', 'Преподаватели'],
  ['/courses', 'nav.courses', 'Курсы'],
  ['/lessons', 'nav.lessons', 'Уроки'],
  ['/exams', 'nav.exams', 'Экзамены'],
  ['/schedule', 'nav.schedule', 'Расписание'],
  ['/finances', 'nav.finances', 'Финансы'],
  ['/teacher-analytics', 'nav.analytics', 'Аналитика'],
  ['/journal', 'nav.journal', 'Журнал'],
  ['/homework/review', 'nav.homeworkReview', 'Проверка ДЗ'],
  ['/gradebook', 'nav.gradebook', 'Оценки'],
  ['/rating', 'nav.studentRating', 'Рейтинг'],
  ['/groups', 'nav.groups', 'Группы'],
  ['/branches', 'nav.branches', 'Филиалы'],
  ['/diary', 'nav.diary', 'Дневник'],
  ['/achievements', 'nav.achievements', 'Достижения'],
  ['/join', 'nav.joinTest', 'Войти в тест'],
  ['/catalog', 'nav.findCenter', 'Каталог'],
  ['/materials', 'nav.myMaterials', 'Материалы'],
  ['/quiz/library', 'nav.quizLibrary', 'Викторины'],
  ['/org-settings', 'nav.settings', 'Настройки'],
  ['/teacher-settings', 'nav.settings', 'Настройки'],
  ['/profile', 'nav.profile', 'Профиль'],
  ['/billing', 'nav.billing', 'Биллинг'],
  ['/rooms', 'nav.examRooms', 'Комнаты'],
  ['/my-results', 'nav.myResults', 'Мои результаты'],
  ['/results', 'nav.results', 'Результаты'],
].sort((a, b) => b[0].length - a[0].length) as [string, string, string][];

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { t } = useTranslation();
  const { isSuperAdmin, role, isTeacher } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const { institutionType } = useOrg();
  const pageTitle = useMemo(() => {
    const hit = TITLE_MAP.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(prefix + '/'));
    if (!hit) return '';
    // Как в меню: «Классы» в школе, «Потоки» в академии.
    return hit[0] === '/groups' ? term(t, institutionType, 'groups') : t(hit[1], hit[2]);
  }, [location.pathname, t, institutionType]);

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

  // When search opens, fetch global data. Not for students: the hits link to staff routes (/courses/:id, /groups/:id…).
  useEffect(() => {
    if (searchOpen && !globalDataLoaded && !isSuperAdmin && role !== 'student') {
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

  // Search offers exactly what the sidebar offers: same role/RBAC/branch filtering.
  const navSections = useNavModel(institutionType);
  const items = useMemo(
    () => navSections.flatMap((s) => s.items).map((i) => ({ icon: i.icon, label: i.label, path: i.to })),
    [navSections],
  );
  
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    
    // 1. Navigation items
    const navResults = items
      .filter((i) => i.label.toLowerCase().includes(q))
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

  const iconBtn = 'w-8 h-8 flex items-center justify-center shrink-0 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors';
  const kbd = 'inline-flex items-center px-1 h-4 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-500 dark:text-slate-400';

  return (
    <>
      <header className="h-11 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 px-2 md:px-5 shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onMenuClick}
            aria-label={t('nav.mainNavigation', 'Основная навигация')}
            className={`lg:hidden ${iconBtn}`}
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Current page title */}
          {pageTitle && (
            <h1 className="hidden md:block text-lg font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[32vw] mr-2">{pageTitle}</h1>
          )}

          {/* ⌘K Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            aria-label={t('common.search')}
            className="flex items-center gap-2 h-8 sm:h-7 w-8 sm:w-56 justify-center sm:justify-start px-0 sm:px-2 rounded-md border border-slate-300 bg-white text-[13px] text-slate-400 hover:border-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline truncate">{t('common.search')}...</span>
            <kbd className={`hidden md:inline-flex ml-auto ${kbd}`}>⌘K</kbd>
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Student Stats */}
          {role === 'student' && (
            <div className="flex items-center gap-0.5 sm:gap-1 border-r border-slate-200 dark:border-slate-700 pr-1 sm:pr-2 mr-0.5 sm:mr-1">
              <button onClick={() => navigate('/achievements')} className={`${iconBtn} !text-amber-500 dark:!text-amber-400`} title={t('gamification.badges')}>
                <Zap className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/my-results')} className={`${iconBtn} !text-primary-600 dark:!text-primary-400`} title={t('nav.myResults')}>
                <BarChart3 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Language Switcher */}
          <LanguageSwitcher compact />

          {/* Theme Toggle */}
          <button
            onClick={toggle}
            className={iconBtn}
            title={isDark ? t('common.lightMode', 'Светлая тема') : t('common.darkMode', 'Тёмная тема')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications */}
          <NotificationDropdown />

          {/* Help Button (Contextual) */}
          {pageHelp && (
            <button
              onClick={() => setHelpOpen(true)}
              className={`${iconBtn} !text-primary-600 dark:!text-primary-400`}
              title={t('common.howItWorks', "Как работает модуль?")}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* Billing quick-access (Admin) — settings live in the sidebar to avoid duplication */}
          {role === 'admin' && !isSuperAdmin && (
            <div className="flex items-center border-l border-slate-200 dark:border-slate-700 pl-1 sm:pl-2 ml-0.5 sm:ml-1">
              <button onClick={() => navigate('/billing')} className={iconBtn} title={t('nav.billingPlans')}>
                <CreditCard className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ═══ Global Search Modal ═══ */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setSearchOpen(false)}>
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-2 px-3 h-11 border-b border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder={`${t('common.search')}...`}
                className="bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none w-full"
              />
              <button
                onClick={() => setSearchOpen(false)}
                aria-label={t('common.close')}
                className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="text-center py-8 text-[13px] text-slate-500 dark:text-slate-400">{t('common.noData')}</p>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={`flex items-center gap-2 w-full h-8 px-2 rounded text-[13px] transition-colors ${
                        idx === selectedIdx
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="truncate max-w-[200px] md:max-w-xs text-left">
                        {item.label}
                      </span>
                      {item.type !== 'nav' && (
                        <span className="ml-auto inline-flex items-center h-5 px-1.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded shrink-0">
                          {item.meta}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hints */}
            <div className="px-3 h-9 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><kbd className={kbd}>↑↓</kbd> {t('common.navigate') || 'navigate'}</span>
              <span className="flex items-center gap-1"><kbd className={kbd}>↵</kbd> {t('common.select') || 'select'}</span>
              <span className="flex items-center gap-1"><kbd className={kbd}>esc</kbd> {t('common.close') || 'close'}</span>
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
