/**
 * API: Migration — one-time data migration from flat user model to membership model.
 *
 * POST /api-migration?action=createMemberships → creates membership docs for all users
 * 
 * SUPER ADMIN ONLY. Run once to backfill membership collections.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isSuperAdmin(user)) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  if (action === 'createMemberships') {
    const usersSnap = await adminDb.collection('users').get();
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const uid = userDoc.id;
      const orgId = data.organizationId;

      if (!orgId) { skipped++; continue; }

      try {
        // Check if membership already exists
        const existing = await adminDb.collection('users').doc(uid)
          .collection('memberships').doc(orgId).get();
        if (existing.exists) { skipped++; continue; }

        // Map role to membership role
        const roleMap: Record<string, string> = {
          admin: 'admin',
          teacher: 'teacher',
          student: 'student',
        };

        // Check if user is org owner
        const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
        const isOwner = orgDoc.exists && orgDoc.data()?.ownerId === uid;

        const membershipRole = isOwner ? 'owner' : (roleMap[data.role] || 'student');
        const now = new Date().toISOString();

        const membershipData = {
          userId: uid,
          userEmail: data.email || '',
          userName: data.displayName || '',
          organizationId: orgId,
          organizationName: data.organizationName || '',
          role: membershipRole,
          status: 'active',
          joinMethod: 'direct_added',
          joinedAt: data.createdAt || now,
          createdAt: now,
          updatedAt: now,
        };

        // Write to both collections
        await adminDb.collection('users').doc(uid)
          .collection('memberships').doc(orgId).set(membershipData);
        await adminDb.collection('orgMembers').doc(orgId)
          .collection('members').doc(uid).set(membershipData);

        // Set activeOrgId
        await adminDb.collection('users').doc(uid).update({
          activeOrgId: orgId,
        });

        // Set org as public by default
        if (orgDoc.exists && orgDoc.data()?.isPublic === undefined) {
          await adminDb.collection('organizations').doc(orgId).update({
            isPublic: true,
          });
        }

        migrated++;
      } catch (e: any) {
        errors.push(`${uid}: ${e.message}`);
      }
    }

    return ok({
      migrated,
      skipped,
      total: usersSnap.size,
      errors: errors.slice(0, 20),
    });
  }

  return jsonResponse(400, { error: 'Unknown action. Use: createMemberships' });
};

export { handler };
