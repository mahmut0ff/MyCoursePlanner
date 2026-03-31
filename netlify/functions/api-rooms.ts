/**
 * API: Rooms — exam room management (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, logSecurityAudit } from './utils/auth';
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
    // Add isSuperAdmin from utils/auth
    const { isSuperAdmin } = require('./utils/auth');

    let snap;
    if (isStaff(user)) {
      if (isSuperAdmin(user)) {
        snap = await adminDb.collection(COLLECTION).get();
      } else if (orgFilter) {
        snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).get();
      } else {
        // independent teacher
        const snap1 = await adminDb.collection(COLLECTION).where('hostId', '==', user.uid).where('organizationId', '==', null).get();
        const snap2 = await adminDb.collection(COLLECTION).where('hostId', '==', user.uid).where('organizationId', '==', '').get();
        const allDocs = [...snap1.docs, ...snap2.docs].reduce((acc, curr) => {
          if (!acc.some(d => d.id === curr.id)) acc.push(curr);
          return acc;
        }, [] as any[]);
        
        const results = allDocs.map(d => ({ id: d.id, ...d.data() }));
        results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        return ok(results);
      }
    } else {
      if (!orgFilter) return ok([]); // Students must have an org to see rooms
      snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).where('status', '==', 'active').get();
    }
    const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    results.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return ok(results);
  }

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'join') {
      if (!body.roomId) return badRequest('roomId required');
      const roomRef = adminDb.collection(COLLECTION).doc(body.roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound('Room not found');
      const roomData = roomDoc.data()!;
      if (roomData.status !== 'active') return badRequest('Room is closed');
      // The user successfully supplied the code earlier to get the UI, so we allow joining.
      // (Removed strict org check to allow external/independent teacher exams)
      const participants: string[] = roomData.participants || [];
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
