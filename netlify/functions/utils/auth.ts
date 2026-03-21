/**
 * Auth middleware — verifies Firebase ID tokens and extracts user info.
 */
import { adminAuth, adminDb } from './firebase-admin';
import type { HandlerEvent } from '@netlify/functions';

export interface AuthUser {
  uid: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  displayName: string;
}

/**
 * Verify the Firebase ID token from the Authorization header.
 * Returns the authenticated user with their Firestore role, or null.
 */
export async function verifyAuth(event: HandlerEvent): Promise<AuthUser | null> {
  try {
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    // Fetch role from Firestore
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    return {
      uid: decoded.uid,
      email: decoded.email || '',
      role: (userData?.role as AuthUser['role']) || 'student',
      displayName: userData?.displayName || decoded.name || '',
    };
  } catch (e) {
    console.error('Auth verification failed:', e);
    return null;
  }
}

/**
 * Checks if user has one of the allowed roles.
 */
export function hasRole(user: AuthUser, ...roles: AuthUser['role'][]): boolean {
  return roles.includes(user.role);
}

/**
 * Standard JSON response helpers.
 */
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
