/**
 * API: Organizations — multi-tenant organization management.
 *
 * GET    /api-organizations                → list all orgs (super_admin) or get own org
 * GET    /api-organizations?id=<id>        → get org by id
 * POST   /api-organizations                → create new organization (during registration)
 * PUT    /api-organizations                → update org (name, status, plan)
 * DELETE /api-organizations?id=<id>        → deactivate org (super_admin only)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'organizations';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  // ═══ PUBLIC ENDPOINTS (no auth required) ═══

  // Public directory: list all active orgs (discoverable by students)
  if (event.httpMethod === 'GET' && action === 'directory') {
    const snap = await adminDb.collection(COLLECTION)
      .where('status', '==', 'active')
      .limit(50)
      .get();

    let orgs = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        slug: data.slug,
        description: data.description || '',
        logo: data.logo || '',
        city: data.city || '',
        country: data.country || '',
        isOnline: data.isOnline || false,
        subjects: data.subjects || [],
        studentsCount: data.studentsCount || 0,
        teachersCount: data.teachersCount || 0,
        createdAt: data.createdAt || '',
      };
    });
    
    orgs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    
    return ok(orgs);
  }

  // Public profile: single org details
  if (event.httpMethod === 'GET' && action === 'publicProfile') {
    const orgId = params.id || params.slug;
    if (!orgId) return badRequest('id or slug required');

    let doc;
    if (params.slug) {
      const snap = await adminDb.collection(COLLECTION)
        .where('slug', '==', params.slug).limit(1).get();
      if (snap.empty) return notFound('Organization not found');
      doc = snap.docs[0];
    } else {
      const d = await adminDb.collection(COLLECTION).doc(orgId).get();
      if (!d.exists) return notFound('Organization not found');
      doc = d;
    }

    const data = doc.data()!;
    if (data.status !== 'active') return notFound('Organization not found');

    // Fetch org courses for public display
    const coursesSnap = await adminDb.collection('courses')
      .where('organizationId', '==', doc.id)
      .limit(50).get();
    const courses = coursesSnap.docs.map(c => ({
      id: c.id,
      title: c.data().title || c.data().name || '',
      description: c.data().description || '',
    }));

    // Log public profile view
    adminDb.collection('systemLogs').add({
      action: 'public_profile_viewed',
      targetType: 'org',
      targetId: doc.id,
      metadata: { slug: data.slug },
      createdAt: new Date().toISOString(),
    }).catch(() => {});

    return ok({
      id: doc.id,
      name: data.name,
      slug: data.slug,
      description: data.description || '',
      logo: data.logo || '',
      banner: data.banner || '',
      city: data.city || '',
      country: data.country || '',
      address: data.address || '',
      workingHours: data.workingHours || '',
      isOnline: data.isOnline || false,
      subjects: data.subjects || [],
      contactEmail: data.contactEmail || '',
      contactPhone: data.contactPhone || '',
      contactLinks: data.contactLinks || {},
      photos: data.photos || [],
      courses,
      studentsCount: data.studentsCount || 0,
      teachersCount: data.teachersCount || 0,
      examsCount: data.examsCount || 0,
      createdAt: data.createdAt,
    });
  }

  // ═══ AUTHENTICATED ENDPOINTS ═══

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  // GET
  if (event.httpMethod === 'GET') {
    // Get by ID
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Organization not found');
      // Non-super_admin can only see their own org
      if (!isSuperAdmin(user) && doc.id !== user.organizationId) return forbidden();
      return ok({ id: doc.id, ...doc.data() });
    }

    // Super admin: list all
    if (isSuperAdmin(user)) {
      const snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    // Regular user: return their org
    if (user.organizationId) {
      const doc = await adminDb.collection(COLLECTION).doc(user.organizationId).get();
      if (!doc.exists) return notFound('Organization not found');
      return ok({ id: doc.id, ...doc.data() });
    }

    return ok(null);
  }

  // POST — create new organization
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.name) return badRequest('Organization name required');

    const now = new Date().toISOString();
    const slug = generateSlug(body.name);

    // Check slug uniqueness
    const existing = await adminDb.collection(COLLECTION).where('slug', '==', slug).limit(1).get();
    if (!existing.empty) return badRequest('Organization name already taken');

    const orgData = {
      name: body.name,
      slug,
      ownerId: user.uid,
      ownerEmail: user.email,
      planId: body.planId || 'starter',
      status: 'active',
      isPublic: true,
      publicProfileEnabled: true,
      studentsCount: 0,
      teachersCount: 1, // owner counts as teacher
      examsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection(COLLECTION).add(orgData);
    const orgId = ref.id;

    // Create subscription with 14-day trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    await adminDb.collection('subscriptions').add({
      organizationId: orgId,
      planId: orgData.planId,
      status: 'trial',
      startDate: now,
      currentPeriodEnd: trialEnd.toISOString(),
      trialEndsAt: trialEnd.toISOString(),
      createdAt: now,
    });

    // Create owner membership (dual-collection)
    const membershipData = {
      userId: user.uid,
      userEmail: user.email,
      userName: user.displayName,
      organizationId: orgId,
      organizationName: body.name,
      role: 'owner',
      status: 'active',
      joinMethod: 'direct_added',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await adminDb.collection('users').doc(user.uid)
      .collection('memberships').doc(orgId).set(membershipData);
    await adminDb.collection('orgMembers').doc(orgId)
      .collection('members').doc(user.uid).set(membershipData);

    // Update user profile with activeOrgId + legacy fields
    await adminDb.collection('users').doc(user.uid).update({
      activeOrgId: orgId,
      organizationId: orgId,
      organizationName: body.name,
      role: 'admin',
      updatedAt: now,
    });

    // System log
    await adminDb.collection('systemLogs').add({
      action: 'org_created',
      actorId: user.uid,
      actorName: user.displayName,
      targetType: 'org',
      targetId: orgId,
      metadata: { orgName: body.name, planId: orgData.planId },
      createdAt: now,
    });

    return ok({ id: orgId, ...orgData });
  }

  // PUT — update org
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');

    // Only super_admin or the org's own admin can update
    if (!isSuperAdmin(user) && body.id !== user.organizationId) return forbidden();
    // Only super_admin can change status/plan
    if ((body.status || body.planId) && !isSuperAdmin(user) && !hasRole(user, 'admin')) return forbidden();

    const { id, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await adminDb.collection(COLLECTION).doc(id).update(updateFields);

    // If plan changed, update subscription
    if (body.planId) {
      const subSnap = await adminDb.collection('subscriptions')
        .where('organizationId', '==', id).limit(1).get();
      if (!subSnap.empty) {
        await subSnap.docs[0].ref.update({
          planId: body.planId,
          status: 'active',
        });
      }
    }

    // Log status changes
    if (body.status) {
      await adminDb.collection('systemLogs').add({
        action: `org_${body.status}`,
        actorId: user.uid,
        actorName: user.displayName,
        targetType: 'org',
        targetId: id,
        metadata: { status: body.status },
        createdAt: new Date().toISOString(),
      });
    }

    const updated = await adminDb.collection(COLLECTION).doc(id).get();
    return ok({ id: updated.id, ...updated.data() });
  }

  // DELETE — soft delete (suspend)
  if (event.httpMethod === 'DELETE') {
    if (!isSuperAdmin(user)) return forbidden();
    const id = params.id;
    if (!id) return badRequest('id required');

    await adminDb.collection(COLLECTION).doc(id).update({
      status: 'suspended',
      updatedAt: new Date().toISOString(),
    });

    await adminDb.collection('systemLogs').add({
      action: 'org_suspended',
      actorId: user.uid,
      actorName: user.displayName,
      targetType: 'org',
      targetId: id,
      createdAt: new Date().toISOString(),
    });

    return ok({ suspended: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
