/**
 * API: Branches — org-scoped CRUD for branch/location/campus management.
 * Admin: full CRUD. Manager: read assigned branches only.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, hasRole, hasPermission,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  type AuthUser,
} from './utils/auth';

const now = () => new Date().toISOString();

function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

async function updateOrgBranchesStats(orgId: string) {
  const snap = await adminDb.collection('branches')
    .where('organizationId', '==', orgId)
    .where('isActive', '==', true)
    .get();

  const cities = new Set<string>();
  let count = 0;

  snap.docs.forEach(doc => {
    count++;
    const data = doc.data();
    if (data.city && data.city.trim()) {
      cities.add(data.city.trim());
    }
  });

  await adminDb.collection('organizations').doc(orgId).update({
    branchesCount: count,
    branchCities: Array.from(cities).sort()
  }).catch(e => console.error('Failed to update org branch stats', e));
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
    // ═══ LIST BRANCHES ═══
    if (action === 'list' && event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();

      const snap = await orgQuery('branches', orgId)
        .where('isActive', '==', true)
        .get();
      const branches = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Manager: filter to assigned branches only
      if (hasRole(user, 'manager')) {
        const membership = await adminDb.collection('users').doc(user.uid)
          .collection('memberships').doc(orgId).get();
        const assignedBranchIds = membership.data()?.branchIds || [];
        if (assignedBranchIds.length > 0) {
          return ok(branches.filter((b: any) => assignedBranchIds.includes(b.id)));
        }
      }

      return ok(branches);
    }

    // ═══ GET SINGLE BRANCH ═══
    if (action === 'get' && event.httpMethod === 'GET') {
      const { branchId } = params;
      if (!branchId) return badRequest('branchId required');
      if (!isStaff(user)) return forbidden();

      const doc = await adminDb.collection('branches').doc(branchId).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();

      return ok({ id: doc.id, ...doc.data() });
    }

    // ═══ CREATE BRANCH ═══
    if (action === 'create' && event.httpMethod === 'POST') {
      if (!hasPermission(user, 'branches')) return forbidden('No access to branches module');

      const body = JSON.parse(event.body || '{}');
      const { name, slug, city, address, phone, whatsapp, contactName, description, latitude, longitude } = body;
      if (!name) return badRequest('name required');

      // Generate slug from name if not provided
      const branchSlug = slug || name.toLowerCase()
        .replace(/[^a-z0-9а-яё\s-]/gi, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);

      // Check slug uniqueness within org
      const existing = await orgQuery('branches', orgId)
        .where('slug', '==', branchSlug).limit(1).get();
      if (!existing.empty) return badRequest('Branch slug already exists');

      const branchData: any = {
        organizationId: orgId,
        name,
        slug: branchSlug,
        city: city || null,
        address: address || null,
        phone: phone || null,
        whatsapp: whatsapp || null,
        contactName: contactName || null,
        description: description || null,
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      };
      
      if (latitude !== undefined) branchData.latitude = latitude;
      if (longitude !== undefined) branchData.longitude = longitude;

      const ref = await adminDb.collection('branches').add(branchData);
      
      // Update denormalized stats on org
      await updateOrgBranchesStats(orgId);
      
      return ok({ id: ref.id, ...branchData });
    }

    // ═══ UPDATE BRANCH ═══
    if (action === 'update' && event.httpMethod === 'POST') {
      if (!hasPermission(user, 'branches')) return forbidden('No access to branches module');

      const body = JSON.parse(event.body || '{}');
      const { id, name, slug, city, address, phone, whatsapp, contactName, description, latitude, longitude, isActive } = body;
      if (!id) return badRequest('id required');

      const doc = await adminDb.collection('branches').doc(id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();

      const updates: any = { updatedAt: now() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug;
      if (city !== undefined) updates.city = city;
      if (address !== undefined) updates.address = address;
      if (phone !== undefined) updates.phone = phone;
      if (whatsapp !== undefined) updates.whatsapp = whatsapp;
      if (contactName !== undefined) updates.contactName = contactName;
      if (description !== undefined) updates.description = description;
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;
      if (isActive !== undefined) updates.isActive = isActive;

      await doc.ref.update(updates);
      
      // If city or active status changed, stats might need an update
      if (city !== undefined || isActive !== undefined) {
        await updateOrgBranchesStats(orgId);
      }
      
      return ok({ id: doc.id, ...doc.data(), ...updates });
    }

    // ═══ DELETE (ARCHIVE) BRANCH ═══
    if (action === 'archive' && event.httpMethod === 'POST') {
      if (!hasPermission(user, 'branches')) return forbidden('No access to branches module');

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');

      const doc = await adminDb.collection('branches').doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();

      await doc.ref.update({ isActive: false, updatedAt: now() });
      
      await updateOrgBranchesStats(orgId);
      
      return ok({ archived: true });
    }

    // ═══ ASSIGN USER TO BRANCH ═══
    if (action === 'assignUser' && event.httpMethod === 'POST') {
      if (!hasPermission(user, 'branches')) return forbidden('No access to branches module');

      const body = JSON.parse(event.body || '{}');
      const { userId, branchId } = body;
      if (!userId || !branchId) return badRequest('userId and branchId required');

      // Verify branch belongs to org
      const branchDoc = await adminDb.collection('branches').doc(branchId).get();
      if (!branchDoc.exists || branchDoc.data()?.organizationId !== orgId) return forbidden();

      // Update user membership with branchId
      const memberRef = adminDb.collection('users').doc(userId)
        .collection('memberships').doc(orgId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) return notFound('User not a member of this org');

      const currentBranchIds: string[] = memberDoc.data()?.branchIds || [];
      if (!currentBranchIds.includes(branchId)) {
        await memberRef.update({
          branchIds: [...currentBranchIds, branchId],
          updatedAt: now(),
        });
      }

      return ok({ assigned: true });
    }

    // ═══ REMOVE USER FROM BRANCH ═══
    if (action === 'removeUser' && event.httpMethod === 'POST') {
      if (!hasPermission(user, 'branches')) return forbidden('No access to branches module');

      const body = JSON.parse(event.body || '{}');
      const { userId, branchId } = body;
      if (!userId || !branchId) return badRequest('userId and branchId required');

      const memberRef = adminDb.collection('users').doc(userId)
        .collection('memberships').doc(orgId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) return notFound('User not a member of this org');

      const currentBranchIds: string[] = memberDoc.data()?.branchIds || [];
      await memberRef.update({
        branchIds: currentBranchIds.filter(id => id !== branchId),
        updatedAt: now(),
      });

      return ok({ removed: true });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-branches error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
