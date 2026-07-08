/**
 * Auth middleware — verifies Firebase ID tokens, extracts user info + org context.
 * Multi-tenant aware: resolves role from membership (preferred) or legacy flat field.
 */
import { adminAuth, adminDb } from './firebase-admin';
import type { HandlerEvent } from '@netlify/functions';
import { resolvePermissionSet, deriveLegacyManagerPerms, fullPermissionSet, FULL_ACCESS_ROLES } from './rbac';

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
export async function resolveOrgRole(uid: string, orgId: string): Promise<{ role: string | null; roles: string[]; roleId: string | null; branchIds: string[]; primaryBranchId: string | null; permissions: ManagerPermissions }> {
  const data = await getMembershipData(uid, orgId);
  if (!data || data.status !== 'active') return { role: null, roles: [], roleId: null, branchIds: [], primaryBranchId: null, permissions: { ...DEFAULT_MANAGER_PERMISSIONS } };
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
        const active = userData?.activeRole as AuthUser['role'] | undefined;
        role = active && allowedRoles.includes(active) ? active : primaryRole;
      }
      branchIds = membership.branchIds;
      primaryBranchId = membership.primaryBranchId;
      customRoleId = membership.roleId;

      // Resolve the assigned custom role (if any) to build the granular grant set.
      let customRole: { name?: string; permissions?: any[] } | null = null;
      if (membership.roleId && !FULL_ACCESS_ROLES.includes(role)) {
        try {
          const roleDoc = await adminDb.collection('organizations').doc(organizationId)
            .collection('roles').doc(membership.roleId).get();
          if (roleDoc.exists) {
            const rd = roleDoc.data()!;
            customRole = { name: rd.name, permissions: rd.permissions };
          }
        } catch { /* fall through to system defaults */ }
      }

      rbac = resolvePermissionSet({ baseRole: role, customRole, legacyManagerPerms: membership.permissions });
      // Keep the legacy 4-toggle view in sync so existing hasPermission() callers still work.
      permissions = customRole
        ? deriveLegacyManagerPerms(rbac)
        : membership.permissions;
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
 * Check if a manager has a specific module permission.
 * Admin/owner/super_admin always return true. Teachers/students always false.
 */
export function hasPermission(user: AuthUser, key: keyof ManagerPermissions): boolean {
  if (isSuperAdmin(user) || hasRole(user, 'admin')) return true;
  if (user.role !== 'manager') return false;
  return user.permissions[key] === true;
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
 */
export function resolveBranchFilter(user: AuthUser, requestedBranchId?: string | null): string | null | string[] {
  // Admins and super_admins can see everything or filter by choice
  if (isSuperAdmin(user) || hasRole(user, 'admin')) {
    return requestedBranchId || null;
  }
  // Users with no branch assignments see org-wide data
  if (user.branchIds.length === 0) {
    return null;
  }
  // If a specific branch was requested, validate access
  if (requestedBranchId) {
    if (user.branchIds.includes(requestedBranchId)) return requestedBranchId;
    return '__DENIED__'; // sentinel: will result in empty query
  }
  // Default: scope to user's assigned branches
  if (user.branchIds.length === 1) return user.branchIds[0];
  return user.branchIds; // array for multi-branch scope
}
