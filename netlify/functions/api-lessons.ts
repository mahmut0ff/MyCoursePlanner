/**
 * API: Lessons — CRUD for lesson plans.
 *
 * GET    /api-lessons               → list all lesson plans
 * GET    /api-lessons?id=<id>       → get single lesson
 * POST   /api-lessons               → create lesson (admin/teacher)
 * PUT    /api-lessons               → update lesson (admin/teacher)
 * DELETE /api-lessons?id=<id>       → delete lesson (admin/teacher)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'lessonPlans';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Lesson not found');
      return ok({ id: doc.id, ...doc.data() });
    }
    const snapshot = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    return ok(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // Staff-only for writes
  if (!hasRole(user, 'admin', 'teacher')) return forbidden();

  // POST — create
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.title) return badRequest('title required');
    const now = new Date().toISOString();
    const data = {
      title: body.title,
      subject: body.subject || '',
      level: body.level || 'beginner',
      duration: body.duration || 60,
      content: body.content || '',
      coverImage: body.coverImage || '',
      authorId: user.uid,
      authorName: user.displayName,
      status: body.status || 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  // PUT — update
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');
    const doc = await adminDb.collection(COLLECTION).doc(body.id).get();
    if (!doc.exists) return notFound('Lesson not found');

    const { id, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await adminDb.collection(COLLECTION).doc(id).update(updateFields);
    const updated = await adminDb.collection(COLLECTION).doc(id).get();
    return ok({ id: updated.id, ...updated.data() });
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    const id = params.id;
    if (!id) return badRequest('id required');
    await adminDb.collection(COLLECTION).doc(id).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
