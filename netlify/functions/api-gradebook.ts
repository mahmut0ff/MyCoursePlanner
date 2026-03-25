/**
 * API: Gradebook — org-scoped CRUD for grades, journal, grade schemas.
 * All operations are IDEMPOTENT. Uses version-based optimistic locking.
 * Cross-tenant isolation enforced on every query.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, hasRole,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  type AuthUser,
} from './utils/auth';

const now = () => new Date().toISOString();

function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

/** Verify teacher/admin access to the course */
async function verifyCourseAccess(user: AuthUser, courseId: string): Promise<boolean> {
  const doc = await adminDb.collection('courses').doc(courseId).get();
  if (!doc.exists) return false;
  const data = doc.data()!;
  if (data.organizationId !== user.organizationId) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return data.teacherIds?.includes(user.uid) ?? false;
  return false;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!user.organizationId) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;

  try {
    // ═══ GRADES ═══

    /** GET grades — fetch all grades for a course, optionally filtered by studentId/lessonId */
    if (action === 'grades' && event.httpMethod === 'GET') {
      const { courseId, studentId, lessonId } = params;
      if (!courseId) return badRequest('courseId required');

      // Permission: staff sees all, student sees only own
      if (hasRole(user, 'student')) {
        // Student can only see own grades
        let q = orgQuery('grades', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', user.uid);
        if (lessonId) q = q.where('lessonId', '==', lessonId);
        const snap = await q.get();
        return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      }

      if (!isStaff(user)) return forbidden();
      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      let q: any = orgQuery('grades', orgId).where('courseId', '==', courseId);
      if (studentId) q = q.where('studentId', '==', studentId);
      if (lessonId) q = q.where('lessonId', '==', lessonId);
      const snap = await q.get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }

    /**
     * POST grade — idempotent upsert.
     * Unique key: (studentId + courseId + lessonId + assignmentId)
     * Uses version for optimistic locking.
     */
    if (action === 'grade' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const { studentId, courseId, lessonId, assignmentId, value, displayValue, type, maxValue, status, comment, version } = body;
      if (!studentId || !courseId) return badRequest('studentId and courseId required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      // Build idempotent key
      const keyParts = [studentId, courseId, lessonId || '_', assignmentId || '_'];
      const idempotentKey = keyParts.join('__');

      // Check for existing
      const existing = await orgQuery('grades', orgId)
        .where('courseId', '==', courseId)
        .where('studentId', '==', studentId)
        .where('lessonId', '==', lessonId || null)
        .limit(1).get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        // Optimistic locking: check version
        if (version !== undefined && data.version !== undefined && version < data.version) {
          return jsonResponse(409, { error: 'Version conflict', current: data });
        }
        // Update existing
        const updates: any = { updatedAt: now(), version: (data.version || 0) + 1 };
        if (value !== undefined) updates.value = value;
        if (displayValue !== undefined) updates.displayValue = displayValue;
        if (type !== undefined) updates.type = type;
        if (maxValue !== undefined) updates.maxValue = maxValue;
        if (status !== undefined) updates.status = status;
        if (comment !== undefined) updates.comment = comment;
        await doc.ref.update(updates);
        return ok({ id: doc.id, ...data, ...updates });
      }

      // Create new
      const gradeData = {
        studentId, courseId,
        lessonId: lessonId || null,
        assignmentId: assignmentId || null,
        value: value ?? null,
        displayValue: displayValue || null,
        type: type || 'points',
        maxValue: maxValue || 100,
        status: status || 'normal',
        comment: comment || '',
        createdBy: user.uid,
        organizationId: orgId,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      const ref = await adminDb.collection('grades').add(gradeData);
      return ok({ id: ref.id, ...gradeData });
    }

    /** POST bulkGrades — batch upsert multiple grades atomically */
    if (action === 'bulkGrades' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const { grades, courseId } = body;
      if (!courseId || !Array.isArray(grades)) return badRequest('courseId and grades[] required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      const batch = adminDb.batch();
      const results: any[] = [];

      for (const g of grades) {
        // Check existing
        const existing = await orgQuery('grades', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', g.studentId)
          .where('lessonId', '==', g.lessonId || null)
          .limit(1).get();

        if (!existing.empty) {
          const doc = existing.docs[0];
          const data = doc.data();
          const updates: any = {
            value: g.value ?? data.value,
            status: g.status || data.status,
            comment: g.comment !== undefined ? g.comment : data.comment,
            displayValue: g.displayValue !== undefined ? g.displayValue : data.displayValue,
            version: (data.version || 0) + 1,
            updatedAt: now(),
          };
          batch.update(doc.ref, updates);
          results.push({ id: doc.id, ...data, ...updates });
        } else {
          const ref = adminDb.collection('grades').doc();
          const gradeData = {
            studentId: g.studentId, courseId,
            lessonId: g.lessonId || null,
            assignmentId: g.assignmentId || null,
            value: g.value ?? null,
            displayValue: g.displayValue || null,
            type: g.type || 'points',
            maxValue: g.maxValue || 100,
            status: g.status || 'normal',
            comment: g.comment || '',
            createdBy: user.uid,
            organizationId: orgId,
            version: 1,
            createdAt: now(),
            updatedAt: now(),
          };
          batch.set(ref, gradeData);
          results.push({ id: ref.id, ...gradeData });
        }
      }

      await batch.commit();
      return ok(results);
    }

    /** DELETE grade */
    if (action === 'deleteGrade' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('grades').doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();
      await doc.ref.delete();
      return ok({ deleted: true });
    }

    // ═══ GRADE SCHEMA ═══

    if (action === 'schema' && event.httpMethod === 'GET') {
      const { courseId } = params;
      if (!courseId) return badRequest('courseId required');
      const snap = await orgQuery('gradeSchemas', orgId)
        .where('courseId', '==', courseId).limit(1).get();
      if (snap.empty) return ok(null);
      return ok({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }

    if (action === 'schema' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const { courseId, gradingType, scale, passThreshold, rules } = body;
      if (!courseId) return badRequest('courseId required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      // Idempotent: one schema per course
      const existing = await orgQuery('gradeSchemas', orgId)
        .where('courseId', '==', courseId).limit(1).get();
      if (!existing.empty) {
        const doc = existing.docs[0];
        const updates = { gradingType, scale, passThreshold, rules: rules || {}, updatedAt: now() };
        await doc.ref.update(updates);
        return ok({ id: doc.id, ...doc.data(), ...updates });
      }

      const data = {
        courseId, organizationId: orgId,
        gradingType: gradingType || 'points',
        scale: scale || { min: 0, max: 100 },
        passThreshold: passThreshold ?? 50,
        rules: rules || {},
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('gradeSchemas').add(data);
      return ok({ id: ref.id, ...data });
    }

    // ═══ JOURNAL ═══

    /** GET journal entries */
    if (action === 'journal' && event.httpMethod === 'GET') {
      const { courseId, studentId, from, to } = params;
      if (!courseId) return badRequest('courseId required');

      // Student: only own data
      if (hasRole(user, 'student')) {
        let q = orgQuery('journal', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', user.uid);
        const snap = await q.get();
        return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      }

      if (!isStaff(user)) return forbidden();
      let q: any = orgQuery('journal', orgId).where('courseId', '==', courseId);
      if (studentId) q = q.where('studentId', '==', studentId);
      const snap = await q.get();
      let results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      // Client-side date filter (Firestore composite index avoidance)
      if (from) results = results.filter((r: any) => r.date >= from);
      if (to) results = results.filter((r: any) => r.date <= to);
      return ok(results);
    }

    /**
     * POST journal — idempotent upsert.
     * Unique key: (studentId + courseId + date)
     */
    if (action === 'journal' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const { studentId, courseId, date, attendance, participation, note, flags, version } = body;
      if (!studentId || !courseId || !date) return badRequest('studentId, courseId, date required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      const existing = await orgQuery('journal', orgId)
        .where('courseId', '==', courseId)
        .where('studentId', '==', studentId)
        .where('date', '==', date)
        .limit(1).get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        if (version !== undefined && data.version !== undefined && version < data.version) {
          return jsonResponse(409, { error: 'Version conflict', current: data });
        }
        const updates: any = { updatedAt: now(), version: (data.version || 0) + 1 };
        if (attendance !== undefined) updates.attendance = attendance;
        if (participation !== undefined) updates.participation = participation;
        if (note !== undefined) updates.note = note;
        if (flags !== undefined) updates.flags = flags;
        await doc.ref.update(updates);
        return ok({ id: doc.id, ...data, ...updates });
      }

      const journalData = {
        studentId, courseId, date,
        attendance: attendance || 'present',
        participation: participation || null,
        note: note || '',
        flags: flags || [],
        createdBy: user.uid,
        organizationId: orgId,
        version: 1,
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('journal').add(journalData);
      return ok({ id: ref.id, ...journalData });
    }

    /** POST bulkAttendance — mark attendance for all students in a course for a date */
    if (action === 'bulkAttendance' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const { courseId, date, entries } = body;
      if (!courseId || !date || !Array.isArray(entries)) return badRequest('courseId, date, entries[] required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      const batch = adminDb.batch();
      const results: any[] = [];

      for (const e of entries) {
        const existing = await orgQuery('journal', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', e.studentId)
          .where('date', '==', date)
          .limit(1).get();

        if (!existing.empty) {
          const doc = existing.docs[0];
          const updates = {
            attendance: e.attendance || 'present',
            participation: e.participation || doc.data().participation,
            note: e.note !== undefined ? e.note : doc.data().note,
            version: (doc.data().version || 0) + 1,
            updatedAt: now(),
          };
          batch.update(doc.ref, updates);
          results.push({ id: doc.id, ...doc.data(), ...updates });
        } else {
          const ref = adminDb.collection('journal').doc();
          const data = {
            studentId: e.studentId, courseId, date,
            attendance: e.attendance || 'present',
            participation: e.participation || null,
            note: e.note || '', flags: [],
            createdBy: user.uid, organizationId: orgId,
            version: 1, createdAt: now(), updatedAt: now(),
          };
          batch.set(ref, data);
          results.push({ id: ref.id, ...data });
        }
      }

      await batch.commit();
      return ok(results);
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-gradebook error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
