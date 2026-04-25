/**
 * API: Organization — unified org-scoped CRUD for courses, groups, materials, schedule, settings.
 * All data strictly scoped by organizationId.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminAuth, adminDb } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, hasRole, hasPermission, getOrgFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  resolveBranchFilter,
  type AuthUser,
} from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
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

  // One bulk query instead of N individual queries
  const existingSnap = await adminDb.collection('studentPaymentPlans')
    .where('organizationId', '==', orgId)
    .where('courseId', '==', courseId)
    .get();
  const existingStudentIds = new Set(existingSnap.docs.map(d => d.data().studentId));

  // Collect new plans to create
  const newPlans: any[] = [];
  for (const studentId of studentIds) {
    if (!existingStudentIds.has(studentId)) {
      newPlans.push({
        organizationId: orgId,
        branchId: branchId || null,
        studentId,
        courseId,
        courseName: courseData.title || '',
        totalAmount: courseData.price,
        paidAmount: 0,
        status: 'pending',
        nextDueDate: courseData.paymentFormat === 'monthly' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }

  // Batch write (max 499 per batch)
  for (let i = 0; i < newPlans.length; i += 499) {
    const batch = adminDb.batch();
    const slice = newPlans.slice(i, i + 499);
    for (const plan of slice) {
      batch.set(adminDb.collection('studentPaymentPlans').doc(), plan);
    }
    await batch.commit();
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
      // Teacher-only filtering: only show assigned entities (skip for admins/managers)
      if (params.teacherOnly === 'true' && !hasRole(user, 'admin', 'manager')) {
        const teacherGroupsSnap = await adminDb.collection('groups')
          .where('organizationId', '==', orgId)
          .where('teacherIds', 'array-contains', user.uid)
          .get();
        const courseIdsFromGroups = new Set(teacherGroupsSnap.docs.map(d => d.data().courseId));

        list = list.filter((c: any) => {
          const tIds: string[] = c.teacherIds || [];
          return tIds.includes(user.uid) || c.createdBy === user.uid || courseIdsFromGroups.has(c.id);
        });
      }
      list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok(list);
    }

    if (action === 'course') {
      if (!params.id) return badRequest('id required');
      const doc = await adminDb.collection('courses').doc(params.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      
      const courseData = { id: doc.id, ...doc.data() };
      
      // Check for pending course request
      if (hasRole(user, 'student') || user.role === 'student' || !hasRole(user, 'admin', 'manager')) {
         const reqSnap = await adminDb.collection('courseRequests')
           .where('orgId', '==', orgId)
           .where('courseId', '==', params.id)
           .where('userId', '==', user.uid)
           .where('status', '==', 'pending')
           .limit(1).get();
         if (!reqSnap.empty) {
            (courseData as any).requestStatus = 'pending';
         }
      }
      
      return ok(courseData);
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
        price: body.price || 0,
        paymentFormat: body.paymentFormat || 'one-time',
        durationMonths: body.durationMonths || 0,
        createdBy: user.uid,
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
      // Teacher-only filtering: only show assigned entities (skip for admins/managers)
      if (params.teacherOnly === 'true' && !hasRole(user, 'admin', 'manager')) {
        list = list.filter((g: any) => {
          const tIds: string[] = g.teacherIds || [];
          return tIds.includes(user.uid) || g.createdBy === user.uid;
        });
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
      const oldData = doc.data()!;
      const { id, ...fields } = body;
      fields.updatedAt = now();
      await adminDb.collection('groups').doc(id).update(fields);
      const updated = await adminDb.collection('groups').doc(id).get();
      const updatedData = updated.data()!;
      
      if (fields.studentIds) {
        // Auto-generate payment plans for newly added students
        await syncPaymentPlans(orgId, updatedData.branchId || null, updatedData.courseId, fields.studentIds).catch(console.error);
        
        // Notify newly added students
        const oldStudents: string[] = oldData.studentIds || [];
        const newStudents: string[] = fields.studentIds || [];
        const addedStudents = newStudents.filter((sid: string) => !oldStudents.includes(sid));
        for (const sid of addedStudents) {
          createNotification({
            recipientId: sid,
            type: 'added_to_group',
            title: 'Добавлен в группу',
            message: `Вы добавлены в группу «${updatedData.name || ''}»${updatedData.courseName ? ` (${updatedData.courseName})` : ''}`,
            link: '/groups',
            organizationId: orgId,
          }).catch(() => {});
        }

        // Cancel pending payment plans for removed students
        const removedStudents = oldStudents.filter((sid: string) => !newStudents.includes(sid));
        if (removedStudents.length > 0 && updatedData.courseId) {
          const plansSnap = await adminDb.collection('studentPaymentPlans')
            .where('organizationId', '==', orgId)
            .where('courseId', '==', updatedData.courseId)
            .get();
          const cancelBatch = adminDb.batch();
          plansSnap.docs.forEach(d => {
            const pd = d.data();
            if (removedStudents.includes(pd.studentId) && pd.status === 'pending' && (pd.paidAmount || 0) === 0) {
              cancelBatch.update(d.ref, { status: 'cancelled', updatedAt: now() });
            }
          });
          await cancelBatch.commit().catch(console.error);
        }
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

      // Verify user has active membership in this organization
      const memberDoc = await adminDb.collection('users').doc(user.uid)
        .collection('memberships').doc(orgId).get();
      if (!memberDoc.exists || memberDoc.data()?.status !== 'active') {
        return forbidden('You must be an active member of this organization to enroll');
      }

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

      await notifyOrgAdmins(orgId, 'added_to_group', 'Новая заявка в группу', `Студент ${user.displayName || user.email} записался в группу ${groupData.name}`);

      return ok({ enrolled: true, groupId: body.groupId });
    }

    if (action === 'enrollInCourse') {
      const body = JSON.parse(event.body || '{}');
      if (!body.courseId) return badRequest('courseId required');

      const courseDoc = await adminDb.collection('courses').doc(body.courseId).get();
      if (!courseDoc.exists || courseDoc.data()?.organizationId !== orgId) return notFound('Course not found');
      
      const courseData = courseDoc.data()!;

      // Check if user is an active member
      const memberDoc = await adminDb.collection('users').doc(user.uid)
        .collection('memberships').doc(orgId).get();
      if (!memberDoc.exists || memberDoc.data()?.status !== 'active') {
        return forbidden('Для записи на курс необходимо быть активным участником организации');
      }

      // Check if request already exists
      const existingSnap = await adminDb.collection('courseRequests')
        .where('orgId', '==', orgId)
        .where('courseId', '==', body.courseId)
        .where('userId', '==', user.uid)
        .where('status', '==', 'pending')
        .limit(1).get();

      if (!existingSnap.empty) {
        return badRequest('Вы уже отправили заявку на этот курс');
      }

      await adminDb.collection('courseRequests').add({
        orgId,
        courseId: body.courseId,
        courseName: courseData.title,
        userId: user.uid,
        userName: user.displayName || '',
        userEmail: user.email || '',
        status: 'pending',
        createdAt: now(),
        updatedAt: now()
      });

      // Notification
      await notifyOrgAdmins(orgId, 'added_to_group', 'Заявка на курс', `Студент ${user.displayName || user.email} хочет записаться на курс ${courseData.title}.`);

      return ok({ requested: true, courseId: body.courseId });
    }

    if (action === 'getCourseRequests') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();

      const snap = await adminDb.collection('courseRequests')
        .where('orgId', '==', orgId)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

      let requests = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Fetch user avatars
      if (requests.length > 0) {
        const uids = requests.map((m: any) => m.userId).filter(Boolean);
        const profileMap: Record<string, any> = {};
        for (let i = 0; i < uids.length; i += 10) {
          const batch = uids.slice(i, i + 10);
          const profileSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
          profileSnap.docs.forEach((d: any) => { profileMap[d.id] = d.data(); });
        }
        requests = requests.map((req: any) => ({
          ...req,
          userAvatarUrl: profileMap[req.userId]?.avatarUrl || profileMap[req.userId]?.photoURL || ''
        }));
      }

      return ok(requests);
    }

    if (action === 'approveCourseRequest') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.requestId || !body.groupId) return badRequest('requestId and groupId required');

      const reqDoc = await adminDb.collection('courseRequests').doc(body.requestId).get();
      if (!reqDoc.exists || reqDoc.data()?.orgId !== orgId) return notFound('Request not found');

      const reqData = reqDoc.data()!;
      if (reqData.status !== 'pending') return badRequest('Request is not pending');

      // Add to group
      await adminDb.collection('groups').doc(body.groupId).update({
        studentIds: FieldValue.arrayUnion(reqData.userId),
        updatedAt: now()
      });

      // Sync payment plan
      const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
      const groupData = groupDoc.data()!;
      await syncPaymentPlans(orgId, groupData.branchId || null, groupData.courseId, [reqData.userId]).catch(console.error);

      // Update request status
      await adminDb.collection('courseRequests').doc(body.requestId).update({
        status: 'approved',
        groupId: body.groupId,
        updatedAt: now()
      });

      return ok({ approved: true });
    }

    if (action === 'rejectCourseRequest') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.requestId) return badRequest('requestId required');

      const reqDoc = await adminDb.collection('courseRequests').doc(body.requestId).get();
      if (!reqDoc.exists || reqDoc.data()?.orgId !== orgId) return notFound('Request not found');

      await adminDb.collection('courseRequests').doc(body.requestId).update({
        status: 'rejected',
        updatedAt: now()
      });

      return ok({ rejected: true });
    }

    // ═══ STUDENTS (users with role=student in this org) ═══
    if (action === 'students') {
      let query: any = adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', 'in', ['active', 'expelled'])
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
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null, status: data.status || 'active' };
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
          return { ...s, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', skills: p.skills || [], username: p.username || '', pinnedBadges: p.pinnedBadges || [], parentPortalKey: p.parentPortalKey || '', createdAt: p.createdAt || '' };
        });
      }
        
      return ok(filtered);
    }

    if (action === 'createStudent') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.displayName) return badRequest('displayName required');

      // Check student limit
      const limits = await getOrgLimits(orgId);
      if (limits.maxStudents !== -1) {
        const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
        if ((orgData?.studentsCount || 0) >= limits.maxStudents) {
          return badRequest('Organization has reached the student limit for its plan.');
        }
      }

      try {
        // Generate a unique ID for the offline student (no Firebase Auth account)
        const studentRef = adminDb.collection('users').doc();
        const studentUid = studentRef.id;

        const profile: Record<string, any> = {
          displayName: body.displayName,
          role: 'student',
          organizationId: orgId,
          activeOrgId: orgId,
          phone: body.phone || '',
          createdByOrg: true,
          offlineStudent: true,   // Flag: not a real Firebase Auth user
          createdAt: now(),
          updatedAt: now(),
        };
        await studentRef.set(profile);

        // Create orgMembers entry so student appears in all lists
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(studentUid).set({
          userId: studentUid,
          userName: body.displayName,
          role: 'student',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          createdByOrg: true,
          offlineStudent: true,
          joinedAt: now()
        });

        // Create membership sub-doc on user for role resolution
        await adminDb.collection('users').doc(studentUid).collection('memberships').doc(orgId).set({
          role: 'student',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          joinedAt: now()
        });

        // Auto-enroll in group if provided
        if (body.groupId) {
          const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
          if (groupDoc.exists && groupDoc.data()?.organizationId === orgId) {
            await adminDb.collection('groups').doc(body.groupId).update({
              studentIds: FieldValue.arrayUnion(studentUid),
              updatedAt: now(),
            });
            // Auto-generate payment plans for the course
            const courseId = body.courseId || groupDoc.data()?.courseId;
            if (courseId) {
              await syncPaymentPlans(orgId, body.primaryBranchId || null, courseId, [studentUid]).catch(console.error);
            }
          }
        }

        return ok({ uid: studentUid, ...profile });
      } catch (e: any) {
        throw e;
      }
    }

    if (action === 'updateStudent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');
      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      if (!userDoc.exists) return notFound();
      // Verify student belongs to this org via membership (not flat field)
      const studentMemberDoc = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members').doc(body.uid).get();
      if (!studentMemberDoc.exists) return notFound();

      // Whitelist: only allow safe profile fields — prevent privilege escalation
      const ALLOWED_FIELDS = ['displayName', 'phone', 'city', 'bio', 'avatarUrl', 'skills', 'country', 'username'];
      const updateData: Record<string, any> = { updatedAt: now() };
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }
      await adminDb.collection('users').doc(body.uid).update(updateData);

      // Also sync displayName to orgMembers if changed
      if (body.displayName) {
        await adminDb.collection('orgMembers').doc(orgId)
          .collection('members').doc(body.uid)
          .update({ userName: body.displayName, updatedAt: now() }).catch(() => {});
      }

      return ok({ uid: body.uid, updated: true });
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
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
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
          activeOrgId: orgId,
          phone: body.phone || '',
          createdAt: now(),
          updatedAt: now(),
        };
        await adminDb.collection('users').doc(authUser.uid).set(profile);

        // Create orgMembers entry (consistent with createStudent)
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(authUser.uid).set({
          userId: authUser.uid,
          userEmail: body.email,
          userName: body.displayName,
          role: 'teacher',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          createdByOrg: true,
          joinedAt: now(),
        });

        // Create membership sub-doc on user for role resolution
        await adminDb.collection('users').doc(authUser.uid).collection('memberships').doc(orgId).set({
          role: 'teacher',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          organizationId: orgId,
          joinedAt: now(),
        });

        return ok({ uid: authUser.uid, ...profile });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email already registered in authentication system');
        throw e;
      }
    }

    // ═══ MANAGERS (users with role=manager in this org) ═══
    if (action === 'managers') {
      if (!hasPermission(user, 'managers')) return forbidden('No access to managers module');
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
      if (!hasPermission(user, 'managers')) return forbidden('No access to managers module');
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
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
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
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Only admins and managers can modify the schedule');
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
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Only admins and managers can modify the schedule');
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
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Only admins and managers can modify the schedule');
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
      const snap = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', '==', 'active')
        .get();
      const members = snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], status: data.status || 'active' };
      });
      return ok(members);
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
      const [studentsSnap, teachersSnap] = await Promise.all([
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', '==', 'student').count().get().catch(() => ({ data: () => ({ count: 0 }) })),
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', '==', 'teacher').count().get().catch(() => ({ data: () => ({ count: 0 }) }))
      ]);

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
        studentsCount: studentsSnap.data().count,
        teachersCount: teachersSnap.data().count,
        storageUsedMb: orgData?.storageUsedMb || 0,
      });
    }

    if (action === 'updateOrgSettings') {
      if (!hasPermission(user, 'settings')) return forbidden('No access to settings module');
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
      await adminDb.collection('organizations').doc(orgId).update(orgUpdate);

      // Settings doc (academic config)
      const settingsData = {
        timezone: body.timezone, locale: body.locale,
        academicYearStart: body.academicYearStart,
        academicYearEnd: body.academicYearEnd,
        gradingScale: body.gradingScale,
        passingScore: body.passingScore,
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
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', '==', 'student').where('status', '==', 'active').get(),
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', 'in', ['teacher', 'mentor']).where('status', '==', 'active').get(),
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

    // ═══ MANAGER PERMISSIONS ═══
    if (action === 'getManagerPermissions') {
      if (!hasRole(user, 'admin')) return forbidden();
      const targetUid = params.uid;
      if (!targetUid) return badRequest('uid required');
      const memberDoc = await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(targetUid).get();
      if (!memberDoc.exists) return notFound('Member not found');
      const data = memberDoc.data()!;
      return ok({
        permissions: {
          finances: data.permissions?.finances === true,
          settings: data.permissions?.settings === true,
          managers: data.permissions?.managers === true,
          branches: data.permissions?.branches === true,
        }
      });
    }

    if (action === 'updateManagerPermissions') {
      if (!hasRole(user, 'admin')) return forbidden('Only admin can update manager permissions');
      const body = JSON.parse(event.body || '{}');
      if (!body.uid || !body.permissions) return badRequest('uid and permissions required');

      const permData = {
        finances: body.permissions.finances === true,
        settings: body.permissions.settings === true,
        managers: body.permissions.managers === true,
        branches: body.permissions.branches === true,
      };

      // Update org-side membership
      await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(body.uid).update({
        permissions: permData,
        updatedAt: now(),
      });

      // Mirror to user-side membership (use set+merge in case doc doesn't exist yet)
      await adminDb.collection('users').doc(body.uid).collection('memberships').doc(orgId).set({
        permissions: permData,
        role: 'manager',
        status: 'active',
        updatedAt: now(),
      }, { merge: true });

      return ok({ message: 'Permissions updated', permissions: permData });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (e: any) {
    console.error(`api-org error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
