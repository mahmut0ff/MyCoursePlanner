/**
 * Auth middleware — verifies Firebase ID tokens, extracts user info + org context.
 * Multi-tenant aware: resolves role from membership (preferred) or legacy flat field.
 */
import { adminAuth, adminDb } from './firebase-admin';
import type { HandlerEvent } from '@netlify/functions';

export interface AuthUser {
  uid: string;
  email: string;
  role: 'super_admin' | 'admin' | 'teacher' | 'student';
  displayName: string;
  organizationId: string | null;
  planId: string | null;
  aiEnabled: boolean;
}

/**
 * Resolve user's role in a specific org via membership subcollection.
 */
export async function resolveOrgRole(uid: string, orgId: string): Promise<string | null> {
  const doc = await adminDb.collection('users').doc(uid)
    .collection('memberships').doc(orgId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.status !== 'active') return null;
  return data.role || null;
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

    // Resolve role: try membership first, fall back to flat field
    let role: AuthUser['role'] = (userData?.role as AuthUser['role']) || 'student';

    if (role !== 'super_admin' && organizationId) {
      const membershipRole = await resolveOrgRole(decoded.uid, organizationId);
      if (membershipRole) {
        // Map membership roles to AuthUser roles
        const roleMap: Record<string, AuthUser['role']> = {
          owner: 'admin',
          admin: 'admin',
          teacher: 'teacher',
          mentor: 'teacher',
          student: 'student',
        };
        role = roleMap[membershipRole] || role;
      }
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
  return ['super_admin', 'admin', 'teacher'].includes(user.role);
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
export const forbidden = () => jsonResponse(403, { error: 'Forbidden — insufficient role' });
export const badRequest = (msg: string) => jsonResponse(400, { error: msg });
export const notFound = (msg = 'Not found') => jsonResponse(404, { error: msg });
export const ok = (data: any) => jsonResponse(200, data);

