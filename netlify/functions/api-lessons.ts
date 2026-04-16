/**
 * API: Lessons — CRUD (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, isSuperAdmin } from './utils/auth';
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

    // Filter by groupId — returns lessons that include this groupId in their groupIds array
    if (params.groupId) {
      try {
        const snap = await adminDb.collection(COLLECTION)
          .where('groupIds', 'array-contains', params.groupId)
          .limit(200)
          .get();
        let lessons = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        // Sort by createdAt desc in memory (avoids composite index requirement)
        lessons.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        // For students, only show published lessons
        if (user.role === 'student') {
          return ok(lessons.filter((l: any) => l.status === 'published'));
        }
        return ok(lessons);
      } catch (err: any) {
        console.error('Lesson groupId query failed:', err);
        return jsonResponse(500, { error: `Group filter failed: ${err.message}` });
      }
    }

    try {
      const orgFilter = getOrgFilter(user);
      if (params.orgId === 'none') {
        const snap = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).orderBy('createdAt', 'desc').get();
        const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').orderBy('createdAt', 'desc').get();
        const allDocs = [...snap.docs, ...snap2.docs].reduce((acc, curr) => {
           if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
           return acc;
        }, [] as any[]);
        return ok(allDocs.map((d: any) => ({ id: d.id, ...d.data() })));
      }

      let snap;
      if (isSuperAdmin(user)) {
        snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get();
      } else if (orgFilter) {
        snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').limit(200).get();
      } else {
        // Freelance teacher (no org) — show only their own lessons
        const snap1 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).orderBy('createdAt', 'desc').get();
        const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').orderBy('createdAt', 'desc').get();
        const allDocs = [...snap1.docs, ...snap2.docs].reduce((acc, curr) => {
           if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
           return acc;
        }, [] as any[]);
        return ok(allDocs.map((d: any) => ({ id: d.id, ...d.data() })));
      }
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      console.error('Lesson listing query failed:', err);
      return jsonResponse(500, { error: `Listing failed: ${err.message || 'Unknown error'}. Check Firestore composite indexes for lessonPlans collection.` });
    }
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
      groupIds: body.groupIds || [],
      groupNames: body.groupNames || [],
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
