/**
 * API: Finance Payment Plans — Tracks student obligations.
 * Enriches results with student/course names from users/courses collections.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'studentPaymentPlans';

/**
 * Batch-fetch display names for a set of user IDs.
 * Returns a Map<uid, displayName>.
 */
async function batchGetUserNames(uids: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (uids.length === 0) return nameMap;

  // Firestore 'in' queries support max 30 items per batch
  const BATCH = 30;
  for (let i = 0; i < uids.length; i += BATCH) {
    const batch = uids.slice(i, i + BATCH);
    const snap = await adminDb.collection('users')
      .where('__name__', 'in', batch)
      .select('displayName', 'firstName', 'lastName', 'name')
      .get();
    snap.docs.forEach(doc => {
      const d = doc.data();
      const name = d.displayName
        || [d.firstName, d.lastName].filter(Boolean).join(' ')
        || d.name
        || '';
      nameMap.set(doc.id, name);
    });
  }
  return nameMap;
}

/**
 * Batch-fetch course titles for a set of course IDs within an org.
 */
async function batchGetCourseNames(orgId: string, courseIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (courseIds.length === 0 || !orgId) return nameMap;

  const BATCH = 30;
  for (let i = 0; i < courseIds.length; i += BATCH) {
    const batch = courseIds.slice(i, i + BATCH);
    const snap = await adminDb.collection('courses')
      .where('__name__', 'in', batch)
      .select('title', 'name')
      .get();
    snap.docs.forEach(doc => {
      const d = doc.data();
      nameMap.set(doc.id, d.title || d.name || '');
    });
  }
  return nameMap;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Payment Plans
    if (event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();
      if (user.role === 'teacher') return forbidden('Teachers cannot access finance plans');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      if (params.studentId) query = query.where('studentId', '==', params.studentId);
      
      const snap = await query.get();
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Memory filter
      if (typeof branchFilter === 'string') {
        results = results.filter(r => r.branchId === branchFilter);
      } else if (Array.isArray(branchFilter) && branchFilter.length > 0) {
        results = results.filter(r => branchFilter.includes(r.branchId));
      }
      if (params.status) {
        results = results.filter(r => r.status === params.status);
      }
      
      // Memory sort
      results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      // ── Enrich with student/course names ──
      // Collect unique IDs that are missing names
      const studentIdsToFetch = new Set<string>();
      const courseIdsToFetch = new Set<string>();
      for (const r of results) {
        if (r.studentId && !r.studentName) studentIdsToFetch.add(r.studentId);
        if (r.courseId && !r.courseName) courseIdsToFetch.add(r.courseId);
      }

      // Parallel batch fetches
      const [studentNames, courseNames] = await Promise.all([
        batchGetUserNames([...studentIdsToFetch]),
        batchGetCourseNames(orgFilter, [...courseIdsToFetch]),
      ]);

      // Merge names into results
      for (const r of results) {
        if (!r.studentName && r.studentId && studentNames.has(r.studentId)) {
          r.studentName = studentNames.get(r.studentId);
        }
        if (!r.courseName && r.courseId && courseNames.has(r.courseId)) {
          r.courseName = courseNames.get(r.courseId);
        }
      }

      return ok(results);
    }

    // POST Create Payment Plan (Usually auto-created, but allow manual creation)
    if (event.httpMethod === 'POST') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();

      const body = JSON.parse(event.body || '{}');
      if (!body.studentId || !body.courseId || body.totalAmount === undefined) {
        return badRequest('studentId, courseId, and totalAmount are required');
      }

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      // Denormalize: resolve names at write time so future reads are instant
      let studentName = body.studentName || '';
      let courseName = body.courseName || '';

      const nameFetches: Promise<void>[] = [];
      if (!studentName && body.studentId) {
        nameFetches.push(
          adminDb.collection('users').doc(body.studentId).get().then(doc => {
            if (doc.exists) {
              const d = doc.data()!;
              studentName = d.displayName || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || body.studentId;
            }
          })
        );
      }
      if (!courseName && body.courseId && body.courseId !== 'general') {
        nameFetches.push(
          adminDb.collection('courses').doc(body.courseId).get().then(doc => {
            if (doc.exists) {
              const d = doc.data()!;
              courseName = d.title || d.name || body.courseId;
            }
          })
        );
      }
      await Promise.all(nameFetches);

      const now = new Date().toISOString();
      const data = {
        ...body,
        studentName,
        courseName,
        organizationId: orgFilter,
        paidAmount: body.paidAmount || 0,
        status: body.status || 'pending', // 'paid' | 'partial' | 'overdue' | 'pending'
        createdAt: now,
        updatedAt: now,
      };

      const ref = await adminDb.collection(COLLECTION).add(data);
      return ok({ id: ref.id, ...data });
    }

    // PUT Update Payment Plan
    if (event.httpMethod === 'PUT') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();

      const body = JSON.parse(event.body || '{}');
      if (!body.planId) return badRequest('planId required');

      const { planId, ...updateFields } = body;
      updateFields.updatedAt = new Date().toISOString();

      const docRef = adminDb.collection(COLLECTION).doc(planId);
      await docRef.update(updateFields);

      const updated = await docRef.get();
      return ok({ id: updated.id, ...updated.data() });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Plans API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
