// ============================================================
// RBAC — Role-Based Access Control catalog & resolution
// Shared by the Team & Roles UI and the client-side permission gate.
// The backend mirrors the resource ids / resolution in
// netlify/functions/utils/rbac.ts — keep the ids in sync.
// ============================================================

export type RbacAction = 'read' | 'write' | 'delete';
export const RBAC_ACTIONS: RbacAction[] = ['read', 'write', 'delete'];

export const ACTION_LABELS: Record<RbacAction, string> = {
  read: 'Просмотр',
  write: 'Изменение',
  delete: 'Удаление',
};

/** A single resource grant inside a role. */
export interface RolePermission {
  resource: string;
  actions: RbacAction[];
}

/**
 * Per-member permission overrides, layered on top of the member's resolved role.
 * `grants` add `resource:action`s the role doesn't give; `revokes` remove ones it does.
 * Never applied to full-access roles (admin/owner) — they always keep everything.
 */
export interface PermissionOverrides {
  grants?: RolePermission[];
  revokes?: RolePermission[];
}

/** A reusable org-level role (template) that members can be assigned. */
export interface OrgRole {
  id: string;
  organizationId?: string;
  name: string;
  description?: string;
  permissions: RolePermission[];
  /** Built-in role that cannot be deleted (Owner/Admin, Teacher, Student). */
  isSystem?: boolean;
  /** Auto-assigned to new members of the matching base role. */
  isDefault?: boolean;
  /** Base membership role this custom role maps onto (admin/manager/teacher). */
  baseRole?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResourceDef {
  id: string;
  label: string;
  /** Restrict which actions make sense for this resource (e.g. read-only screens). */
  actions?: RbacAction[];
  help: { read: string; write?: string; delete?: string; notes?: string };
}

export interface ResourceGroup {
  group: string;
  resources: ResourceDef[];
}

// ─── Resource catalog (all platform modules) ───
export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    group: 'Люди',
    resources: [
      { id: 'students', label: 'Студенты', help: {
        read: 'Просмотр списка студентов и их профилей',
        write: 'Добавление и редактирование студентов, зачисление в группы',
        delete: 'Удаление и отчисление студентов',
      } },
      { id: 'teachers', label: 'Преподаватели', help: {
        read: 'Просмотр преподавателей и их профилей',
        write: 'Добавление и редактирование преподавателей',
        delete: 'Удаление преподавателей из организации',
      } },
      { id: 'team', label: 'Команда и роли', help: {
        read: 'Просмотр команды, ролей и назначений',
        write: 'Создание сотрудников, назначение ролей, настройка прав',
        delete: 'Удаление сотрудников и ролей',
        notes: 'Контролирует доступ к этой странице. Выдавайте осторожно.',
      } },
      { id: 'leads', label: 'Лиды (CRM)', help: {
        read: 'Просмотр заявок и воронки лидов',
        write: 'Создание и ведение лидов, смена статуса',
        delete: 'Удаление лидов',
      } },
    ],
  },
  {
    group: 'Обучение',
    resources: [
      { id: 'courses', label: 'Курсы', help: {
        read: 'Просмотр курсов и их содержания',
        write: 'Создание и редактирование курсов, назначение преподавателей',
        delete: 'Удаление курсов',
      } },
      { id: 'groups', label: 'Группы', help: {
        read: 'Просмотр групп и их состава',
        write: 'Создание групп, управление составом и расписанием',
        delete: 'Удаление групп',
      } },
      { id: 'lessons', label: 'Уроки', help: {
        read: 'Просмотр планов уроков',
        write: 'Создание и редактирование уроков, публикация',
        delete: 'Удаление уроков',
      } },
      { id: 'materials', label: 'Материалы', help: {
        read: 'Просмотр и скачивание материалов',
        write: 'Загрузка и организация материалов',
        delete: 'Удаление материалов',
      } },
      { id: 'schedule', label: 'Расписание', help: {
        read: 'Просмотр расписания занятий',
        write: 'Создание и редактирование событий расписания',
        delete: 'Удаление событий расписания',
      } },
    ],
  },
  {
    group: 'Оценивание',
    resources: [
      { id: 'exams', label: 'Экзамены', help: {
        read: 'Просмотр экзаменов и вопросов',
        write: 'Создание и редактирование экзаменов и вопросов',
        delete: 'Удаление экзаменов',
      } },
      { id: 'rooms', label: 'Комнаты экзаменов', help: {
        read: 'Просмотр экзаменационных комнат',
        write: 'Создание комнат, запуск и завершение сессий',
        delete: 'Удаление комнат',
      } },
      { id: 'quizzes', label: 'Викторины', help: {
        read: 'Просмотр библиотеки викторин',
        write: 'Создание викторин и запуск живых сессий',
        delete: 'Удаление викторин',
      } },
      { id: 'gradebook', label: 'Успеваемость и журнал', help: {
        read: 'Просмотр оценок и посещаемости',
        write: 'Выставление оценок, отметка посещаемости',
        delete: 'Удаление записей журнала',
      } },
      { id: 'homework', label: 'Домашние задания', help: {
        read: 'Просмотр сданных работ',
        write: 'Проверка и оценивание домашних заданий',
        delete: 'Удаление работ',
      } },
      { id: 'results', label: 'Результаты', actions: ['read'], help: {
        read: 'Просмотр результатов экзаменов организации',
      } },
    ],
  },
  {
    group: 'Управление',
    resources: [
      { id: 'ai', label: 'AI-центр', actions: ['read', 'write'], help: {
        read: 'Доступ к AI-центру: ассистент, аналитика и генерация',
        write: 'Запуск AI-действий и применение рекомендаций',
        notes: 'Доступно на тарифе Профессиональный и выше.',
      } },
      { id: 'finances', label: 'Финансы', help: {
        read: 'Просмотр транзакций, счетов и платёжных планов',
        write: 'Создание транзакций, ведение оплат',
        delete: 'Удаление финансовых записей',
        notes: 'Доступно на тарифе Профессиональный и выше.',
      } },
      { id: 'certificates', label: 'Сертификаты', help: {
        read: 'Просмотр выданных сертификатов',
        write: 'Генерация и выдача сертификатов',
        delete: 'Аннулирование сертификатов',
      } },
      { id: 'branches', label: 'Филиалы', help: {
        read: 'Просмотр филиалов и точек',
        write: 'Создание и редактирование филиалов',
        delete: 'Удаление филиалов',
        notes: 'Доступно на тарифе Enterprise.',
      } },
      { id: 'analytics', label: 'Аналитика', actions: ['read'], help: {
        read: 'Доступ к аналитике успеваемости и отчётам',
      } },
    ],
  },
  {
    group: 'Организация',
    resources: [
      { id: 'dashboard', label: 'Дашборд', actions: ['read'], help: {
        read: 'Доступ к главной панели и сводным показателям',
        notes: 'Определяет, видит ли пользователь сводный экран.',
      } },
      { id: 'settings', label: 'Настройки организации', help: {
        read: 'Просмотр настроек организации',
        write: 'Редактирование профиля, уведомлений и интеграций',
        delete: '—',
      } },
    ],
  },
];

/** Flat list of every resource id in the catalog. */
export const ALL_RESOURCES: string[] = RESOURCE_GROUPS.flatMap(g => g.resources.map(r => r.id));

/** Resource id → its allowed actions (defaults to all three). */
export const RESOURCE_ACTIONS: Record<string, RbacAction[]> = RESOURCE_GROUPS.reduce((acc, g) => {
  g.resources.forEach(r => { acc[r.id] = r.actions ?? RBAC_ACTIONS; });
  return acc;
}, {} as Record<string, RbacAction[]>);

// ─── System-role default permission maps (used when a member has no custom role) ───

const allowedFor = (r: string) => (RESOURCE_ACTIONS[r] || RBAC_ACTIONS);
const rwd = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: [...allowedFor(r)] }));
const rw = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: allowedFor(r).filter(a => a !== 'delete') }));
const ro = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: ['read' as RbacAction] }));

/**
 * Teacher: full CRUD on the content they own, edit on courses/groups/schedule,
 * read on people/results. Mirrors what the teacher UI exposes today so adding
 * server-side checks never regresses an existing teacher.
 */
export const TEACHER_DEFAULT: RolePermission[] = [
  ...ro(['dashboard', 'students', 'results', 'analytics']),
  ...rw(['courses', 'groups', 'schedule']),
  ...rwd(['lessons', 'exams', 'rooms', 'quizzes', 'materials', 'homework', 'gradebook']),
];

/** Manager base: broad operational CRUD; finances/settings/team/branches gated by legacy toggles. */
export const MANAGER_DEFAULT: RolePermission[] = [
  ...ro(['dashboard', 'analytics', 'results']),
  ...rw(['ai']),
  ...rwd(['students', 'teachers', 'leads', 'courses', 'groups', 'lessons', 'materials', 'schedule', 'exams', 'rooms', 'quizzes', 'gradebook', 'homework', 'certificates']),
];

/** Student: minimal — they don't use the staff matrix, but provide a sane fallback. */
export const STUDENT_DEFAULT: RolePermission[] = ro(['dashboard', 'lessons', 'results']);

export interface LegacyManagerPerms {
  finances?: boolean;
  settings?: boolean;
  managers?: boolean;
  branches?: boolean;
}

/**
 * Map the old 4-toggle manager permissions onto granular resource grants.
 * The legacy toggles were binary "full module access", so grant every allowed
 * action (incl. delete) to avoid regressing managers who relied on them.
 */
function legacyManagerGrants(perms?: LegacyManagerPerms): RolePermission[] {
  if (!perms) return [];
  const out: RolePermission[] = [];
  if (perms.finances) out.push({ resource: 'finances', actions: [...allowedFor('finances')] });
  if (perms.settings) out.push({ resource: 'settings', actions: [...allowedFor('settings')] });
  if (perms.managers) out.push({ resource: 'team', actions: [...allowedFor('team')] });
  if (perms.branches) out.push({ resource: 'branches', actions: [...allowedFor('branches')] });
  return out;
}

/** Roles with unrestricted access to everything. */
export const FULL_ACCESS_ROLES = ['super_admin', 'admin', 'owner'];

/** Build the complete `resource:action` set granting everything. */
export function fullPermissionSet(): Set<string> {
  const set = new Set<string>();
  for (const r of ALL_RESOURCES) {
    for (const a of RESOURCE_ACTIONS[r] || RBAC_ACTIONS) set.add(`${r}:${a}`);
  }
  return set;
}

/** Expand a role's permission array into a flat `resource:action` set. */
export function expandPermissions(permissions: RolePermission[] | undefined | null): Set<string> {
  const set = new Set<string>();
  (permissions || []).forEach(p => {
    (p.actions || []).forEach(a => set.add(`${p.resource}:${a}`));
  });
  return set;
}

/** Layer per-member overrides onto a resolved permission set (grants add, revokes remove). */
export function applyOverrides(base: Set<string>, overrides?: PermissionOverrides | null): Set<string> {
  if (!overrides || (!overrides.grants?.length && !overrides.revokes?.length)) return base;
  const out = new Set(base);
  (overrides.grants || []).forEach(p => (p.actions || []).forEach(a => out.add(`${p.resource}:${a}`)));
  (overrides.revokes || []).forEach(p => (p.actions || []).forEach(a => out.delete(`${p.resource}:${a}`)));
  return out;
}

/**
 * Resolve the effective permission set for a member.
 * Precedence: full-access role → assigned custom role → system-role default (+ legacy toggles),
 * then per-member overrides are layered on top (never for full-access roles).
 */
export function resolvePermissionSet(args: {
  baseRole?: string | null;
  customRole?: OrgRole | null;
  legacyManagerPerms?: LegacyManagerPerms;
  overrides?: PermissionOverrides | null;
}): Set<string> {
  const { baseRole, customRole, legacyManagerPerms, overrides } = args;
  // Full-access roles are unconditional — overrides can never restrict an owner/admin.
  if (baseRole && FULL_ACCESS_ROLES.includes(baseRole)) return fullPermissionSet();

  let base: Set<string>;
  if (customRole) {
    // An assigned custom role named like admin is treated as full access too.
    if (customRole.name?.trim().toLowerCase() === 'admin') return fullPermissionSet();
    base = expandPermissions(customRole.permissions);
  } else if (baseRole === 'teacher' || baseRole === 'mentor') {
    base = expandPermissions(TEACHER_DEFAULT);
  } else if (baseRole === 'manager') {
    base = expandPermissions([...MANAGER_DEFAULT, ...legacyManagerGrants(legacyManagerPerms)]);
  } else if (baseRole === 'student') {
    base = expandPermissions(STUDENT_DEFAULT);
  } else {
    base = new Set();
  }
  return applyOverrides(base, overrides);
}

/**
 * Compute the override delta between a member's role baseline and an edited effective set.
 * Both inputs are flat `resource:action` sets. Returns grants (added) and revokes (removed),
 * restricted to the given resource catalog so stray ids never persist.
 * Both arrays are always present (possibly empty), hence the Required<> return.
 */
export function diffOverrides(
  baseline: Set<string>,
  edited: Set<string>,
  resources: string[] = ALL_RESOURCES,
): Required<PermissionOverrides> {
  const grantsByRes: Record<string, RbacAction[]> = {};
  const revokesByRes: Record<string, RbacAction[]> = {};
  for (const resource of resources) {
    for (const action of (RESOURCE_ACTIONS[resource] || RBAC_ACTIONS)) {
      const key = `${resource}:${action}`;
      const inBase = baseline.has(key);
      const inEdit = edited.has(key);
      if (inEdit && !inBase) (grantsByRes[resource] ||= []).push(action);
      if (!inEdit && inBase) (revokesByRes[resource] ||= []).push(action);
    }
  }
  const toArr = (m: Record<string, RbacAction[]>): RolePermission[] =>
    Object.entries(m).map(([resource, actions]) => ({ resource, actions }));
  return { grants: toArr(grantsByRes), revokes: toArr(revokesByRes) };
}

/** Count granted actions across a role's permissions (for role cards). */
export function countPermissions(role: Pick<OrgRole, 'permissions'>): number {
  return (role.permissions || []).reduce((sum, p) => sum + (p.actions?.length || 0), 0);
}

/** A stable accent color per role, for badges/avatars. */
const ROLE_ACCENTS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
export function roleAccent(role: Pick<OrgRole, 'id' | 'name'>): string {
  const key = role.id || role.name || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ROLE_ACCENTS[hash % ROLE_ACCENTS.length];
}
