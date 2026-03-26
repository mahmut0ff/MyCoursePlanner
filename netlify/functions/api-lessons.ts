/**
 * API: Lessons — CRUD (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { notifyOrgStudents } from './utils/notifications';

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
    const orgFilter = getOrgFilter(user);
    let snap;
    if (orgFilter) {
      snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').get();
    } else {
      snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    }
    return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  }

  if (!isStaff(user)) return forbidden();

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.title) return badRequest('title required');
    const now = new Date().toISOString();
    const data = {
      ...body,
      authorId: user.uid,
      authorName: user.displayName,
      organizationId: user.organizationId || '',
      status: body.status || 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    // Notify org students about new lesson
    if (user.organizationId && data.status === 'published') {
      notifyOrgStudents(
        user.organizationId, 'new_lesson',
        'Новый урок',
        `Опубликован урок «${body.title}»`,
        '/lessons',
      ).catch(() => {});
    }
    return ok({ id: ref.id, ...data });
  }

  // PUT
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');
    const { id, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await adminDb.collection(COLLECTION).doc(id).update(updateFields);
    const updated = await adminDb.collection(COLLECTION).doc(id).get();
    return ok({ id: updated.id, ...updated.data() });
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    if (!params.id) return badRequest('id required');
    const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
    if (!doc.exists) return notFound('Lesson not found');
    // Verify org ownership (skip for super_admin)
    if (user.organizationId && doc.data()?.organizationId !== user.organizationId) return forbidden();
    await adminDb.collection(COLLECTION).doc(params.id).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
