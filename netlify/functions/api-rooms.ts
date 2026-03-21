/**
 * API: Rooms — exam room management.
 *
 * GET    /api-rooms                      → list rooms (active for students, all for staff)
 * GET    /api-rooms?id=<id>              → get single room
 * GET    /api-rooms?code=<code>          → find room by join code
 * POST   /api-rooms                      → create room (admin/teacher)
 * POST   /api-rooms (action=join)        → student joins room
 * POST   /api-rooms (action=close)       → close room (admin/teacher)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'examRooms';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    // Get by ID
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Room not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    // Find by join code
    if (params.code) {
      const snap = await adminDb.collection(COLLECTION)
        .where('code', '==', params.code.toUpperCase())
        .where('status', '==', 'active')
        .limit(1).get();
      if (snap.empty) return notFound('Room not found or closed');
      const doc = snap.docs[0];
      return ok({ id: doc.id, ...doc.data() });
    }

    // List rooms
    if (hasRole(user, 'admin', 'teacher')) {
      const snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } else {
      const snap = await adminDb.collection(COLLECTION)
        .where('status', '==', 'active').orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
  }

  // POST — create, join, or close
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    // JOIN room
    if (body.action === 'join') {
      if (!body.roomId) return badRequest('roomId required');
      const roomRef = adminDb.collection(COLLECTION).doc(body.roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound('Room not found');
      if (roomDoc.data()?.status !== 'active') return badRequest('Room is closed');

      const participants: string[] = roomDoc.data()?.participants || [];
      if (!participants.includes(user.uid)) {
        await roomRef.update({ participants: [...participants, user.uid] });
      }
      return ok({ joined: true });
    }

    // CLOSE room
    if (body.action === 'close') {
      if (!hasRole(user, 'admin', 'teacher')) return forbidden();
      if (!body.roomId) return badRequest('roomId required');
      await adminDb.collection(COLLECTION).doc(body.roomId).update({
        status: 'closed',
        closedAt: new Date().toISOString(),
      });
      return ok({ closed: true });
    }

    // CREATE room
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();
    if (!body.examId || !body.examTitle) return badRequest('examId and examTitle required');

    const now = new Date().toISOString();
    const data = {
      examId: body.examId,
      examTitle: body.examTitle,
      code: generateCode(),
      status: 'active',
      hostId: user.uid,
      hostName: user.displayName,
      participants: [],
      createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
