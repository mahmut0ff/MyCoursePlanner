/**
 * Auth middleware — verifies Firebase ID tokens, extracts user info + org context.
 * Multi-tenant aware: resolves role from membership (preferred) or legacy flat field.
 */
import { adminAuth, adminDb } from './firebase-admin';
import type { HandlerEvent } from '@netlify/functions';
import { resolvePermissionSet, deriveLegacyManagerPerms, fullPermissionSet, FULL_ACCESS_ROLES } from './rbac';
import type { PermissionOverrides } from './rbac';

export interface ManagerPermissions {
  finances: boolean;
  settings: boolean;
  managers: boolean;
  branches: boolean;
}

export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions = {
  finances: false,
  settings: false,
  managers: false,
  branches: false,
};

export interface AuthUser {
  uid: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'teacher' | 'student';
  displayName: string;
  organizationId: string | null;
  planId: string | null;
  aiEnabled: boolean;
  branchIds: string[];               // assigned branches from membership
  primaryBranchId: string | null;    // default branch context
  permissions: ManagerPermissions;    // legacy 4-toggle view (derived from rbac for back-compat)
  customRoleId: string | null;        // assigned custom RBAC role id (if any)
  rbac: Set<string>;                  // resolved "resource:action" grants
}

/**
 * Read a user's membership doc in an org. Prefers the user-side doc
 * (users/{uid}/memberships/{orgId}); when it's missing, falls back to the
 * org-side mirror (orgMembers/{orgId}/members/{uid}) — staff created by the
 * org before the dual-write fix (e.g. managers) only got the mirror doc —
 * and backfills the user-side doc so the next look-up finds it directly.
 */
export async function getMembershipData(uid: string, orgId: string): Promise<Record<string, any> | null> {
  const userSide = await adminDb.collection('users').doc(uid)
    .collection('memberships').doc(orgId).get();
  if (userSide.exists) return userSide.data()!;

  const orgSide = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members').doc(uid).get();
  if (!orgSide.exists) return null;
  const data = orgSide.data()!;
  await adminDb.collection('users').doc(uid)
    .collection('memberships').doc(orgId)
    .set({ ...data, organizationId: orgId }, { merge: true })
    .catch(() => {});
  return data;
}

/**
 * Resolve user's role in a specific org via membership subcollection.
 */
export async function resolveOrgRole(uid: string, orgId: string): Promise<{ role: string | null; roles: string[]; roleId: string | null; branchIds: string[]; primaryBranchId: string | null; permissions: ManagerPermissions; overrides: PermissionOverrides | null }> {
  const data = await getMembershipData(uid, orgId);
  if (!data || data.status !== 'active') return { role: null, roles: [], roleId: null, branchIds: [], primaryBranchId: null, permissions: { ...DEFAULT_MANAGER_PERMISSIONS }, overrides: null };
  const rawOverrides = data.permissionOverrides;
  const overrides: PermissionOverrides | null = rawOverrides && (rawOverrides.grants?.length || rawOverrides.revokes?.length)
    ? { grants: rawOverrides.grants || [], revokes: rawOverrides.revokes || [] }
    : null;
  return {
    role: data.role || null,
    // Multi-role members carry a `roles` array; fall back to the single `role` for legacy docs.
    roles: Array.isArray(data.roles) && data.roles.length ? data.roles : (data.role ? [data.role] : []),
    roleId: data.roleId || null,
    branchIds: data.branchIds || [],
    primaryBranchId: data.primaryBranchId || null,
    permissions: {
      finances: data.permissions?.finances === true,
      settings: data.permissions?.settings === true,
      managers: data.permissions?.managers === true,
      branches: data.permissions?.branches === true,
    },
    overrides,
  };
}

/**
 * Verify the Firebase ID token from the Authorization header.
 * Resolves role from membership (preferred) then falls back to flat user.role.
 */
export async function verifyAuth(event: HandlerEvent): Promise<AuthUser | null> {
  try {
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // Determine org context: prefer activeOrgId, fall back to legacy organizationId
    const organizationId = userData?.activeOrgId || userData?.organizationId || null;

    // Resolve role + branch context: try membership first, fall back to flat field
    let role: AuthUser['role'] = (userData?.role as AuthUser['role']) || 'student';
    let branchIds: string[] = [];
    let primaryBranchId: string | null = null;
    let permissions: ManagerPermissions = { ...DEFAULT_MANAGER_PERMISSIONS };
    let customRoleId: string | null = null;
    let rbac: Set<string> = new Set();

    if (role !== 'super_admin' && organizationId) {
      const membership = await resolveOrgRole(decoded.uid, organizationId);
      customRoleId = membership.roleId;

      // Resolve the assigned custom role once — we need its base role (which becomes a
      // switchable app role) as well as its granular permission set.
      let customRole: { name?: string; baseRole?: string; permissions?: any[] } | null = null;
      if (membership.roleId) {
        try {
          const roleDoc = await adminDb.collection('organizations').doc(organizationId)
            .collection('roles').doc(membership.roleId).get();
          if (roleDoc.exists) {
            const rd = roleDoc.data()!;
            customRole = { name: rd.name, baseRole: rd.baseRole, permissions: rd.permissions };
          }
        } catch { /* fall through to system defaults */ }
      }

      if (membership.role) {
        // Map membership roles to AuthUser roles
        const roleMap: Record<string, AuthUser['role']> = {
          owner: 'admin',
          admin: 'admin',
          manager: 'manager',
          teacher: 'teacher',
          mentor: 'teacher',
          student: 'student',
        };
        const primaryRole = roleMap[membership.role] || role;
        // Multi-role: honor the user's chosen active role ONLY if it's one the
        // membership actually grants. Otherwise fall back to the primary role.
        // This is the server-side guard against privilege escalation.
        const allowedRoles = membership.roles.map((r) => roleMap[r] || r);
        // An assigned custom role's base role is also a valid role to switch into.
        if (customRole?.baseRole) {
          const mappedBase = roleMap[customRole.baseRole] || (customRole.baseRole as AuthUser['role']);
          if (!allowedRoles.includes(mappedBase)) allowedRoles.push(mappedBase);
        }
        const active = userData?.activeRole as AuthUser['role'] | undefined;
        role = active && allowedRoles.includes(active) ? active : primaryRole;
      }
      branchIds = membership.branchIds;
      primaryBranchId = membership.primaryBranchId;

      // Layer the custom role's grants only when the active role isn't full-access
      // (admins/owners get everything anyway).
      const effectiveCustomRole = (membership.roleId && !FULL_ACCESS_ROLES.includes(role)) ? customRole : null;
      rbac = resolvePermissionSet({ baseRole: role, customRole: effectiveCustomRole, legacyManagerPerms: membership.permissions, overrides: membership.overrides });
      // Keep the legacy 4-toggle view in sync so existing hasPermission() callers still work.
      // Always derived from the resolved set: the legacy toggles are already folded into
      // `rbac` for a plain manager, so this round-trips for them — while a member whose
      // finances/branches grant arrives via a custom role or a per-member override finally
      // shows up here too (and a revoke correctly subtracts).
      permissions = deriveLegacyManagerPerms(rbac);
    }

    // Super admins and org admins/owners get unrestricted grants.
    if (role === 'super_admin' || FULL_ACCESS_ROLES.includes(role)) {
      rbac = fullPermissionSet();
      permissions = { finances: true, settings: true, managers: true, branches: true };
    } else if (rbac.size === 0) {
      // No active org membership (e.g. independent teacher/student with personal
      // content, or flat-role fallback) — resolve grants from the base role so
      // personal-content endpoints still authorize under can().
      rbac = resolvePermissionSet({ baseRole: role, legacyManagerPerms: permissions });
    }

    // Fetch org plan info for feature gating
    let planId: string | null = null;
    let aiEnabled = false;
    if (organizationId) {
      const orgDoc = await adminDb.collection('organizations').doc(organizationId).get();
      if (orgDoc.exists) {
        planId = orgDoc.data()?.planId || null;
        aiEnabled = planId === 'professional' || planId === 'enterprise';
      }
    }

    return {
      uid: decoded.uid,
      email: decoded.email || '',
      role,
      displayName: userData?.displayName || decoded.name || '',
      organizationId,
      planId,
      aiEnabled,
      branchIds,
      primaryBranchId,
      permissions,
      customRoleId,
      rbac,
    };
  } catch (e) {
    console.error('Auth verification failed:', e);
    return null;
  }
}

/**
 * Granular RBAC check: does the user have `resource:action`?
 * Super admins / org admins / owners always pass.
 */
export function can(user: AuthUser, resource: string, action: 'read' | 'write' | 'delete' = 'read'): boolean {
  if (isSuperAdmin(user) || hasRole(user, 'admin')) return true;
  return user.rbac?.has(`${resource}:${action}`) === true;
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === 'super_admin';
}

export function isStaff(user: AuthUser): boolean {
  return ['super_admin', 'admin', 'manager', 'teacher'].includes(user.role);
}

export function isManager(user: AuthUser): boolean {
  return user.role === 'manager';
}

export function hasRole(user: AuthUser, ...roles: AuthUser['role'][]): boolean {
  return roles.includes(user.role);
}

/**
 * Legacy module-permission check, kept for older call sites.
 * Backed by the granular grant set so a custom role or a per-member override can
 * satisfy it — gating on `role === 'manager'` used to make those grants unusable.
 * Prefer can(user, resource, action) in new code.
 */
const LEGACY_PERMISSION_RESOURCE: Record<keyof ManagerPermissions, string> = {
  finances: 'finances',
  settings: 'settings',
  managers: 'team',
  branches: 'branches',
};

export function hasPermission(user: AuthUser, key: keyof ManagerPermissions): boolean {
  if (isSuperAdmin(user) || hasRole(user, 'admin')) return true;
  if (can(user, LEGACY_PERMISSION_RESOURCE[key], 'read')) return true;
  // Back-compat tail: an AuthUser assembled without a resolved grant set still
  // answers from the raw toggles, exactly as before.
  return user.role === 'manager' && user.permissions[key] === true;
}

/**
 * Get org-scoped query base. Super admins can see all.
 */
export function getOrgFilter(user: AuthUser): string | null {
  if (isSuperAdmin(user)) return null; // no filter
  return user.organizationId;
}

// ---- CORS Origin Whitelist ----
const ALLOWED_ORIGINS = [
  'https://planula.netlify.app',
  'https://planula-staging.netlify.app',
  process.env.URL,       // Netlify injects the site URL
  process.env.DEPLOY_URL, // Netlify deploy preview URL
  'http://localhost:5173', // Local dev
  'http://localhost:8888', // Netlify CLI dev
].filter(Boolean) as string[];

function getAllowedOrigin(requestOrigin?: string): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // Allow any custom domain configured via env
  const customDomain = process.env.CUSTOM_DOMAIN;
  if (customDomain && requestOrigin.includes(customDomain)) return requestOrigin;
  return ALLOWED_ORIGINS[0]; // fallback — browser will block if mismatch
}

export const jsonResponse = (statusCode: number, body: any, requestOrigin?: string) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  },
  body: JSON.stringify(body),
});

export const unauthorized = () => jsonResponse(401, { error: 'Unauthorized' });
export const forbidden = (msg = 'Forbidden — insufficient role') => jsonResponse(403, { error: msg });
export const badRequest = (msg: string) => jsonResponse(400, { error: msg });
export const notFound = (msg = 'Not found') => jsonResponse(404, { error: msg });
export const ok = (data: any) => jsonResponse(200, data);

/**
 * Persists severe security anomalies indicating cross-tenant abuse attempts.
 */
export const logSecurityAudit = async (user: AuthUser | null, event: HandlerEvent, action: string, details: any) => {
  try {
    await adminDb.collection('auditLogs').add({
      timestamp: new Date().toISOString(),
      action,
      uid: user?.uid || 'anonymous',
      userRole: user?.role || 'none',
      organizationId: user?.organizationId || null,
      method: event.httpMethod,
      path: event.path,
      ip: event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown',
      details
    });
  } catch (e) {
    console.error('Failed to write audit log', e);
  }
};

// ---- Branch scope helpers ----

/**
 * Check if user has access to a specific branch.
 * Admin/Owner: access all branches. Manager/Teacher: only assigned branches.
 * Students: only assigned branches (if any).
 * Users with empty branchIds: treated as org-wide (access all).
 */
export function userHasBranchAccess(user: AuthUser, branchId: string): boolean {
  if (isSuperAdmin(user) || hasRole(user, 'admin')) return true;
  if (user.branchIds.length === 0) return true; // unassigned = org-wide
  return user.branchIds.includes(branchId);
}

/**
 * Returns forbidden response if user lacks branch access.
 * Returns null if access is granted.
 */
export function requireBranchScope(user: AuthUser, branchId: string | undefined | null): ReturnType<typeof forbidden> | null {
  if (!branchId) return null; // entity is org-wide, always accessible
  if (userHasBranchAccess(user, branchId)) return null;
  return forbidden('Access denied: branch scope violation');
}

/**
 * Resolves which branchId filter to apply for list queries.
 * - admin/owner + no filter requested → null (show all)
 * - admin/owner + filter requested → requested branchId
 * - manager/teacher → forced to their branchIds (or requested if subset)
 * - student → their branchIds if any, else null (org-wide)
 *
 * A requested branch always *narrows* — it can never widen someone's scope — so it
 * is honoured for every role. Ignoring it for org-wide members is what used to make
 * the branch filter a no-op for anyone who isn't an admin.
 */
export function resolveBranchFilter(user: AuthUser, requestedBranchId?: string | null): string | null | string[] {
  // Admins and super_admins can see everything or filter by choice
  if (isSuperAdmin(user) || hasRole(user, 'admin')) {
    return requestedBranchId || null;
  }
  // Users with no branch assignments see org-wide data — but still honour an
  // explicitly requested branch, otherwise their UI filter does nothing.
  if (user.branchIds.length === 0) {
    return requestedBranchId || null;
  }
  // If a specific branch was requested, validate access
  if (requestedBranchId) {
    if (user.branchIds.includes(requestedBranchId)) return requestedBranchId;
    return '__DENIED__'; // sentinel: will result in empty query
  }
  // Default: scope to user's assigned branches. Always the array form, even for a
  // single branch — callers treat a bare string as "this exact branch was asked for"
  // and drop org-wide (branchId: null) entities, which would hide every shared
  // course/group/event from a one-branch member.
  return user.branchIds;
}

/**
 * Applies a resolveBranchFilter() result to one member's branch assignment.
 *
 * Callers used to hand-roll this three-way match (string / array / null) at each
 * call site, which is how api-risk ended up with no branch filter at all while
 * the students list had one — the same roster, two different answers.
 *
 * `'__DENIED__'` must be handled by the caller (return an empty list) before
 * calling this.
 */
export function memberInBranchScope(
  memberBranchIds: string[] | undefined | null,
  scope: string | null | string[],
): boolean {
  if (scope === null || scope === '__DENIED__') return scope === null;
  const ids = Array.isArray(memberBranchIds) ? memberBranchIds : [];
  if (typeof scope === 'string') return ids.includes(scope);
  // Array form = "the branches this member may see". An unassigned member is
  // org-wide and stays visible, mirroring userHasBranchAccess().
  return ids.length === 0 || ids.some(id => scope.includes(id));
}

/**
 * Applies a resolveBranchFilter() result to a single record that carries ONE
 * `branchId` (finance transactions, payment plans) — the money-record twin of
 * memberInBranchScope() — but deliberately NOT its "unassigned = org-wide"
 * semantics.
 *
 * A record with no branchId is UNATTRIBUTED money, not org-wide money, and it is
 * excluded whenever a filter is active — both for an explicitly requested branch
 * and for a member restricted to branchIds[]. Two reasons this has to be strict:
 *  - project invariant "specific branch = strict match": including branch-less
 *    rows in every branch made branch A total = branch B total = org total, and
 *    A + B wildly exceeded the org total;
 *  - a member scoped to one branch would otherwise read the whole legacy
 *    branch-less ledger they were never granted.
 * The excluded bucket is not hidden: api-finance-metrics reports it explicitly
 * as unassignedBranchIncome / unassignedBranchExpense so the UI can label it
 * "не привязано к филиалу", which is honest in a way that smearing the same
 * money across every branch never was.
 *
 * `'__DENIED__'` should be handled by the caller (403 / empty list) first.
 */
export function recordInBranchScope(
  recordBranchId: string | null | undefined,
  scope: string | null | string[],
): boolean {
  if (scope === null) return true;
  if (scope === '__DENIED__') return false;
  // Empty array = no branches assigned = nothing to narrow by; keep everything.
  if (Array.isArray(scope) && scope.length === 0) return true;
  if (!recordBranchId) return false; // unattributed — excluded under any active filter
  if (typeof scope === 'string') return recordBranchId === scope;
  return scope.includes(recordBranchId);
}

/**
 * A member "holds" an app role if it's their primary `role` OR appears in their
 * multi-role `roles[]` set, so a multi-role member (e.g. teacher + student)
 * shows up under every list they belong to. Falls back to the single `role`
 * field for legacy members that have no `roles` array.
 */
export function memberHoldsRole(m: { role?: string; roles?: string[] }, wanted: string[]): boolean {
  const held = new Set<string>([m.role, ...(Array.isArray(m.roles) ? m.roles : [])].filter(Boolean) as string[]);
  return wanted.some(r => held.has(r));
}
