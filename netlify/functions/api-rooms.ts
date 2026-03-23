/**
 * API: Rooms — exam room management (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { notifyOrgStudents } from './utils/notifications';

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
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Room not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    if (params.code) {
      const snap = await adminDb.collection(COLLECTION)
        .where('code', '==', params.code.toUpperCase())
        .where('status', '==', 'active').limit(1).get();
      if (snap.empty) return notFound('Room not found or closed');
      return ok({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }

    const orgFilter = getOrgFilter(user);
    let snap;
    if (isStaff(user)) {
      snap = orgFilter
        ? await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').get()
        : await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    } else {
      snap = await adminDb.collection(COLLECTION).where('status', '==', 'active').orderBy('createdAt', 'desc').get();
    }
    return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  }

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

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

    if (body.action === 'close') {
      if (!isStaff(user)) return forbidden();
      if (!body.roomId) return badRequest('roomId required');
      await adminDb.collection(COLLECTION).doc(body.roomId).update({ status: 'closed', closedAt: new Date().toISOString() });
      return ok({ closed: true });
    }

    if (!isStaff(user)) return forbidden();
    if (!body.examId || !body.examTitle) return badRequest('examId and examTitle required');
    const now = new Date().toISOString();
    const data = {
      examId: body.examId, examTitle: body.examTitle, code: generateCode(),
      status: 'active', hostId: user.uid, hostName: user.displayName,
      participants: [], organizationId: user.organizationId || '', createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    // Notify org students about new exam room
    if (user.organizationId) {
      notifyOrgStudents(
        user.organizationId, 'exam_room_created',
        'Новая комната экзамена',
        `Комната для «${body.examTitle}» открыта (${data.code})`,
        '/rooms',
      ).catch(() => {});
    }
    return ok({ id: ref.id, ...data });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
