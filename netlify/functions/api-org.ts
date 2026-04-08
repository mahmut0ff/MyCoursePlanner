/**
 * API: Organization — unified org-scoped CRUD for courses, groups, materials, schedule, settings.
 * All data strictly scoped by organizationId.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminAuth, adminDb } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, hasRole, getOrgFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  resolveBranchFilter,
  type AuthUser,
} from './utils/auth';
import { createNotification } from './utils/notifications';
import { FieldValue } from 'firebase-admin/firestore';
import { getOrgLimits } from './utils/plan-limits';
/* ═══════════════════════════════════════════════ */
/*  Helpers                                        */
/* ═══════════════════════════════════════════════ */
const now = () => new Date().toISOString();

/** Ensure user has org access and is admin/teacher */
function requireOrgStaff(user: AuthUser) {
  if (!user.organizationId) return forbidden();
  if (!isStaff(user)) return forbidden();
  return null;
}

/**
 * Helper to auto-generate payment plans for students enrolled in a priced course.
 */
async function syncPaymentPlans(orgId: string, branchId: string | null, courseId: string, studentIds: string[]) {
  if (!studentIds || studentIds.length === 0) return;
  
  const courseDoc = await adminDb.collection('courses').doc(courseId).get();
  if (!courseDoc.exists) return;
  const courseData = courseDoc.data()!;
  
  if (!courseData.price || courseData.price <= 0) return; // Free course

  for (const studentId of studentIds) {
    const existing = await adminDb.collection('studentPaymentPlans')
      .where('organizationId', '==', orgId)
      .where('courseId', '==', courseId)
      .where('studentId', '==', studentId)
      .limit(1).get();

    if (existing.empty) {
      await adminDb.collection('studentPaymentPlans').add({
        organizationId: orgId,
        branchId: branchId || null,
        studentId,
        courseId,
        totalAmount: courseData.price,
        paidAmount: 0,
        status: 'pending',
        nextDueDate: courseData.paymentFormat === 'monthly' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }
}

/** Get org-scoped collection query */
function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

/* ═══════════════════════════════════════════════ */
/*  Handler                                        */
/* ═══════════════════════════════════════════════ */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId || '';

  try {
    // ═══ COURSES ═══
    if (action === 'courses') {
      const branchScope = resolveBranchFilter(user, params.branchId);
      let query = orgQuery('courses', orgId);
      if (branchScope === '__DENIED__') return ok([]);
      if (typeof branchScope === 'string') query = query.where('branchId', '==', branchScope) as any;
      let snap;
      try { snap = await query.orderBy('createdAt', 'desc').limit(200).get(); }
      catch { snap = await query.get(); }
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      // For multi-branch array scope, filter in memory
      if (Array.isArray(branchScope)) {
        list = list.filter((c: any) => !c.branchId || branchScope.includes(c.branchId));
      }
      list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok(list);
    }

    if (action === 'course') {
      if (!params.id) return badRequest('id required');
      const doc = await adminDb.collection('courses').doc(params.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      return ok({ id: doc.id, ...doc.data() });
    }

    if (action === 'createCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.title) return badRequest('title required');
      const data = {
        organizationId: orgId,
        branchId: body.branchId || null,
        title: body.title,
        description: body.description || '',
        subject: body.subject || '',
        teacherIds: body.teacherIds || [],
        lessonIds: body.lessonIds || [],
        status: body.status || 'draft',
        coverImageUrl: body.coverImageUrl || '',
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('courses').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('courses').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const { id, ...fields } = body;
      fields.updatedAt = now();
      await adminDb.collection('courses').doc(id).update(fields);
      const updated = await adminDb.collection('courses').doc(id).get();
      return ok({ id, ...updated.data() });
    }

    if (action === 'deleteCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('courses').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      await adminDb.collection('courses').doc(body.id).delete();
      return ok({ deleted: true });
    }

    // ═══ GROUPS ═══
    if (action === 'groups') {
      const branchScope = resolveBranchFilter(user, params.branchId);
      let query = orgQuery('groups', orgId);
      if (params.courseId) query = query.where('courseId', '==', params.courseId) as any;
      if (branchScope === '__DENIED__') return ok([]);
      if (typeof branchScope === 'string') query = query.where('branchId', '==', branchScope) as any;
      let snap;
      try { snap = await query.orderBy('createdAt', 'desc').limit(200).get(); }
      catch { snap = await query.get(); }
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      if (Array.isArray(branchScope)) {
        list = list.filter((g: any) => !g.branchId || branchScope.includes(g.branchId));
      }
      list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok(list);
    }

    if (action === 'group') {
      if (!params.id) return badRequest('id required');
      const doc = await adminDb.collection('groups').doc(params.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      return ok({ id: doc.id, ...doc.data() });
    }

    if (action === 'createGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.name || !body.courseId) return badRequest('name and courseId required');
      const data = {
        organizationId: orgId,
        branchId: body.branchId || null,
        courseId: body.courseId,
        courseName: body.courseName || '',
        name: body.name,
        studentIds: body.studentIds || [],
        teacherIds: body.teacherIds || [],
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('groups').add(data);
      
      // Auto-generate payment plans
      await syncPaymentPlans(orgId, data.branchId, data.courseId, data.studentIds).catch(console.error);
      
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('groups').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const { id, ...fields } = body;
      fields.updatedAt = now();
      await adminDb.collection('groups').doc(id).update(fields);
      const updated = await adminDb.collection('groups').doc(id).get();
      const updatedData = updated.data()!;
      
      // Auto-generate payment plans for newly added students
      if (fields.studentIds) {
        // Technically syncPaymentPlans handles idempotency, so we can just pass all current studentIds
        await syncPaymentPlans(orgId, updatedData.branchId || null, updatedData.courseId, fields.studentIds).catch(console.error);
      }

      return ok({ id, ...updatedData });
    }

    if (action === 'deleteGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('groups').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      await adminDb.collection('groups').doc(body.id).delete();
      return ok({ deleted: true });
    }

    if (action === 'enrollInGroup') {
      // Allow students to enroll themselves in a group
      const body = JSON.parse(event.body || '{}');
      if (!body.groupId) return badRequest('groupId required');

      const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
      if (!groupDoc.exists || groupDoc.data()?.organizationId !== orgId) return notFound('Group not found');
      
      const groupData = groupDoc.data()!;
      
      // Update group's studentIds
      await adminDb.collection('groups').doc(body.groupId).update({
        studentIds: FieldValue.arrayUnion(user.uid),
        updatedAt: now()
      });

      // Synchronize payment plans
      await syncPaymentPlans(orgId, groupData.branchId || null, groupData.courseId, [user.uid]).catch(console.error);

      return ok({ enrolled: true, groupId: body.groupId });
    }

    // ═══ STUDENTS (users with role=student in this org) ═══
    if (action === 'students') {
      let query: any = adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', '==', 'active')
        .where('role', '==', 'student');
      
      // Apply branch filter if requested
      if (params.branchId) {
        query = query.where('branchIds', 'array-contains', params.branchId);
      } else if (hasRole(user, 'manager') && user.branchIds.length > 0) {
        // Managers auto-scoped to their branches (array-contains supports single value)
        if (user.branchIds.length === 1) {
          query = query.where('branchIds', 'array-contains', user.branchIds[0]);
        }
      }
      
      const snap = await query.get();
      const memberDocs = snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
      });

      // Multi-branch manager: filter in memory
      let filtered = memberDocs;
      if (!params.branchId && hasRole(user, 'manager') && user.branchIds.length > 1) {
        filtered = memberDocs.filter((s: any) => 
          s.branchIds.length === 0 || s.branchIds.some((id: string) => user.branchIds.includes(id))
        );
      }

      // Enrich with user profile data (avatarUrl, phone, city, createdAt)
      if (filtered.length > 0) {
        const uids = filtered.map((s: any) => s.uid);
        const batches = [];
        for (let i = 0; i < uids.length; i += 10) {
          batches.push(uids.slice(i, i + 10));
        }
        const profileMap: Record<string, any> = {};
        for (const batch of batches) {
          const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
          profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
        }
        filtered = filtered.map((s: any) => {
          const p = profileMap[s.uid] || {};
          return { ...s, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', createdAt: p.createdAt || '' };
        });
      }
        
      return ok(filtered);
    }

    if (action === 'createStudent') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.displayName || !body.password) return badRequest('email, displayName and password required');

      // Check student limit
      const limits = await getOrgLimits(orgId);
      if (limits.maxStudents !== -1) {
        const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
        if ((orgData?.studentsCount || 0) >= limits.maxStudents) {
          return badRequest('Organization has reached the student limit for its plan.');
        }
      }

      try {
        // Check if user already exists in Firestore
        const existing = await adminDb.collection('users').where('email', '==', body.email).get();
        if (!existing.empty) return badRequest('User with this email already exists');
        // Create Firebase Auth user
        const authUser = await adminAuth.createUser({
          email: body.email,
          password: body.password,
          displayName: body.displayName,
        });
        // Create Firestore user profile
        const profile = {
          email: body.email,
          displayName: body.displayName,
          role: 'student',
          organizationId: orgId,
          phone: body.phone || '',
          createdAt: now(),
          updatedAt: now(),
        };
        await adminDb.collection('users').doc(authUser.uid).set(profile);
        return ok({ uid: authUser.uid, ...profile });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email already registered in authentication system');
        throw e;
      }
    }

    if (action === 'updateStudent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');
      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      if (!userDoc.exists || userDoc.data()?.organizationId !== orgId) return notFound();
      const { uid, ...fields } = body;
      fields.updatedAt = now();
      await adminDb.collection('users').doc(uid).update(fields);
      return ok({ uid, updated: true });
    }

    // ═══ TEACHERS (users with role=teacher in this org) ═══
    if (action === 'teachers') {
      let query: any = adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', '==', 'active')
        .where('role', 'in', ['teacher', 'admin', 'owner', 'mentor']);

      if (params.branchId) {
        query = query.where('branchIds', 'array-contains', params.branchId);
      }
      
      const snap = await query.get();
      const members = snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
      });

      // Enrich with user profile data (avatarUrl, phone, city, createdAt)
      let enriched = members;
      if (members.length > 0) {
        const uids = members.map((t: any) => t.uid);
        const batches = [];
        for (let i = 0; i < uids.length; i += 10) {
          batches.push(uids.slice(i, i + 10));
        }
        const profileMap: Record<string, any> = {};
        for (const batch of batches) {
          const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
          profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
        }
        enriched = members.map((t: any) => {
          const p = profileMap[t.uid] || {};
          return { ...t, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', createdAt: p.createdAt || '' };
        });
      }

      return ok(enriched);
    }

    if (action === 'createTeacher') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.displayName || !body.password) return badRequest('email, displayName and password required');

      // Check teacher limit
      const limits = await getOrgLimits(orgId);
      if (limits.maxTeachers !== -1) {
        const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
        if ((orgData?.teachersCount || 0) >= limits.maxTeachers) {
          return badRequest('Organization has reached the teacher limit for its plan.');
        }
      }

      try {
        const existing = await adminDb.collection('users').where('email', '==', body.email).get();
        if (!existing.empty) return badRequest('User with this email already exists');
        const authUser = await adminAuth.createUser({
          email: body.email,
          password: body.password,
          displayName: body.displayName,
        });
        const profile = {
          email: body.email,
          displayName: body.displayName,
          role: 'teacher',
          organizationId: orgId,
          phone: body.phone || '',
          createdAt: now(),
          updatedAt: now(),
        };
        await adminDb.collection('users').doc(authUser.uid).set(profile);
        return ok({ uid: authUser.uid, ...profile });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email already registered in authentication system');
        throw e;
      }
    }

    // ═══ MANAGERS (users with role=manager in this org) ═══
    if (action === 'managers') {
      let query: any = adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', '==', 'active')
        .where('role', '==', 'manager');

      if (params.branchId) {
        query = query.where('branchIds', 'array-contains', params.branchId);
      }
      
      const snap = await query.get();
      const members = snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
      });

      let enriched = members;
      if (members.length > 0) {
        const uids = members.map((t: any) => t.uid);
        const batches = [];
        for (let i = 0; i < uids.length; i += 10) {
          batches.push(uids.slice(i, i + 10));
        }
        const profileMap: Record<string, any> = {};
        for (const batch of batches) {
          const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
          profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
        }
        enriched = members.map((t: any) => {
          const p = profileMap[t.uid] || {};
          return { ...t, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', createdAt: p.createdAt || '' };
        });
      }

      return ok(enriched);
    }

    if (action === 'createManager') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.displayName || !body.password) return badRequest('email, displayName and password required');

      // Check teacher limit (managers count towards teachers)
      const limits = await getOrgLimits(orgId);
      if (limits.maxTeachers !== -1) {
        const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
        if ((orgData?.teachersCount || 0) >= limits.maxTeachers) {
          return badRequest('Organization has reached the manager/teacher limit for its plan.');
        }
      }

      try {
        const existing = await adminDb.collection('users').where('email', '==', body.email).get();
        if (!existing.empty) return badRequest('User with this email already exists');
        const authUser = await adminAuth.createUser({
          email: body.email,
          password: body.password,
          displayName: body.displayName,
        });
        const profile = {
          email: body.email,
          displayName: body.displayName,
          role: 'manager',
          organizationId: orgId,
          phone: body.phone || '',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          createdAt: now(),
          updatedAt: now(),
        };
        await adminDb.collection('users').doc(authUser.uid).set(profile);
        
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(authUser.uid).set({
          userId: authUser.uid,
          userEmail: body.email,
          userName: body.displayName,
          role: 'manager',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          joinedAt: now()
        });
        
        return ok({ uid: authUser.uid, ...profile });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email already registered in authentication system');
        throw e;
      }
    }


    if (action === 'inviteUser') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.role) return badRequest('email and role required');
      
      // Check limits
      const limits = await getOrgLimits(orgId);
      const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
      const organizationName = orgData?.name || '';

      if (body.role === 'student' && limits.maxStudents !== -1 && (orgData?.studentsCount || 0) >= limits.maxStudents) {
         return badRequest('Organization has reached the student limit for its plan.');
      }
      if (['teacher', 'mentor', 'admin', 'manager'].includes(body.role) && limits.maxTeachers !== -1 && (orgData?.teachersCount || 0) >= limits.maxTeachers) {
         return badRequest('Organization has reached the teacher limit for its plan.');
      }

      // Check if user is already in this org
      const existing = await adminDb.collection('users').where('email', '==', body.email).get();
      if (!existing.empty) {
        const existingUser = existing.docs[0];
        if (existingUser.data()?.organizationId === orgId) return badRequest('User already in organization');
      }
      // Check for duplicate pending invite
      const existingInvite = await adminDb.collection('invites')
        .where('email', '==', body.email)
        .where('organizationId', '==', orgId)
        .where('status', '==', 'pending').get();
      if (!existingInvite.empty) return badRequest('Invite already sent');
      // Always create pending invite — teacher must accept
      const data = {
        email: body.email, role: body.role,
        organizationId: orgId, organizationName,
        invitedBy: user.uid, invitedByName: user.displayName,
        status: 'pending', createdAt: now(),
      };
      const ref = await adminDb.collection('invites').add(data);
      // Notify teacher (if already registered)
      if (!existing.empty) {
        const teacherId = existing.docs[0].id;
        createNotification({
          recipientId: teacherId, type: 'invite_received',
          title: 'Приглашение от организации',
          message: `${organizationName} приглашает вас`,
          link: '/invites',
        }).catch(() => {});
      }
      return ok({ id: ref.id, ...data });
    }

    // ═══ MATERIALS ═══
    if (action === 'materials') {
      let query;
      if (orgId) {
        query = orgQuery('materials', orgId);
      } else {
        query = adminDb.collection('materials').where('authorId', '==', user.uid).where('organizationId', '==', '');
      }
      if (params.courseId) query = query.where('courseId', '==', params.courseId) as any;
      if (params.lessonId) query = query.where('lessonId', '==', params.lessonId) as any;
      const snap = await query.get();
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      // Temporary fallback for independent teachers who might have null orgId
      if (!orgId) {
        const snap2 = await adminDb.collection('materials').where('authorId', '==', user.uid).where('organizationId', '==', null).get();
        const list2 = snap2.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        list = [...list, ...list2].reduce((acc, curr) => {
           if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
           return acc;
        }, [] as any[]);
      }
      list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok(list);
    }

    if (action === 'createMaterial') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.title || !body.url) return badRequest('title and url required');
      const data = {
        organizationId: orgId,
        title: body.title, type: body.type || 'link',
        url: body.url, category: body.category || 'general',
        lessonId: body.lessonId || null, courseId: body.courseId || null,
        description: body.description || '',
        tags: body.tags || [],
        sizeBytes: body.sizeBytes || null,
        mimeType: body.mimeType || '',
        authorId: user.uid, authorName: user.displayName,
        createdAt: now(),
      };
      const ref = await adminDb.collection('materials').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateMaterial') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('materials').doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId && doc.data()?.organizationId !== orgId) return forbidden();
      const { id, ...fields } = body;
      await adminDb.collection('materials').doc(id).update(fields);
      return ok({ id, updated: true });
    }

    if (action === 'deleteMaterial') {
      if (!isStaff(user)) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('materials').doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId && doc.data()?.organizationId !== orgId) return forbidden();
      await adminDb.collection('materials').doc(body.id).delete();
      return ok({ deleted: true });
    }

    // ═══ SCHEDULE ═══
    if (action === 'schedule') {
      const branchScope = resolveBranchFilter(user, params.branchId);
      let query = orgQuery('scheduleEvents', orgId);

      // Timetable mode: fetch recurring weekly lessons by dayOfWeek
      if (params.mode === 'timetable') {
        query = query.where('recurring', '==', true) as any;
      } else {
        // Events mode: fetch by date range
        if (params.from) query = query.where('date', '>=', params.from) as any;
        if (params.to) query = query.where('date', '<=', params.to) as any;
      }
      if (params.groupId) query = query.where('groupId', '==', params.groupId) as any;
      if (branchScope === '__DENIED__') return ok([]);
      if (typeof branchScope === 'string') query = query.where('branchId', '==', branchScope) as any;
      const snap = await query.get();
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      if (Array.isArray(branchScope)) {
        list = list.filter((e: any) => !e.branchId || branchScope.includes(e.branchId));
      }

      // ── Student group-level filtering ──
      // Students should only see events for THEIR groups (or org-wide events with no groupId).
      // Teachers with specific groups see only their groups too.
      if (hasRole(user, 'student')) {
        const studentGroupsSnap = await adminDb.collection('groups')
          .where('organizationId', '==', orgId)
          .where('studentIds', 'array-contains', user.uid).get();
        const myGroupIds = new Set(studentGroupsSnap.docs.map((d: any) => d.id));
        list = list.filter((e: any) => !e.groupId || myGroupIds.has(e.groupId));
      } else if (hasRole(user, 'teacher') && !hasRole(user, 'admin')) {
        // Teachers see events for their groups + events they teach + org-wide events
        const teacherGroupsSnap = await adminDb.collection('groups')
          .where('organizationId', '==', orgId)
          .where('teacherIds', 'array-contains', user.uid).get();
        const myGroupIds = new Set(teacherGroupsSnap.docs.map((d: any) => d.id));
        list = list.filter((e: any) =>
          !e.groupId ||                           // org-wide events always shown
          myGroupIds.has(e.groupId) ||             // events for teacher's groups
          e.teacherId === user.uid                 // events assigned to this teacher
        );
      }

      if (params.mode === 'timetable') {
        list.sort((a: any, b: any) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || (a.startTime || '').localeCompare(b.startTime || ''));
      } else {
        list.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
      }
      return ok(list);
    }

    if (action === 'createEvent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      const isRecurring = body.recurring === true;
      if (!body.title || !body.startTime) return badRequest('title and startTime required');
      if (!isRecurring && !body.date) return badRequest('date required for non-recurring events');
      if (isRecurring && (body.dayOfWeek === undefined || body.dayOfWeek === null)) return badRequest('dayOfWeek required for recurring events');
      const data: Record<string, any> = {
        organizationId: orgId,
        branchId: body.branchId || null,
        type: body.type || 'lesson',
        title: body.title,
        recurring: isRecurring,
        dayOfWeek: isRecurring ? Number(body.dayOfWeek) : null, // 0=Mon, 1=Tue, ..., 6=Sun
        groupId: body.groupId || null, groupName: body.groupName || '',
        courseId: body.courseId || null, courseName: body.courseName || '',
        teacherId: body.teacherId || null, teacherName: body.teacherName || '',
        examId: body.examId || null, lessonId: body.lessonId || null,
        date: isRecurring ? null : body.date,
        startTime: body.startTime,
        endTime: body.endTime || '', duration: body.duration || 45,
        location: body.location || '', notes: body.notes || '',
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('scheduleEvents').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateEvent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('scheduleEvents').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const { id, ...fields } = body;
      fields.updatedAt = now();
      await adminDb.collection('scheduleEvents').doc(id).update(fields);
      return ok({ id, updated: true });
    }

    if (action === 'deleteEvent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      await adminDb.collection('scheduleEvents').doc(body.id).delete();
      return ok({ deleted: true });
    }

    // ═══ RESULTS ═══
    if (action === 'results') {
      let query: any = adminDb.collection('examAttempts').where('organizationId', '==', orgId);
      if (params.studentId) query = query.where('studentId', '==', params.studentId);
      if (params.examId) query = query.where('examId', '==', params.examId);
      const snap = await query.get();
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      return ok(list.slice(0, 100));
    }

    // ═══ ORG USERS ═══
    if (action === 'orgUsers') {
      const snap = await adminDb.collection('users')
        .where('organizationId', '==', orgId).get();
      return ok(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() })));
    }

    if (action === 'updateUserRole') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.uid || !body.role) return badRequest('uid and role required');
      if (!['admin', 'manager', 'teacher', 'student'].includes(body.role)) return badRequest('Invalid role');
      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      if (!userDoc.exists || userDoc.data()?.organizationId !== orgId) return notFound();
      await adminDb.collection('users').doc(body.uid).update({ role: body.role, updatedAt: now() });
      return ok({ uid: body.uid, role: body.role });
    }

    // ═══ ORG SETTINGS ═══
    if (action === 'orgSettings') {
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      if (!orgDoc.exists) return notFound();
      const settingsDoc = await adminDb.collection('orgSettings').doc(orgId).get();
      const orgData = orgDoc.data();
      const sData = settingsDoc.data() || {};
      return ok({
        organizationId: orgId,
        name: orgData?.name || '',
        slug: orgData?.slug || '',
        logo: orgData?.logo || '',
        description: orgData?.description || '',
        isOnline: orgData?.isOnline || false,
        publicProfileEnabled: orgData?.publicProfileEnabled || false,
        contactLinks: orgData?.contactLinks || {},
        city: orgData?.city || '',
        country: orgData?.country || '',
        address: orgData?.address || '',
        contactEmail: orgData?.contactEmail || '',
        contactPhone: orgData?.contactPhone || '',
        workingHours: orgData?.workingHours || '',
        photos: orgData?.photos || [],
        subjects: orgData?.subjects || [],
        timezone: sData.timezone || 'Asia/Bishkek',
        locale: sData.locale || 'ru',
        academicYearStart: sData.academicYearStart || '',
        academicYearEnd: sData.academicYearEnd || '',
        gradingScale: sData.gradingScale || 'percentage',
        passingScore: sData.passingScore || 60,
        primaryColor: sData.primaryColor || '#6366f1',
        updatedAt: sData.updatedAt || '',
      });
    }

    if (action === 'updateOrgSettings') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');

      // Fields that go to the public organizations doc
      const orgUpdate: Record<string, any> = { updatedAt: now() };
      if (body.name) orgUpdate.name = body.name;
      if (body.logo !== undefined) orgUpdate.logo = body.logo;
      if (body.description !== undefined) orgUpdate.description = body.description;
      if (body.isOnline !== undefined) orgUpdate.isOnline = body.isOnline;
      if (body.publicProfileEnabled !== undefined) orgUpdate.publicProfileEnabled = body.publicProfileEnabled;
      if (body.contactLinks !== undefined) orgUpdate.contactLinks = body.contactLinks;
      if (body.workingHours !== undefined) orgUpdate.workingHours = body.workingHours;
      if (body.address !== undefined) orgUpdate.address = body.address;
      if (body.contactEmail !== undefined) orgUpdate.contactEmail = body.contactEmail;
      if (body.contactPhone !== undefined) orgUpdate.contactPhone = body.contactPhone;
      if (body.photos !== undefined) orgUpdate.photos = body.photos;
      if (body.city !== undefined) orgUpdate.city = body.city;
      if (body.country !== undefined) orgUpdate.country = body.country;
      if (body.subjects !== undefined) orgUpdate.subjects = body.subjects;
      if (body.primaryColor !== undefined) orgUpdate.primaryColor = body.primaryColor;
      await adminDb.collection('organizations').doc(orgId).update(orgUpdate);

      // Settings doc (academic config)
      const settingsData = {
        timezone: body.timezone, locale: body.locale,
        academicYearStart: body.academicYearStart,
        academicYearEnd: body.academicYearEnd,
        gradingScale: body.gradingScale,
        passingScore: body.passingScore,
        primaryColor: body.primaryColor,
        updatedAt: now(),
      };
      await adminDb.collection('orgSettings').doc(orgId).set(settingsData, { merge: true });
      return ok({ updated: true });
    }

    // ═══ ORG DASHBOARD STATS ═══
    if (action === 'dashboardStats') {
      const [coursesSnap, groupsSnap, studentsSnap, teachersSnap, lessonsSnap, examsSnap, roomsSnap] = await Promise.all([
        orgQuery('courses', orgId).get(),
        orgQuery('groups', orgId).get(),
        adminDb.collection('users').where('organizationId', '==', orgId).where('role', '==', 'student').get(),
        adminDb.collection('users').where('organizationId', '==', orgId).where('role', 'in', ['teacher', 'admin']).get(),
        orgQuery('lessonPlans', orgId).get(),
        orgQuery('exams', orgId).get(),
        orgQuery('examRooms', orgId).where('status', '==', 'active').get(),
      ]);
      return ok({
        totalCourses: coursesSnap.size,
        totalGroups: groupsSnap.size,
        totalStudents: studentsSnap.size,
        totalTeachers: teachersSnap.size,
        totalLessons: lessonsSnap.size,
        totalExams: examsSnap.size,
        activeRooms: roomsSnap.size,
      });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (e: any) {
    console.error(`api-org error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
