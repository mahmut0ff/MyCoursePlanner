/**
 * Vacancies API — Netlify Function
 * Full CRUD for job vacancies + application flow
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { getFirestore } from 'firebase-admin/firestore';
import { getApp } from './utils/firebase-admin';
import { verifyAuth } from './utils/auth';

const app = getApp();
const db = getFirestore(app);
const VACANCIES = 'vacancies';
const APPLICATIONS = 'vacancy_applications';

function generateId(): string {
  return db.collection('_').doc().id;
}

const handler: Handler = async (event: HandlerEvent) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  try {
    // Public actions (list, get) don't require auth; others do
    if (action === 'list') {
      let query = db.collection(VACANCIES).where('status', '==', 'published').orderBy('createdAt', 'desc');
      
      const snap = await query.get();
      const vacancies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Apply filters in-memory for flexibility
      let result = vacancies as any[];
      if (params.subject) result = result.filter((v: any) => v.subject?.toLowerCase().includes(params.subject!.toLowerCase()));
      if (params.city) result = result.filter((v: any) => v.location?.city?.toLowerCase().includes(params.city!.toLowerCase()));
      if (params.employmentType) result = result.filter((v: any) => v.employmentType === params.employmentType);
      if (params.remote === 'true') result = result.filter((v: any) => v.location?.remote === true);
      if (params.salaryMin) result = result.filter((v: any) => (v.salaryMax || 0) >= parseInt(params.salaryMin!));
      if (params.salaryMax) result = result.filter((v: any) => (v.salaryMin || 0) <= parseInt(params.salaryMax!));
      
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (action === 'get') {
      const doc = await db.collection(VACANCIES).doc(params.id!).get();
      if (!doc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ id: doc.id, ...doc.data() }) };
    }

    // All other actions require authentication
    const auth = await verifyAuth(event);
    if (!auth) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

    const body = event.body ? JSON.parse(event.body) : {};

    // ---- Org Admin: Create vacancy ----
    if (action === 'create' && event.httpMethod === 'POST') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only org admins can create vacancies' }) };
      
      const id = generateId();
      const vacancy = {
        id,
        organizationId: auth.organizationId,
        organizationName: auth.organizationName || '',
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection(VACANCIES).doc(id).set(vacancy);
      return { statusCode: 200, headers, body: JSON.stringify(vacancy) };
    }

    // ---- Org Admin: Update vacancy ----
    if (action === 'update' && event.httpMethod === 'POST') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      const doc = await db.collection(VACANCIES).doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== auth.organizationId) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }
      const updates = { ...body, id: undefined, organizationId: undefined, updatedAt: new Date().toISOString() };
      delete updates.id;
      delete updates.organizationId;
      await db.collection(VACANCIES).doc(body.id).update(updates);
      return { statusCode: 200, headers, body: JSON.stringify({ id: body.id, ...doc.data(), ...updates }) };
    }

    // ---- Org Admin: Close vacancy ----
    if (action === 'close' && event.httpMethod === 'POST') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      await db.collection(VACANCIES).doc(body.id).update({ status: 'closed', closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ---- Org Admin: Delete vacancy ----
    if (action === 'delete' && event.httpMethod === 'POST') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      await db.collection(VACANCIES).doc(body.id).delete();
      // Also delete related applications
      const apps = await db.collection(APPLICATIONS).where('vacancyId', '==', body.id).get();
      const batch = db.batch();
      apps.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ---- Teacher: Apply to vacancy ----
    if (action === 'apply' && event.httpMethod === 'POST') {
      if (auth.role !== 'teacher') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only teachers can apply' }) };
      
      // Check not already applied
      const existing = await db.collection(APPLICATIONS)
        .where('vacancyId', '==', body.vacancyId)
        .where('teacherId', '==', auth.uid)
        .get();
      if (!existing.empty) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Already applied' }) };

      const vacancy = await db.collection(VACANCIES).doc(body.vacancyId).get();
      if (!vacancy.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Vacancy not found' }) };

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
        createdAt: new Date().toISOString(),
      };
      await db.collection(APPLICATIONS).doc(id).set(application);
      
      // Increment applications count
      await db.collection(VACANCIES).doc(body.vacancyId).update({
        applicationsCount: (vacancy.data()?.applicationsCount || 0) + 1,
      });

      return { statusCode: 200, headers, body: JSON.stringify(application) };
    }

    // ---- Teacher: My applications ----
    if (action === 'myApplications') {
      if (auth.role !== 'teacher') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      const snap = await db.collection(APPLICATIONS).where('teacherId', '==', auth.uid).orderBy('createdAt', 'desc').get();
      return { statusCode: 200, headers, body: JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() }))) };
    }

    // ---- Org Admin: List vacancy applications ----
    if (action === 'vacancyApplications') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      const snap = await db.collection(APPLICATIONS).where('vacancyId', '==', params.vacancyId).orderBy('createdAt', 'desc').get();
      return { statusCode: 200, headers, body: JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() }))) };
    }

    // ---- Org Admin: Get org's vacancies ----
    if (action === 'orgVacancies') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      const snap = await db.collection(VACANCIES).where('organizationId', '==', auth.organizationId).orderBy('createdAt', 'desc').get();
      return { statusCode: 200, headers, body: JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() }))) };
    }

    // ---- Org Admin: Review application ----
    if (action === 'reviewApplication' && event.httpMethod === 'POST') {
      if (auth.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      const appDoc = await db.collection(APPLICATIONS).doc(body.applicationId).get();
      if (!appDoc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      
      await db.collection(APPLICATIONS).doc(body.applicationId).update({
        status: body.status, // 'accepted' | 'rejected' | 'viewed'
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.uid,
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
  } catch (err: any) {
    console.error('api-vacancies error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

export { handler };
