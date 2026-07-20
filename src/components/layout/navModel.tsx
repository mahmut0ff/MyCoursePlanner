import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
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
  Sparkles, LifeBuoy, Wallet,
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

/**
 * Branch scoping — which switcher state a destination is meaningful in.
 *
 * The branch switcher has two modes: «Все филиалы» (`activeBranchId === null`)
 * and one specific branch. A destination whose data carries no `branchId` shows
 * the same org-wide list in both modes, so offering it under a branch is a lie;
 * a destination whose data IS branch-scoped is only ever a partial view under
 * «Все филиалы». Either way the menu promises a filter it does not apply, so the
 * entry is dropped in the mode where it does not belong.
 *
 * Keyed by nav id, not per role branch: an id means the same destination for
 * every role (see the header note above), so `courses` is classified once and
 * the admin, manager, teacher and student menus all inherit it.
 *
 * Anything in NEITHER set stays visible in both modes — that is the default and
 * the right answer whenever a page reads sensibly org-wide *and* per branch
 * (dashboard, people lists, analytics), whenever the entry is the only route to
 * a destination, or whenever the server does not honour `branchId` yet.
 *
 * `team` and `orgSettings` are the only-route case and must stay unscoped even
 * though neither is branch-aware: nothing in the app links to /team except this
 * menu, so scoping it would leave a branch-selected admin no way to reach RBAC
 * at all; and the footer gear in Sidebar.tsx exists only for super_admin, admin
 * and teacher, so a manager under a branch would lose /org-settings — which is
 * also the only surface where SidebarCustomizerCard is mounted for them, i.e.
 * the trimmed menu could not even be un-trimmed. Give each a second entry point
 * before moving it into ALL_BRANCHES_ONLY.
 *
 * `lessons` and `exams` are the stale-server case on purpose:
 * LessonPlan/Exam declare `branchId` and both endpoints sit in api.ts's
 * BRANCH_SCOPED_ENDPOINTS, but api-lessons.ts and api-exams.ts never read the
 * param, so the lists do not actually narrow. Move them into ONE_BRANCH_ONLY
 * once those functions filter server-side.
 */
const ALL_BRANCHES_ONLY = new Set<string>([
  // Course = the org-wide catalogue. The branch lives on Group ("this course,
  // in this branch, for these students") — see the comment on Course in types.
  'courses', 'studentCourses',
  'materials', 'quizLibrary',   // library content, org-wide
  'leads',                      // no branchId on leads
  'ai',                         // org-wide insights hub
  // Safe to scope only because the BranchSwitcher's own footer carries a
  // «Управлять филиалами» link to /branches, so this is never the last way in.
  'branches',
]);

const ONE_BRANCH_ONLY = new Set<string>([
  'groups',                          // the canonical branch carrier
  'schedule', 'studentSchedule',     // ScheduleEvent.branchId
  'finances',                        // FinancialTransaction/PaymentPlan branchId
  'payroll',                         // ведомость — один документ на филиал, объединению негде жить
  'journal', 'gradebook',            // branch enters via the group behind each entry
]);

export interface NavModelOptions {
  /**
   * Apply the branch-scope filter above. Default true. The sidebar personalisation
   * card passes `false`: it must list every entry the user is entitled to, or an
   * item hidden by the current branch mode could never be toggled back on.
   */
  branchScope?: boolean;
}

/** Nav the CURRENT user is entitled to see, before personal hide-preferences. */
export function useNavModel(instType?: string, opts?: NavModelOptions): NavSectionDef[] {
  const { t } = useTranslation();
  const { role, isSuperAdmin, isTeacher, isManager, organizationId } = useAuth();
  const { canAccess } = usePlanGate();
  const { canRead } = usePermissions();
  // `canSwitch` (more than one branch) — not just `activeBranchId` — because a
  // single-branch org auto-selects that branch and one with no branches can only
  // ever be null. Scoping either would permanently amputate half their menu for
  // a distinction they cannot make.
  const { activeBranchId, canSwitch } = useBranch();
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
        { id: 'groups', to: '/groups', icon: Layers, label: term(t, inst, 'groups') },
        { id: 'lessons', to: '/lessons', icon: BookOpen, label: t('nav.lessons') },
        { id: 'exams', to: '/exams', icon: ClipboardList, label: t('nav.exams') },
        { id: 'schedule', to: '/schedule', icon: Calendar, label: t('nav.schedule') },
        // The admin menu had no way into the gradebook at all: /gradebook and
        // /journal were reachable only by typing the URL. No canRead() guard here
        // because the whole admin branch is unguarded — admins hold every grant.
        { id: 'journal', to: '/journal', icon: NotebookPen, label: t('nav.journal', 'Журнал'), locked: !canAccess('gradebook') },
        { id: 'gradebook', to: '/gradebook', icon: TableProperties, label: t('nav.gradebook', 'Оценки'), locked: !canAccess('gradebook') },
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
        { id: 'payroll', to: '/payroll', icon: Wallet, label: t('nav.payroll', 'Зарплата'), locked: !canAccess('payroll') },
        { id: 'analytics', to: '/teacher-analytics', icon: BarChart3, label: t('nav.analytics'), locked: !canAccess('advancedAnalytics') },
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
    // Both gradebook destinations sit here, next to the courses and groups they
    // read from — same order as the teacher and admin menus. Gradebook used to be
    // the lone entry under «Управление» and /journal was missing entirely.
    if (canRead('gradebook')) learning.push({ id: 'journal', to: '/journal', icon: NotebookPen, label: t('nav.journal', 'Журнал'), locked: !canAccess('gradebook') });
    if (canRead('gradebook')) learning.push({ id: 'gradebook', to: '/gradebook', icon: TableProperties, label: t('nav.gradebook', 'Оценки'), locked: !canAccess('gradebook') });
    if (canRead('materials')) learning.push({ id: 'materials', to: '/materials', icon: FileText, label: t('nav.materials') });
    if (canRead('quizzes')) learning.push({ id: 'quizLibrary', to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') });
    sections.push({ id: 'learning', label: t('nav.secLearning', 'Обучение'), items: learning });

    const management: NavItemDef[] = [];
    if (canRead('ai')) management.push({ id: 'ai', to: '/ai', icon: Sparkles, label: t('nav.aiHub', 'AI-центр'), locked: !canAccess('ai') });
    if (canRead('finances')) management.push({ id: 'finances', to: '/finances', icon: CreditCard, label: t('nav.finances', 'Финансы'), locked: !canAccess('finances') });
    if (canRead('payroll')) management.push({ id: 'payroll', to: '/payroll', icon: Wallet, label: t('nav.payroll', 'Зарплата'), locked: !canAccess('payroll') });
    if (canRead('branches')) management.push({ id: 'branches', to: '/branches', icon: MapPin, label: t('nav.branches', 'Филиалы'), locked: !canAccess('branches') });
    if (canRead('settings')) management.push({ id: 'orgSettings', to: '/org-settings', icon: Settings, label: t('nav.orgSettings', 'Настройки') });
    if (canRead('analytics')) management.push({ id: 'analytics', to: '/teacher-analytics', icon: BarChart3, label: t('nav.analytics'), locked: !canAccess('advancedAnalytics') });
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
      // No `students` entry: a teacher works group-first, and every student they
      // actually teach is one click away inside their group. The org-wide roster
      // is a management view, so it stays out of the teacher menu — /students
      // itself is still reachable for a custom role that links there.
      if (canRead('groups')) learning.push({ id: 'groups', to: '/groups', icon: Layers, label: term(t, inst, 'groups') });
      if (canRead('gradebook')) learning.push({ id: 'journal', to: '/journal', icon: NotebookPen, label: t('nav.journal', 'Журнал'), locked: !canAccess('gradebook') });
      if (canRead('gradebook')) learning.push({ id: 'gradebook', to: '/gradebook', icon: TableProperties, label: t('nav.gradebook', 'Оценки'), locked: !canAccess('gradebook') });
      if (canRead('homework')) learning.push({ id: 'homeworkReview', to: '/homework/review', icon: ClipboardCheck, label: t('nav.homeworkReview', 'Проверка ДЗ') });
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
      if (canRead('payroll')) management.push({ id: 'payroll', to: '/payroll', icon: Wallet, label: t('nav.payroll', 'Зарплата'), locked: !canAccess('payroll') });
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

  /* ──────── SUPPORT (every role) ──────── */
  // Appended outside the role branches on purpose: support is the one
  // destination that must never be gated. No canRead(), no canAccess() — a user
  // locked out of a feature, or on a plan that doesn't include it, is precisely
  // the one who needs to reach us. It stays hideable via sidebar prefs like any
  // other item, since that is cosmetic and personal.
  sections.push({
    id: 'support',
    items: [
      isSuperAdmin
        ? { id: 'admin.support', to: '/admin/support', icon: LifeBuoy, label: t('nav.support', 'Поддержка') }
        : { id: 'support', to: '/support', icon: LifeBuoy, label: t('nav.support', 'Поддержка') },
    ],
  });

  // Branch scope, last: it trims what the role branches above assembled, so a
  // destination still has to be granted by RBAC before the switcher can hide it.
  // Cosmetic like sidebar prefs — the route and the API stay reachable, and
  // flipping the switcher back restores the entry.
  const scoped =
    canSwitch && opts?.branchScope !== false
      ? sections.map((s) => ({
          ...s,
          items: s.items.filter((it) =>
            activeBranchId === null ? !ONE_BRANCH_ONLY.has(it.id) : !ALL_BRANCHES_ONLY.has(it.id),
          ),
        }))
      : sections;

  // A section with nothing in it must not leave a stray caption (or divider)
  // behind — the teacher menu already did this by hand for «Управление».
  return scoped.filter((s) => s.items.length > 0);
}
