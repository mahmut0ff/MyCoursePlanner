/**
 * RBAC resolution — server mirror of src/lib/rbac.ts.
 * Keep resource ids in sync with the client catalog.
 */

export type RbacAction = 'read' | 'write' | 'delete';

export interface RolePermission {
  resource: string;
  actions: RbacAction[];
}

/** Per-member overrides layered on top of a resolved role (grants add, revokes remove). */
export interface PermissionOverrides {
  grants?: RolePermission[];
  revokes?: RolePermission[];
}

export interface LegacyManagerPerms {
  finances?: boolean;
  settings?: boolean;
  managers?: boolean;
  branches?: boolean;
}

export const FULL_ACCESS_ROLES = ['super_admin', 'admin', 'owner'];

// Resource id → allowed actions. Read-only screens restrict to ['read'].
export const RESOURCE_ACTIONS: Record<string, RbacAction[]> = {
  students: ['read', 'write', 'delete'],
  teachers: ['read', 'write', 'delete'],
  team: ['read', 'write', 'delete'],
  leads: ['read', 'write', 'delete'],
  courses: ['read', 'write', 'delete'],
  groups: ['read', 'write', 'delete'],
  lessons: ['read', 'write', 'delete'],
  materials: ['read', 'write', 'delete'],
  schedule: ['read', 'write', 'delete'],
  exams: ['read', 'write', 'delete'],
  rooms: ['read', 'write', 'delete'],
  quizzes: ['read', 'write', 'delete'],
  gradebook: ['read', 'write', 'delete'],
  homework: ['read', 'write', 'delete'],
  results: ['read'],
  ai: ['read', 'write'],
  finances: ['read', 'write', 'delete'],
  payroll: ['read', 'write', 'delete'],
  certificates: ['read', 'write', 'delete'],
  branches: ['read', 'write', 'delete'],
  analytics: ['read'],
  dashboard: ['read'],
  settings: ['read', 'write'],
};

export const ALL_RESOURCES = Object.keys(RESOURCE_ACTIONS);

const allowedFor = (r: string): RbacAction[] => (RESOURCE_ACTIONS[r] || ['read', 'write', 'delete']);
const rwd = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: [...allowedFor(r)] }));
const rw = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: allowedFor(r).filter(a => a !== 'delete') }));
const ro = (resources: string[]): RolePermission[] =>
  resources.map(r => ({ resource: r, actions: ['read' as RbacAction] }));

export const TEACHER_DEFAULT: RolePermission[] = [
  ...ro(['dashboard', 'students', 'results', 'analytics']),
  ...rw(['courses', 'groups', 'schedule']),
  ...rwd(['lessons', 'exams', 'rooms', 'quizzes', 'materials', 'homework', 'gradebook']),
];

export const MANAGER_DEFAULT: RolePermission[] = [
  ...ro(['dashboard', 'analytics', 'results']),
  ...rw(['ai']),
  ...rwd(['students', 'teachers', 'leads', 'courses', 'groups', 'lessons', 'materials', 'schedule', 'exams', 'rooms', 'quizzes', 'gradebook', 'homework', 'certificates']),
];

export const STUDENT_DEFAULT: RolePermission[] = ro(['dashboard', 'lessons', 'results']);

// Legacy toggles were binary "full module access" → grant every allowed action.
function legacyManagerGrants(perms?: LegacyManagerPerms): RolePermission[] {
  if (!perms) return [];
  const out: RolePermission[] = [];
  if (perms.finances) out.push({ resource: 'finances', actions: [...allowedFor('finances')] });
  if (perms.settings) out.push({ resource: 'settings', actions: [...allowedFor('settings')] });
  if (perms.managers) out.push({ resource: 'team', actions: [...allowedFor('team')] });
  if (perms.branches) out.push({ resource: 'branches', actions: [...allowedFor('branches')] });
  return out;
}

export function fullPermissionSet(): Set<string> {
  const set = new Set<string>();
  for (const r of ALL_RESOURCES) for (const a of RESOURCE_ACTIONS[r]) set.add(`${r}:${a}`);
  return set;
}

export function expandPermissions(permissions?: RolePermission[] | null): Set<string> {
  const set = new Set<string>();
  (permissions || []).forEach(p => (p.actions || []).forEach(a => set.add(`${p.resource}:${a}`)));
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
 * Resolve a member's effective permission set.
 * Precedence: full-access base role → assigned custom role → system default (+ legacy toggles),
 * then per-member overrides are layered on top (never for full-access roles).
 */
export function resolvePermissionSet(args: {
  baseRole?: string | null;
  customRole?: { name?: string; permissions?: RolePermission[] } | null;
  legacyManagerPerms?: LegacyManagerPerms;
  overrides?: PermissionOverrides | null;
}): Set<string> {
  const { baseRole, customRole, legacyManagerPerms, overrides } = args;
  if (baseRole && FULL_ACCESS_ROLES.includes(baseRole)) return fullPermissionSet();
  let base: Set<string>;
  if (customRole) {
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

/** Validate & normalize an incoming overrides object against the catalog. */
export function sanitizeOverrides(input: any): PermissionOverrides {
  return {
    grants: sanitizePermissions(input?.grants),
    revokes: sanitizePermissions(input?.revokes),
  };
}

/** Derive the legacy 4 manager booleans from a granular set (backward compat). */
export function deriveLegacyManagerPerms(set: Set<string>): { finances: boolean; settings: boolean; managers: boolean; branches: boolean } {
  return {
    finances: set.has('finances:read'),
    settings: set.has('settings:read'),
    managers: set.has('team:read'),
    branches: set.has('branches:read'),
  };
}

/** Validate & normalize an incoming permissions array against the catalog. */
export function sanitizePermissions(input: any): RolePermission[] {
  if (!Array.isArray(input)) return [];
  const out: RolePermission[] = [];
  for (const p of input) {
    if (!p || typeof p.resource !== 'string') continue;
    const allowed = RESOURCE_ACTIONS[p.resource];
    if (!allowed) continue;
    const actions = Array.isArray(p.actions)
      ? (p.actions.filter((a: any) => allowed.includes(a)) as RbacAction[])
      : [];
    if (actions.length) out.push({ resource: p.resource, actions });
  }
  return out;
}
