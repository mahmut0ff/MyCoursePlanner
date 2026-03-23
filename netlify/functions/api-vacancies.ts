/**
 * Vacancies API — Netlify Function
 * Full CRUD for job vacancies + application flow
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, hasRole,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  type AuthUser,
} from './utils/auth';

const VACANCIES = 'vacancies';
const APPLICATIONS = 'vacancy_applications';

const now = () => new Date().toISOString();

function generateId(): string {
  return adminDb.collection('_').doc().id;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  try {
    // Public actions (list, get) don't require auth
    if (action === 'list') {
      const snap = await adminDb.collection(VACANCIES).where('status', '==', 'published').orderBy('createdAt', 'desc').get();
      let result = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      if (params.subject) result = result.filter((v: any) => v.subject?.toLowerCase().includes(params.subject!.toLowerCase()));
      if (params.city) result = result.filter((v: any) => v.location?.city?.toLowerCase().includes(params.city!.toLowerCase()));
      if (params.employmentType) result = result.filter((v: any) => v.employmentType === params.employmentType);
      if (params.remote === 'true') result = result.filter((v: any) => v.location?.remote === true);
      if (params.salaryMin) result = result.filter((v: any) => (v.salaryMax || 0) >= parseInt(params.salaryMin!));
      if (params.salaryMax) result = result.filter((v: any) => (v.salaryMin || 0) <= parseInt(params.salaryMax!));

      return ok(result);
    }

    if (action === 'get') {
      if (!params.id) return badRequest('Missing id');
      const doc = await adminDb.collection(VACANCIES).doc(params.id).get();
      if (!doc.exists) return notFound('Vacancy not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    // All other actions require authentication
    const auth = await verifyAuth(event);
    if (!auth) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};

    // ---- Org Admin: Create vacancy ----
    if (action === 'create' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'admin')) return forbidden();

      const id = generateId();
      const vacancy = {
        id,
        organizationId: auth.organizationId,
        organizationName: '',
        title: body.title || '',
        description: body.description || '',
        requirements: body.requirements || '',
        responsibilities: body.responsibilities || '',
        subject: body.subject || '',
        employmentType: body.employmentType || 'full_time',
        salaryMin: body.salaryMin || null,
        salaryMax: body.salaryMax || null,
        salaryCurrency: body.salaryCurrency || 'KGS',
        location: body.location || { city: '', country: '', remote: false },
        workConditions: body.workConditions || '',
        benefits: body.benefits || [],
        photos: body.photos || [],
        contactEmail: body.contactEmail || auth.email || '',
        contactPhone: body.contactPhone || '',
        status: body.status || 'draft',
        applicationsCount: 0,
        createdAt: now(),
        updatedAt: now(),
      };

      // Get org name
      if (auth.organizationId) {
        const orgDoc = await adminDb.collection('organizations').doc(auth.organizationId).get();
        if (orgDoc.exists) vacancy.organizationName = orgDoc.data()?.name || '';
      }

      await adminDb.collection(VACANCIES).doc(id).set(vacancy);
      return ok(vacancy);
    }

    // ---- Org Admin: Update vacancy ----
    if (action === 'update' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'admin')) return forbidden();
      const doc = await adminDb.collection(VACANCIES).doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== auth.organizationId) return notFound();
      const updates = { ...body, id: undefined, organizationId: undefined, updatedAt: now() };
      delete updates.id;
      delete updates.organizationId;
      await adminDb.collection(VACANCIES).doc(body.id).update(updates);
      return ok({ id: body.id, ...doc.data(), ...updates });
    }

    // ---- Org Admin: Close vacancy ----
    if (action === 'close' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'admin')) return forbidden();
      await adminDb.collection(VACANCIES).doc(body.id).update({ status: 'closed', closedAt: now(), updatedAt: now() });
      return ok({ success: true });
    }

    // ---- Org Admin: Delete vacancy ----
    if (action === 'delete' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'admin')) return forbidden();
      await adminDb.collection(VACANCIES).doc(body.id).delete();
      const apps = await adminDb.collection(APPLICATIONS).where('vacancyId', '==', body.id).get();
      const batch = adminDb.batch();
      apps.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return ok({ success: true });
    }

    // ---- Teacher: Apply to vacancy ----
    if (action === 'apply' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'teacher')) return forbidden();

      const existing = await adminDb.collection(APPLICATIONS)
        .where('vacancyId', '==', body.vacancyId)
        .where('teacherId', '==', auth.uid)
        .get();
      if (!existing.empty) return badRequest('Already applied');

      const vacancy = await adminDb.collection(VACANCIES).doc(body.vacancyId).get();
      if (!vacancy.exists) return notFound('Vacancy not found');

      const id = generateId();
      const application = {
        id,
        vacancyId: body.vacancyId,
        vacancyTitle: vacancy.data()?.title || '',
        organizationName: vacancy.data()?.organizationName || '',
        teacherId: auth.uid,
        teacherName: auth.displayName || '',
        teacherEmail: auth.email || '',
        coverLetter: body.coverLetter || '',
        resumeUrl: body.resumeUrl || null,
        status: 'pending',
        createdAt: now(),
      };
      await adminDb.collection(APPLICATIONS).doc(id).set(application);

      await adminDb.collection(VACANCIES).doc(body.vacancyId).update({
        applicationsCount: (vacancy.data()?.applicationsCount || 0) + 1,
      });

      return ok(application);
    }

    // ---- Teacher: My applications ----
    if (action === 'myApplications') {
      if (!hasRole(auth, 'teacher')) return forbidden();
      const snap = await adminDb.collection(APPLICATIONS).where('teacherId', '==', auth.uid).orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // ---- Org Admin: Vacancy applications ----
    if (action === 'vacancyApplications') {
      if (!hasRole(auth, 'admin')) return forbidden();
      const snap = await adminDb.collection(APPLICATIONS).where('vacancyId', '==', params.vacancyId).orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // ---- Org Admin: Org's vacancies ----
    if (action === 'orgVacancies') {
      if (!hasRole(auth, 'admin')) return forbidden();
      const snap = await adminDb.collection(VACANCIES).where('organizationId', '==', auth.organizationId).orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // ---- Org Admin: Review application ----
    if (action === 'reviewApplication' && event.httpMethod === 'POST') {
      if (!hasRole(auth, 'admin')) return forbidden();
      const appDoc = await adminDb.collection(APPLICATIONS).doc(body.applicationId).get();
      if (!appDoc.exists) return notFound('Application not found');

      await adminDb.collection(APPLICATIONS).doc(body.applicationId).update({
        status: body.status,
        reviewedAt: now(),
        reviewedBy: auth.uid,
      });
      return ok({ success: true });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-vacancies error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
