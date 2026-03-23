/**
 * API: Users — manage user profiles, roles, invites, and teacher profiles.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, hasRole, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';

const now = () => new Date().toISOString();

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  try {
    // ═══ INVITES (any authenticated user) ═══
    if (action === 'pendingInviteCount') {
      const snap = await adminDb.collection('invites')
        .where('email', '==', user.email)
        .where('status', '==', 'pending').get();
      return ok({ count: snap.size });
    }

    if (action === 'myInvites') {
      const snap = await adminDb.collection('invites')
        .where('email', '==', user.email)
        .where('status', '==', 'pending').get();
      const invites = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      return ok(invites);
    }

    if (action === 'acceptInvite') {
      const body = JSON.parse(event.body || '{}');
      if (!body.inviteId) return badRequest('inviteId required');
      const invDoc = await adminDb.collection('invites').doc(body.inviteId).get();
      if (!invDoc.exists) return notFound('Invite not found');
      const inv = invDoc.data()!;
      if (inv.email !== user.email) return forbidden();
      if (inv.status !== 'pending') return badRequest('Invite already processed');
      // Assign user to organization
      await adminDb.collection('users').doc(user.uid).update({
        organizationId: inv.organizationId,
        role: inv.role || 'teacher',
        updatedAt: now(),
      });
      // Mark invite as accepted
      await adminDb.collection('invites').doc(body.inviteId).update({ status: 'accepted', updatedAt: now() });
      // Notify org admins
      notifyOrgAdmins(
        inv.organizationId, 'invite_accepted',
        'Приглашение принято',
        `${user.displayName || user.email} принял(а) приглашение`,
        '/teachers',
      ).catch(() => {});
      return ok({ accepted: true, organizationId: inv.organizationId });
    }

    if (action === 'declineInvite') {
      const body = JSON.parse(event.body || '{}');
      if (!body.inviteId) return badRequest('inviteId required');
      const invDoc = await adminDb.collection('invites').doc(body.inviteId).get();
      if (!invDoc.exists) return notFound('Invite not found');
      const inv = invDoc.data()!;
      if (inv.email !== user.email) return forbidden();
      await adminDb.collection('invites').doc(body.inviteId).update({ status: 'declined', updatedAt: now() });
      // Notify org admins
      notifyOrgAdmins(
        inv.organizationId, 'invite_declined',
        'Приглашение отклонено',
        `${user.displayName || user.email} отклонил(а) приглашение`,
        '/teachers',
      ).catch(() => {});
      return ok({ declined: true });
    }

    // ═══ LEAVE ORGANIZATION ═══
    if (action === 'leaveOrganization' && event.httpMethod === 'POST') {
      if (!user.organizationId) return badRequest('Not in any organization');
      const orgId = user.organizationId;
      await adminDb.collection('users').doc(user.uid).update({
        organizationId: '', organizationName: '', updatedAt: now(),
      });
      // Notify org admins
      notifyOrgAdmins(
        orgId, 'invite_declined',
        'Преподаватель покинул организацию',
        `${user.displayName || user.email} покинул(а) организацию`,
        '/teachers',
      ).catch(() => {});
      return ok({ left: true });
    }
    // ═══ TEACHER SETTINGS ═══
    if (action === 'teacherSettings') {
      if (event.httpMethod === 'GET') {
        const doc = await adminDb.collection('teacherSettings').doc(user.uid).get();
        if (!doc.exists) return ok({ uid: user.uid, language: 'ru', emailNotif: true, pushNotif: false, inviteNotif: true, resultNotif: true });
        return ok({ uid: user.uid, ...doc.data() });
      }
      if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
        const body = JSON.parse(event.body || '{}');
        const settings: any = {
          language: body.language || 'ru',
          emailNotif: body.emailNotif ?? true,
          pushNotif: body.pushNotif ?? false,
          inviteNotif: body.inviteNotif ?? true,
          resultNotif: body.resultNotif ?? true,
          updatedAt: now(),
        };
        await adminDb.collection('teacherSettings').doc(user.uid).set(settings, { merge: true });
        // Also update displayName in users collection if provided
        if (body.displayName) {
          await adminDb.collection('users').doc(user.uid).update({ displayName: body.displayName, updatedAt: now() });
        }
        return ok({ uid: user.uid, ...settings });
      }
    }

    if (action === 'teacherProfile') {
      if (event.httpMethod === 'GET') {
        const uid = params.uid || user.uid;
        const doc = await adminDb.collection('teacherProfiles').doc(uid).get();
        if (!doc.exists) return ok({ uid, bio: '', specialization: '', experience: '', avatarUrl: '', socialLinks: [] });
        return ok({ uid, ...doc.data() });
      }
      if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
        const body = JSON.parse(event.body || '{}');
        const profileData = {
          bio: body.bio || '',
          specialization: body.specialization || '',
          experience: body.experience || '',
          avatarUrl: body.avatarUrl || '',
          socialLinks: body.socialLinks || [],
          education: body.education || '',
          certificates: body.certificates || '',
          subjects: body.subjects || '',
          city: body.city || '',
          updatedAt: now(),
        };
        await adminDb.collection('teacherProfiles').doc(user.uid).set(profileData, { merge: true });
        return ok({ uid: user.uid, ...profileData });
      }
    }

    // ═══ DEFAULT: existing routes ═══

    // GET
    if (event.httpMethod === 'GET') {
      if (params.uid) {
        const doc = await adminDb.collection('users').doc(params.uid).get();
        if (!doc.exists) return notFound('User not found');
        const data = doc.data()!;
        if (!isSuperAdmin(user) && data.organizationId !== user.organizationId) return forbidden();
        return ok({ id: doc.id, ...data });
      }

      // List users
      if (!hasRole(user, 'super_admin', 'admin', 'teacher')) return forbidden();
      const orgFilter = getOrgFilter(user);
      let query: any = adminDb.collection('users').orderBy('createdAt', 'desc');
      if (orgFilter) query = adminDb.collection('users').where('organizationId', '==', orgFilter);
      const snapshot = await query.get();
      return ok(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }

    // PUT — update
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');
      if (body.uid !== user.uid && !hasRole(user, 'super_admin', 'admin')) return forbidden();

      const updateData: any = { updatedAt: now() };
      if (body.displayName) updateData.displayName = body.displayName;
      if (body.role && hasRole(user, 'super_admin', 'admin')) updateData.role = body.role;
      if (body.organizationId && isSuperAdmin(user)) updateData.organizationId = body.organizationId;

      await adminDb.collection('users').doc(body.uid).update(updateData);
      const updated = await adminDb.collection('users').doc(body.uid).get();
      return ok({ id: updated.id, ...updated.data() });
    }

    // DELETE
    if (event.httpMethod === 'DELETE') {
      if (!hasRole(user, 'super_admin', 'admin')) return forbidden();
      const uid = params.uid;
      if (!uid) return badRequest('uid required');
      await adminDb.collection('users').doc(uid).delete();
      return ok({ deleted: true });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (e: any) {
    console.error(`api-users error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
