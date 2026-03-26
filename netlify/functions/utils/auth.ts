/**
 * Auth middleware — verifies Firebase ID tokens, extracts user info + org context.
 * Multi-tenant aware: resolves role from membership (preferred) or legacy flat field.
 */
import { adminAuth, adminDb } from './firebase-admin';
import type { HandlerEvent } from '@netlify/functions';

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
}

/**
 * Resolve user's role in a specific org via membership subcollection.
 */
export async function resolveOrgRole(uid: string, orgId: string): Promise<{ role: string | null; branchIds: string[]; primaryBranchId: string | null }> {
  const doc = await adminDb.collection('users').doc(uid)
    .collection('memberships').doc(orgId).get();
  if (!doc.exists) return { role: null, branchIds: [], primaryBranchId: null };
  const data = doc.data()!;
  if (data.status !== 'active') return { role: null, branchIds: [], primaryBranchId: null };
  return {
    role: data.role || null,
    branchIds: data.branchIds || [],
    primaryBranchId: data.primaryBranchId || null,
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
        role = roleMap[membership.role] || role;
      }
      branchIds = membership.branchIds;
      primaryBranchId = membership.primaryBranchId;
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
    };
  } catch (e) {
    console.error('Auth verification failed:', e);
    return null;
  }
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
 * Get org-scoped query base. Super admins can see all.
 */
export function getOrgFilter(user: AuthUser): string | null {
  if (isSuperAdmin(user)) return null; // no filter
  return user.organizationId;
}

// ---- Response helpers ----

export const jsonResponse = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
