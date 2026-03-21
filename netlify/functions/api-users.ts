/**
 * API: Users — manage user profiles and roles.
 * 
 * GET    /api-users                 → list all users (admin only)
 * GET    /api-users?uid=<uid>       → get single user profile
 * PUT    /api-users                 → update user (role, displayName)
 * DELETE /api-users?uid=<uid>       → delete user (admin only)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET — list users or get single user
  if (event.httpMethod === 'GET') {
    if (params.uid) {
      const doc = await adminDb.collection('users').doc(params.uid).get();
      if (!doc.exists) return notFound('User not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    // List all users — admin/teacher only
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();
    const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
    const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return ok(users);
  }

  // PUT — update user profile/role
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    const targetUid = body.uid;
    if (!targetUid) return badRequest('uid required');

    // Only admin can change roles, or users can update their own profile
    if (targetUid !== user.uid && !hasRole(user, 'admin')) return forbidden();

    const updateData: any = {};
    if (body.displayName) updateData.displayName = body.displayName;
    if (body.role && hasRole(user, 'admin')) updateData.role = body.role;
    updateData.updatedAt = new Date().toISOString();

    await adminDb.collection('users').doc(targetUid).update(updateData);
    const updated = await adminDb.collection('users').doc(targetUid).get();
    return ok({ id: updated.id, ...updated.data() });
  }

  // DELETE — admin only
  if (event.httpMethod === 'DELETE') {
    if (!hasRole(user, 'admin')) return forbidden();
    const uid = params.uid;
    if (!uid) return badRequest('uid required');
    await adminDb.collection('users').doc(uid).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
