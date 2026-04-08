/**
 * API: Memberships — manage user ↔ organization relationships.
 *
 * GET    ?action=orgMembers&orgId=X         → list org members (org admin/owner)
 * GET    ?action=myMemberships              → list current user's memberships
 * GET    ?action=publicMembers&orgId=X      → list public org members (for public profile)
 * POST   ?action=apply                      → user applies to join an org
 * POST   ?action=invite                     → org invites a user (by email)
 * POST   ?action=accept                     → accept invite or application
 * POST   ?action=reject                     → reject invite or application
 * POST   ?action=leave                      → user leaves an org
 * POST   ?action=remove                     → org removes a member
 * POST   ?action=changeRole                 → change member's role
 * POST   ?action=switchOrg                  → switch user's active org context
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
import { getOrgLimits } from './utils/plan-limits';

const now = () => new Date().toISOString();

// Helper: write membership to both user-side and org-side collections
async function writeMembership(data: {
  userId: string; userEmail?: string; userName?: string;
  organizationId: string; organizationName?: string;
  role: string; status: string; joinMethod: string;
}) {
  const ts = now();
  const membershipData = {
    ...data,
    joinedAt: data.status === 'active' ? ts : '',
    createdAt: ts,
    updatedAt: ts,
  };

  // User-side: users/{uid}/memberships/{orgId}
  await adminDb.collection('users').doc(data.userId)
    .collection('memberships').doc(data.organizationId)
    .set(membershipData, { merge: true });

  // Org-side mirror: orgMembers/{orgId}/members/{uid}
  await adminDb.collection('orgMembers').doc(data.organizationId)
    .collection('members').doc(data.userId)
    .set(membershipData, { merge: true });

  return membershipData;
}

// Helper: get membership
async function getMembership(userId: string, orgId: string) {
  const doc = await adminDb.collection('users').doc(userId)
    .collection('memberships').doc(orgId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Helper: get user's role in an org
async function getOrgRole(userId: string, orgId: string): Promise<string | null> {
  const m = await getMembership(userId, orgId);
  if (!m || (m as any).status !== 'active') return null;
  return (m as any).role || null;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  // Public endpoint: list public org members (teachers)
  if (event.httpMethod === 'GET' && action === 'publicMembers') {
    if (!params.orgId) return badRequest('orgId required');
    // Check org is public
    const orgDoc = await adminDb.collection('organizations').doc(params.orgId).get();
    if (!orgDoc.exists) return notFound('Organization not found');
    const org = orgDoc.data()!;
    if (!org.isPublic && org.status !== 'active') return forbidden();

    const snap = await adminDb.collection('orgMembers').doc(params.orgId)
      .collection('members')
      .where('status', '==', 'active')
      .where('role', 'in', ['teacher', 'mentor', 'owner', 'admin'])
      .get();

    let members = snap.docs.map((d: any) => ({
      id: d.id,
      userId: d.data().userId,
      userName: d.data().userName,
      role: d.data().role,
    }));

    // Enrich with avatarUrl from users collection
    if (members.length > 0) {
      const uids = members.map((m: any) => m.userId).filter(Boolean);
      const profileMap: Record<string, any> = {};
      for (let i = 0; i < uids.length; i += 10) {
        const batch = uids.slice(i, i + 10);
        const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
        profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
      }
      members = members.map((m: any) => {
        const p = profileMap[m.userId] || {};
        return { ...m, avatarUrl: p.avatarUrl || '' };
      });
    }

    return ok(members);
  }

  // All other actions require auth
  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  try {
    // ═══ GET: My memberships ═══
    if (event.httpMethod === 'GET' && action === 'myMemberships') {
      const snap = await adminDb.collection('users').doc(user.uid)
        .collection('memberships')
        .where('status', 'in', ['active', 'invited', 'pending'])
        .get();
      const memberships = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      return ok(memberships);
    }

    // ═══ GET: Org members ═══
    if (event.httpMethod === 'GET' && action === 'orgMembers') {
      if (!params.orgId) return badRequest('orgId required');
      // Must be admin/owner/teacher of the org, or super_admin
      const callerRole = await getOrgRole(user.uid, params.orgId);
      if (!isSuperAdmin(user) && !callerRole) return forbidden();

      const statusFilter = params.status || 'active';
      let query: any = adminDb.collection('orgMembers').doc(params.orgId)
        .collection('members');

      if (statusFilter !== 'all') {
        query = query.where('status', '==', statusFilter);
      }

      const snap = await query.get();
      let members = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Enrich with avatarUrl, phone from users collection
      if (members.length > 0) {
        const uids = members.map((m: any) => m.userId).filter(Boolean);
        const profileMap: Record<string, any> = {};
        for (let i = 0; i < uids.length; i += 10) {
          const batch = uids.slice(i, i + 10);
          const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
          profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
        }
        members = members.map((m: any) => {
          const p = profileMap[m.userId] || {};
          return { ...m, avatarUrl: p.avatarUrl || '', phone: p.phone || '', city: p.city || '' };
        });
      }

      return ok(members);
    }

    // ═══ POST: Public Join (QR / visit card flow) ═══
    if (event.httpMethod === 'POST' && action === 'publicJoin') {
      const body = JSON.parse(event.body || '{}');
      if (!body.orgSlug) return badRequest('orgSlug required');

      // Resolve org by slug
      const orgSnap = await adminDb.collection('organizations')
        .where('slug', '==', body.orgSlug).limit(1).get();
      if (orgSnap.empty) {
        // Audit: invalid slug attempt
        adminDb.collection('systemLogs').add({
          action: 'public_join_invalid_slug',
          actorId: user.uid,
          metadata: { slug: body.orgSlug },
          createdAt: now(),
        }).catch(() => {});
        return ok({ status: 'org_not_found' });
      }

      const orgDoc = orgSnap.docs[0];
      const org = orgDoc.data();
      const orgId = orgDoc.id;

      // Verify org is active
      if (org.status !== 'active') {
        return ok({ status: 'org_unavailable' });
      }

      // Check existing membership
      const existing = await getMembership(user.uid, orgId) as any;

      if (existing) {
        if (existing.status === 'active') {
          return ok({ status: 'already_member', orgId, orgName: org.name });
        }
        if (existing.status === 'pending') {
          return ok({ status: 'pending', orgId, orgName: org.name });
        }
        // Re-apply: user previously left or was removed → set pending for approval
        if (['left', 'removed'].includes(existing.status)) {
          const ts = now();
          const reapply = { status: 'pending', role: body.requestedRole || 'student', updatedAt: ts, joinMethod: 'public_join' };
          await adminDb.collection('users').doc(user.uid)
            .collection('memberships').doc(orgId).update(reapply);
          await adminDb.collection('orgMembers').doc(orgId)
            .collection('members').doc(user.uid).update(reapply);

          // Audit log
          adminDb.collection('systemLogs').add({
            action: 'public_join_reapply',
            actorId: user.uid,
            actorName: user.displayName,
            targetType: 'org',
            targetId: orgId,
            metadata: { slug: body.orgSlug, previousStatus: existing.status },
            createdAt: ts,
          }).catch(() => {});

          // Notify org admins about pending application
          notifyOrgAdmins(
            orgId, 'new_vacancy_application' as any,
            'Новая заявка на вступление',
            `${user.displayName || user.email} подал(а) повторную заявку на вступление`,
            '/org-users',
          ).catch(() => {});

          return ok({ status: 'pending', orgId, orgName: org.name });
        }
      }

      // Create new membership — pending approval by org admin/manager
      const ts = now();
      await writeMembership({
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        organizationId: orgId,
        organizationName: org.name,
        role: body.requestedRole || 'student',
        status: 'pending',
        joinMethod: 'public_join',
      });

      // Audit log
      adminDb.collection('systemLogs').add({
        action: 'public_join_pending',
        actorId: user.uid,
        actorName: user.displayName,
        targetType: 'org',
        targetId: orgId,
        metadata: { slug: body.orgSlug },
        createdAt: ts,
      }).catch(() => {});

      // Notify org admins about new pending student
      notifyOrgAdmins(
        orgId, 'new_vacancy_application' as any,
        'Новая заявка на вступление',
        `${user.displayName || user.email} подал(а) заявку на вступление в организацию`,
        '/org-users',
      ).catch(() => {});

      return ok({ status: 'pending', orgId, orgName: org.name });
    }

    // ═══ POST: Apply to org ═══
    if (event.httpMethod === 'POST' && action === 'apply') {
      const body = JSON.parse(event.body || '{}');
      if (!body.organizationId) return badRequest('organizationId required');

      // Check org exists and is public
      const orgDoc = await adminDb.collection('organizations').doc(body.organizationId).get();
      if (!orgDoc.exists) return notFound('Organization not found');
      const org = orgDoc.data()!;

      // Check if already a member
      const existing = await getMembership(user.uid, body.organizationId);
      if (existing && ['active', 'pending'].includes((existing as any).status)) {
        return badRequest('Already a member or application pending');
      }

      const membership = await writeMembership({
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        organizationId: body.organizationId,
        organizationName: org.name,
        role: body.role || 'student',
        status: 'pending',
        joinMethod: 'applied_by_user',
      });

      // Notify org admins
      notifyOrgAdmins(
        body.organizationId, 'new_vacancy_application' as any,
        'Новая заявка на вступление',
        `${user.displayName || user.email} подал(а) заявку на вступление в организацию`,
        '/membership',
      ).catch(() => {});

      return ok(membership);
    }

    // ═══ POST: Invite user to org ═══
    if (event.httpMethod === 'POST' && action === 'invite') {
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.organizationId) return badRequest('email and organizationId required');

      // Caller must be admin/owner of the org
      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      // Get org name
      const orgDoc = await adminDb.collection('organizations').doc(body.organizationId).get();
      if (!orgDoc.exists) return notFound('Organization not found');
      const orgName = orgDoc.data()?.name || '';

      // Find user by email
      const userSnap = await adminDb.collection('users').where('email', '==', body.email).limit(1).get();

      if (!userSnap.empty) {
        const targetUser = userSnap.docs[0];
        const targetUid = targetUser.id;
        const targetData = targetUser.data();

        // Check existing membership
        const existing = await getMembership(targetUid, body.organizationId);
        if (existing && ['active', 'invited'].includes((existing as any).status)) {
          return badRequest('User already a member or invited');
        }

        const membership = await writeMembership({
          userId: targetUid,
          userEmail: body.email,
          userName: targetData.displayName || body.email,
          organizationId: body.organizationId,
          organizationName: orgName,
          role: body.role || 'teacher',
          status: 'invited',
          joinMethod: 'invited_by_org',
        });

        // Create notification for the invited user
        createNotification({
          recipientId: targetUid,
          type: 'invite_received',
          title: 'Приглашение в организацию',
          message: `Вас пригласили в ${orgName} как ${body.role || 'teacher'}`,
          link: '/invites',
        }).catch(() => {});

        return ok({ ...membership, userFound: true });
      }

      // User not found — create a pending invite record (legacy invite flow)
      await adminDb.collection('invites').add({
        email: body.email,
        role: body.role || 'teacher',
        organizationId: body.organizationId,
        organizationName: orgName,
        invitedBy: user.uid,
        invitedByName: user.displayName,
        status: 'pending',
        createdAt: now(),
      });

      return ok({ userFound: false, inviteSent: true });
    }

    // ═══ POST: Accept (invite or application) ═══
    if (event.httpMethod === 'POST' && action === 'accept') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const membership = await getMembership(body.userId, body.organizationId) as any;
      if (!membership) return notFound('Membership not found');

      // Who can accept?
      // - If status=invited → the invited user accepts
      // - If status=pending → org admin/owner accepts the application
      if (membership.status === 'invited') {
        if (body.userId !== user.uid) return forbidden();
      } else if (membership.status === 'pending') {
        const callerRole = await getOrgRole(user.uid, body.organizationId);
        if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();
      } else {
        return badRequest(`Cannot accept membership with status: ${membership.status}`);
      }

      // Enforce Limits
      const limits = await getOrgLimits(body.organizationId);
      const activeSnap = await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').where('status', '==', 'active').get();
      const studentCount = activeSnap.docs.filter((d: any) => d.data().role === 'student').length;
      const teacherCount = activeSnap.docs.filter((d: any) => ['teacher', 'mentor', 'admin', 'owner'].includes(d.data().role)).length;

      if (membership.role === 'student' && limits.maxStudents !== -1 && studentCount >= limits.maxStudents) {
         return badRequest('Organization has reached the student limit for its plan.');
      }
      if (['teacher', 'mentor', 'admin', 'owner'].includes(membership.role) && limits.maxTeachers !== -1 && teacherCount >= limits.maxTeachers) {
         return badRequest('Organization has reached the teacher limit for its plan.');
      }

      const ts = now();
      const update = { status: 'active', joinedAt: ts, updatedAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      // Set activeOrgId if user doesn't have one
      const userDoc = await adminDb.collection('users').doc(body.userId).get();
      const userData = userDoc.data();
      if (!userData?.activeOrgId) {
        await adminDb.collection('users').doc(body.userId).update({
          activeOrgId: body.organizationId,
          // Keep legacy fields in sync
          organizationId: body.organizationId,
          organizationName: membership.organizationName,
          role: membership.role === 'owner' ? 'admin' : membership.role,
          updatedAt: ts,
        });
      }

      // Update org member count
      await adminDb.collection('organizations').doc(body.organizationId).update({
        studentsCount: membership.role === 'student' ? studentCount + 1 : studentCount,
        teachersCount: ['teacher', 'mentor', 'admin', 'owner'].includes(membership.role) ? teacherCount + 1 : teacherCount,
        updatedAt: ts,
      });

      return ok({ accepted: true, ...update });
    }

    // ═══ POST: Reject ═══
    if (event.httpMethod === 'POST' && action === 'reject') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const membership = await getMembership(body.userId, body.organizationId) as any;
      if (!membership) return notFound('Membership not found');

      // Same logic as accept for who can reject
      if (membership.status === 'invited') {
        if (body.userId !== user.uid) return forbidden();
      } else if (membership.status === 'pending') {
        const callerRole = await getOrgRole(user.uid, body.organizationId);
        if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();
      } else {
        return badRequest(`Cannot reject membership with status: ${membership.status}`);
      }

      const ts = now();
      const update = { status: 'removed', updatedAt: ts, leftAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ rejected: true });
    }

    // ═══ POST: Leave org ═══
    if (event.httpMethod === 'POST' && action === 'leave') {
      const body = JSON.parse(event.body || '{}');
      if (!body.organizationId) return badRequest('organizationId required');

      const membership = await getMembership(user.uid, body.organizationId) as any;
      if (!membership || membership.status !== 'active') return badRequest('Not an active member');
      if (membership.role === 'owner') return badRequest('Owner cannot leave. Transfer ownership first.');

      const ts = now();
      const newStatus = membership.role === 'student' ? 'expelled' : 'left';
      const update = { status: newStatus, leftAt: ts, updatedAt: ts };
      await adminDb.collection('users').doc(user.uid)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(user.uid).update(update);

      // If this was the active org, switch to another
      const userDoc = await adminDb.collection('users').doc(user.uid).get();
      if (userDoc.data()?.activeOrgId === body.organizationId) {
        const otherMemberships = await adminDb.collection('users').doc(user.uid)
          .collection('memberships').where('status', '==', 'active').limit(1).get();

        const nextOrgId = otherMemberships.empty ? '' : otherMemberships.docs[0].id;
        await adminDb.collection('users').doc(user.uid).update({
          activeOrgId: nextOrgId,
          organizationId: nextOrgId,
          updatedAt: ts,
        });
      }

      notifyOrgAdmins(
        body.organizationId, 'invite_declined' as any,
        'Участник покинул организацию',
        `${user.displayName || user.email} покинул(а) организацию`,
        '/membership',
      ).catch(() => {});

      return ok({ left: true });
    }

    // ═══ POST: Remove member ═══
    if (event.httpMethod === 'POST' && action === 'remove') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      // Cannot remove owner
      const targetMembership = await getMembership(body.userId, body.organizationId) as any;
      if (!targetMembership) return notFound('Member not found');
      if (targetMembership.role === 'owner') return badRequest('Cannot remove organization owner');

      const ts = now();
      const newStatus = targetMembership.role === 'student' ? 'expelled' : 'removed';
      const update = { status: newStatus, leftAt: ts, updatedAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ removed: true });
    }

    // ═══ POST: Delete member permanently ═══
    if (event.httpMethod === 'POST' && action === 'delete') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      const targetMembership = await getMembership(body.userId, body.organizationId) as any;
      if (!targetMembership) return notFound('Member not found');
      if (targetMembership.role === 'owner') return badRequest('Cannot remove organization owner');

      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).delete();
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).delete();

      return ok({ deleted: true });
    }

    // ═══ POST: Change role ═══
    if (event.httpMethod === 'POST' && action === 'changeRole') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId || !body.newRole) {
        return badRequest('userId, organizationId, and newRole required');
      }

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      const validRoles = ['student', 'teacher', 'mentor', 'admin'];
      if (!validRoles.includes(body.newRole)) return badRequest(`Invalid role: ${body.newRole}`);

      const ts = now();
      const update = { role: body.newRole, updatedAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ roleChanged: true, newRole: body.newRole });
    }

    // ═══ POST: Set branch assignment ═══
    if (event.httpMethod === 'POST' && action === 'setBranchAssignment') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');
      if (!Array.isArray(body.branchIds)) return badRequest('branchIds must be an array');

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      // Validate all branchIds belong to this org
      if (body.branchIds.length > 0) {
        const branchesSnap = await adminDb.collection('branches')
          .where('organizationId', '==', body.organizationId)
          .where('isActive', '==', true).get();
        const validIds = new Set(branchesSnap.docs.map(d => d.id));
        const invalid = body.branchIds.filter((id: string) => !validIds.has(id));
        if (invalid.length > 0) return badRequest(`Invalid branchIds: ${invalid.join(', ')}`);
      }

      // Validate primaryBranchId is in branchIds
      const primaryBranchId = body.primaryBranchId || (body.branchIds.length > 0 ? body.branchIds[0] : null);
      if (primaryBranchId && !body.branchIds.includes(primaryBranchId)) {
        return badRequest('primaryBranchId must be included in branchIds');
      }

      const ts = now();
      const update = { branchIds: body.branchIds, primaryBranchId, updatedAt: ts };

      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ updated: true, branchIds: body.branchIds, primaryBranchId });
    }

    // ═══ POST: Switch active org ═══
    if (event.httpMethod === 'POST' && action === 'switchOrg') {
      const body = JSON.parse(event.body || '{}');
      if (!body.organizationId) return badRequest('organizationId required');

      const ts = now();

      // Switch to Personal Workspace
      if (body.organizationId === 'personal') {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const userData = userDoc.data() || {};
        
        await adminDb.collection('users').doc(user.uid).update({
          activeOrgId: '',
          organizationId: '',
          organizationName: '',
          // default fallback role, will be overridden later if they join another org
          role: userData.role === 'student' ? 'student' : 'teacher', 
          updatedAt: ts,
        });

        return ok({
          switched: true,
          activeOrgId: '',
          role: userData.role === 'student' ? 'student' : 'teacher',
          organizationName: '',
        });
      }

      // Verify user has active membership
      const membership = await getMembership(user.uid, body.organizationId) as any;
      if (!membership || membership.status !== 'active') return badRequest('Not an active member of this org');

      await adminDb.collection('users').doc(user.uid).update({
        activeOrgId: body.organizationId,
        // Keep legacy fields in sync
        organizationId: body.organizationId,
        organizationName: membership.organizationName || '',
        role: membership.role === 'owner' ? 'admin' : membership.role,
        updatedAt: ts,
      });

      return ok({
        switched: true,
        activeOrgId: body.organizationId,
        role: membership.role,
        organizationName: membership.organizationName,
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (e: any) {
    console.error(`api-memberships error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
