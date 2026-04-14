/**
 * API: Syllabuses — CRUD (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, isSuperAdmin } from './utils/auth';

const COLLECTION = 'syllabuses';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Syllabus not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    try {
      const orgFilter = getOrgFilter(user);
      
      let snap;
      if (params.courseId) {
        // Get all syllabuses for a specific course
        let query = adminDb.collection(COLLECTION).where('courseId', '==', params.courseId).orderBy('createdAt', 'desc');
        if (orgFilter) {
          query = query.where('organizationId', '==', orgFilter);
        }
        snap = await query.get();
      } else if (isSuperAdmin(user)) {
        snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get();
      } else if (orgFilter) {
        snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').get();
      } else {
        return ok([]); // no org = no syllabuses
      }
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      console.error('Syllabus listing query failed:', err);
      return jsonResponse(500, { error: `Listing failed: ${err.message || 'Unknown error'}. Check Firestore composite indexes.` });
    }
  }

  if (!isStaff(user)) return forbidden();

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.title) return badRequest('title required');
    if (!body.courseId) return badRequest('courseId required');
    
    const now = new Date().toISOString();
    const data = {
      ...body,
      organizationId: user.organizationId || '',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
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
    if (!doc.exists) return notFound('Syllabus not found');
    if (user.organizationId && doc.data()?.organizationId !== user.organizationId) return forbidden();
    await adminDb.collection(COLLECTION).doc(params.id).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
