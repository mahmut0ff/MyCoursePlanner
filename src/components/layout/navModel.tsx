import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { term } from '../../lib/terminology';
import type { InstitutionType } from '../../types';
import {
  Building2, Calendar, FileText,
  LayoutDashboard, Monitor,
  Settings, BookOpen, UserPlus,
  BarChart3, Gamepad2, TableProperties,
  Users, Layers, Activity, Flag, Plug, FolderOpen,
  ClipboardList, Radio, CreditCard, Trophy,
  ClipboardCheck,
  Inbox,
  NotebookText, NotebookPen, MapPin, UserCog,
  Sparkles, TrendingDown,
} from 'lucide-react';

/**
 * The sidebar's menu as data.
 *
 * Extracted from Sidebar.tsx so the same list can drive both the live menu and
 * the personalisation UI without the two drifting apart. Ids are STABLE — they
 * are persisted per user in localStorage (see `lib/sidebarPrefs`), so renaming
 * one silently un-hides that entry for everybody. An id means the same
 * destination for every role: teacher and admin both use `courses`.
 */

export interface NavItemDef {
  id: string;              // STABLE id, persisted in localStorage. e.g. 'students', 'admin.users'
  to: string;              // route path
  icon: ElementType;       // lucide icon
  label: string;           // already localized
  end?: boolean;
  locked?: boolean;        // plan-gated (renders the padlock)
}

export interface NavSectionDef {
  id: string;              // e.g. 'people' | 'learning' | 'management' | 'root'
  label?: string;          // localized SectionLabel text; omitted for the leading ungrouped items
  items: NavItemDef[];
}

/** Nav the CURRENT user is entitled to see, before personal hide-preferences. */
export function useNavModel(instType?: string): NavSectionDef[] {
  const { t } = useTranslation();
  const { role, isSuperAdmin, isTeacher, isManager, organizationId } = useAuth();
  const { canAccess } = usePlanGate();
  const { canRead } = usePermissions();
  // planId comes from the org document, not PlanContext: PlanContext skips the
  // subscription fetch for students, so its planId is always 'starter' there.
  const { orgData } = useOrg();

  const isAdmin = role === 'admin';
  const teacherWithOrg = isTeacher && !!organizationId;
  const inst = instType as InstitutionType | undefined;

  const sections: NavSectionDef[] = [];

  /* ──────── SUPER ADMIN ──────── */
  if (isSuperAdmin) {
    sections.push({
      id: 'root',
      items: [
        { id: 'admin.overview', to: '/admin', end: true, icon: LayoutDashboard, label: t('nav.overview') },
      ],
    });

    sections.push({
      id: 'management',
      label: t('nav.secManagement', 'Управление'),
      items: [
        { id: 'admin.organizations', to: '/admin/organizations', icon: Building2, label: t('nav.organizations') },
        { id: 'admin.demoRequests', to: '/admin/demo-requests', icon: Inbox, label: t('nav.demoRequests', 'Заявки на демо') },
        { id: 'admin.users', to: '/admin/users', icon: Users, label: t('nav.users') },
        { id: 'admin.billing', to: '/admin/billing', icon: CreditCard, label: t('nav.billing') },
        { id: 'admin.plans', to: '/admin/plans', icon: Layers, label: t('nav.plans') },
      ],
    });

    sections.push({
      id: 'system',
      label: t('nav.secSystem', 'Система'),
      items: [
        { id: 'admin.auditLogs', to: '/admin/audit-logs', icon: Activity, label: t('nav.auditLogs') },
        { id: 'admin.systemHealth', to: '/admin/system-health', icon: Monitor, label: t('nav.systemHealth') },
        { id: 'admin.featureFlags', to: '/admin/feature-flags', icon: Flag, label: t('nav.featureFlags') },
        { id: 'admin.integrations', to: '/admin/integrations', icon: Plug, label: t('nav.integrations') },
      ],
    });
  }

  /* ──────── ORG ADMIN ──────── */
  if (isAdmin && !isSuperAdmin) {
    sections.push({
      id: 'root',
      items: [
        { id: 'dashboard', to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
      ],
    });

    // People, ordered by the funnel: lead → enrolled student → teacher → internal team.
    sections.push({
      id: 'people',
      label: t('nav.secPeople', 'Люди'),
      items: [
        { id: 'leads', to: '/leads', icon: Inbox, label: t('nav.leads', 'Заявки') },
        { id: 'students', to: '/students', icon: Users, label: term(t, inst, 'students') },
        { id: 'teachers', to: '/teachers', icon: UserPlus, label: t('nav.teachers') },
        { id: 'team', to: '/team', icon: UserCog, label: t('nav.team', 'Команда и роли'), locked: !canAccess('rbac') },
      ],
    });

    sections.push({
      id: 'learning',
      label: t('nav.secLearning', 'Обучение'),
      items: [
        { id: 'courses', to: '/courses', icon: FolderOpen, label: t('nav.courses') },
        { id: 'lessons', to: '/lessons', icon: BookOpen, label: t('nav.lessons') },
        { id: 'exams', to: '/exams', icon: ClipboardList, label: t('nav.exams') },
        { id: 'schedule', to: '/schedule', icon: Calendar, label: t('nav.schedule') },
        { id: 'materials', to: '/materials', icon: FileText, label: t('nav.materials') },
        { id: 'quizLibrary', to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') },
      ],
    });

    sections.push({
      id: 'management',
      label: t('nav.secManagement', 'Управление'),
      items: [
        { id: 'ai', to: '/ai', icon: Sparkles, label: t('nav.aiHub', 'AI-центр'), locked: !canAccess('ai') },
        { id: 'finances', to: '/finances', icon: CreditCard, label: t('nav.finances', 'Финансы'), locked: !canAccess('finances') },
        { id: 'analytics', to: '/teacher-analytics', icon: BarChart3, label: t('nav.analytics'), locked: !canAccess('advancedAnalytics') },
        { id: 'riskDashboard', to: '/risk-dashboard', icon: TrendingDown, label: t('nav.riskDashboard', 'Светофор рисков'), locked: !canAccess('advancedAnalytics') },
      ],
    });
  }

  /* ──────── MANAGER ──────── */
  if (isManager && !isSuperAdmin) {
    sections.push({
      id: 'root',
      items: [
        { id: 'dashboard', to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
      ],
    });

    // People, ordered by the funnel: lead → enrolled student → teacher → internal team.
    const people: NavItemDef[] = [];
    if (canRead('leads')) people.push({ id: 'leads', to: '/leads', icon: Inbox, label: t('nav.leads', 'Заявки') });
    if (canRead('students')) people.push({ id: 'students', to: '/students', icon: Users, label: term(t, inst, 'students') });
    if (canRead('teachers')) people.push({ id: 'teachers', to: '/teachers', icon: UserPlus, label: t('nav.teachers') });
    if (canRead('team')) people.push({ id: 'team', to: '/team', icon: UserCog, label: t('nav.team', 'Команда и роли'), locked: !canAccess('rbac') });
    sections.push({ id: 'people', label: t('nav.secPeople', 'Люди'), items: people });

    const learning: NavItemDef[] = [];
    if (canRead('courses')) learning.push({ id: 'courses', to: '/courses', icon: FolderOpen, label: t('nav.courses') });
    if (canRead('groups')) learning.push({ id: 'groups', to: '/groups', icon: Layers, label: term(t, inst, 'groups') });
    if (canRead('lessons')) learning.push({ id: 'lessons', to: '/lessons', icon: BookOpen, label: t('nav.lessons') });
    if (canRead('exams')) learning.push({ id: 'exams', to: '/exams', icon: ClipboardList, label: t('nav.exams') });
    if (canRead('schedule')) learning.push({ id: 'schedule', to: '/schedule', icon: Calendar, label: t('nav.schedule') });
    if (canRead('materials')) learning.push({ id: 'materials', to: '/materials', icon: FileText, label: t('nav.materials') });
    if (canRead('quizzes')) learning.push({ id: 'quizLibrary', to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') });
    sections.push({ id: 'learning', label: t('nav.secLearning', 'Обучение'), items: learning });

    const management: NavItemDef[] = [];
    if (canRead('ai')) management.push({ id: 'ai', to: '/ai', icon: Sparkles, label: t('nav.aiHub', 'AI-центр'), locked: !canAccess('ai') });
    if (canRead('finances')) management.push({ id: 'finances', to: '/finances', icon: CreditCard, label: t('nav.finances', 'Финансы'), locked: !canAccess('finances') });
    if (canRead('branches')) management.push({ id: 'branches', to: '/branches', icon: MapPin, label: t('nav.branches', 'Филиалы'), locked: !canAccess('branches') });
    if (canRead('settings')) management.push({ id: 'orgSettings', to: '/org-settings', icon: Settings, label: t('nav.orgSettings', 'Настройки') });
    if (canRead('gradebook')) management.push({ id: 'gradebook', to: '/gradebook', icon: TableProperties, label: t('nav.gradebook', 'Успеваемость'), locked: !canAccess('gradebook') });
    if (canRead('analytics')) management.push({ id: 'analytics', to: '/teacher-analytics', icon: BarChart3, label: t('nav.analytics'), locked: !canAccess('advancedAnalytics') });
    if (canRead('analytics')) management.push({ id: 'riskDashboard', to: '/risk-dashboard', icon: TrendingDown, label: t('nav.riskDashboard', 'Светофор рисков'), locked: !canAccess('advancedAnalytics') });
    sections.push({ id: 'management', label: t('nav.secManagement', 'Управление'), items: management });
  }

  /* ──────── TEACHER ──────── */
  if (isTeacher && !isSuperAdmin) {
    sections.push({
      id: 'root',
      items: [
        { id: 'dashboard', to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
      ],
    });

    // Permission-gated, like the manager menu above: the teacher branch is
    // also what a custom role with baseRole 'teacher' gets, so hard-coding
    // it by role both hid modules such a role was granted and left dead
    // links behind a per-member revoke.
    if (teacherWithOrg) {
      const learning: NavItemDef[] = [];
      if (canRead('students')) learning.push({ id: 'students', to: '/students', icon: Users, label: term(t, inst, 'students') });
      if (canRead('groups')) learning.push({ id: 'groups', to: '/groups', icon: Layers, label: term(t, inst, 'groups') });
      if (canRead('gradebook')) learning.push({ id: 'journal', to: '/journal', icon: NotebookPen, label: t('nav.journal', 'Журнал'), locked: !canAccess('gradebook') });
      if (canRead('homework')) learning.push({ id: 'homeworkReview', to: '/homework/review', icon: ClipboardCheck, label: t('nav.homeworkReview', 'Проверка ДЗ') });
      if (canRead('gradebook')) learning.push({ id: 'gradebook', to: '/gradebook', icon: TableProperties, label: t('nav.gradebook', 'Оценки'), locked: !canAccess('gradebook') });
      sections.push({ id: 'learning', label: t('nav.secLearning', 'Обучение'), items: learning });

      const content: NavItemDef[] = [];
      if (canRead('courses')) content.push({ id: 'courses', to: '/courses', icon: FolderOpen, label: t('nav.courses') });
      if (canRead('lessons')) content.push({ id: 'lessons', to: '/lessons', icon: BookOpen, label: t('nav.lessons') });
      if (canRead('exams')) content.push({ id: 'exams', to: '/exams', icon: ClipboardList, label: t('nav.exams') });
      if (canRead('schedule')) content.push({ id: 'schedule', to: '/schedule', icon: Calendar, label: t('nav.schedule') });
      if (canRead('materials')) content.push({ id: 'materials', to: '/materials', icon: FileText, label: t('nav.materials') });
      if (canRead('quizzes')) content.push({ id: 'quizLibrary', to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') });
      sections.push({ id: 'content', label: t('nav.secContent', 'Контент'), items: content });

      // Modules only a custom teacher-based role is ever granted — absent
      // from TEACHER_DEFAULT, so a plain teacher renders none of these
      // (and the empty section drops out below).
      const management: NavItemDef[] = [];
      if (canRead('leads')) management.push({ id: 'leads', to: '/leads', icon: Inbox, label: t('nav.leads', 'Заявки') });
      if (canRead('teachers')) management.push({ id: 'teachers', to: '/teachers', icon: UserPlus, label: t('nav.teachers') });
      if (canRead('team')) management.push({ id: 'team', to: '/team', icon: UserCog, label: t('nav.team', 'Команда и роли'), locked: !canAccess('rbac') });
      if (canRead('ai')) management.push({ id: 'ai', to: '/ai', icon: Sparkles, label: t('nav.aiHub', 'AI-центр'), locked: !canAccess('ai') });
      if (canRead('finances')) management.push({ id: 'finances', to: '/finances', icon: CreditCard, label: t('nav.finances', 'Финансы'), locked: !canAccess('finances') });
      if (canRead('branches')) management.push({ id: 'branches', to: '/branches', icon: MapPin, label: t('nav.branches', 'Филиалы'), locked: !canAccess('branches') });
      if (canRead('settings')) management.push({ id: 'orgSettings', to: '/org-settings', icon: Settings, label: t('nav.orgSettings', 'Настройки') });
      sections.push({ id: 'management', label: t('nav.secManagement', 'Управление'), items: management });
    }

    // Independent teacher (no org)
    if (!teacherWithOrg) {
      sections.push({
        id: 'content',
        label: t('nav.secContent', 'Контент'),
        items: [
          { id: 'myLessons', to: '/lessons', icon: BookOpen, label: t('nav.myLessons', 'Мои уроки') },
          { id: 'myMaterials', to: '/materials', icon: FileText, label: t('nav.myMaterials', 'Мои материалы') },
          { id: 'myExams', to: '/exams', icon: ClipboardList, label: t('nav.myExams', 'Мои экзамены') },
          { id: 'quizLibrary', to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') },
        ],
      });

      sections.push({
        id: 'discover',
        items: [
          { id: 'catalog', to: '/catalog', icon: Building2, label: t('nav.findCenter', 'Каталог Организаций') },
        ],
      });
    }
  }

  /* ──────── STUDENT ──────── */
  if (role === 'student') {
    const root: NavItemDef[] = [
      { id: 'dashboard', to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    ];
    if (organizationId) {
      root.push({ id: 'diary', to: '/diary', icon: NotebookText, label: t('nav.diary', 'Дневник') });
    } else {
      root.push({ id: 'catalog', to: '/catalog', icon: Building2, label: t('nav.findCenter', 'Найти учебный центр') });
    }
    sections.push({ id: 'root', items: root });

    if (organizationId) {
      const learning: NavItemDef[] = [
        { id: 'studentCourses', to: '/student/courses', icon: FolderOpen, label: t('nav.myCourses', 'Курсы') },
        { id: 'lessons', to: '/lessons', icon: BookOpen, label: t('nav.lessons') },
        { id: 'studentHomework', to: '/student/homework', icon: ClipboardCheck, label: t('nav.myHomework', 'Мои ДЗ') },
        { id: 'studentSchedule', to: '/student/schedule', icon: Calendar, label: t('nav.schedule') },
      ];
      if (orgData?.planId === 'professional' || orgData?.planId === 'enterprise') {
        learning.push({ id: 'aiCoach', to: '/ai-coach', icon: Sparkles, label: t('nav.aiCoach', 'AI-наставник') });
      }
      sections.push({ id: 'learning', label: t('nav.secLearning', 'Обучение'), items: learning });

      sections.push({
        id: 'live',
        items: [
          { id: 'joinTest', to: '/join', icon: Radio, label: t('nav.joinTest', 'Войти в тест') },
        ],
      });
    }

    sections.push({
      id: 'progress',
      items: [
        { id: 'achievements', to: '/achievements', icon: Trophy, label: t('nav.achievements', 'Достижения') },
      ],
    });
  }

  // A section with nothing in it must not leave a stray caption (or divider)
  // behind — the teacher menu already did this by hand for «Управление».
  return sections.filter((s) => s.items.length > 0);
}
