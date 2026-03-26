/**
 * API: Organization — unified org-scoped CRUD for courses, groups, materials, schedule, settings.
 * All data strictly scoped by organizationId.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, adminAuth } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, hasRole, getOrgFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  resolveBranchFilter,
  type AuthUser,
} from './utils/auth';
import { createNotification } from './utils/notifications';

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
  if (!user.organizationId) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;

  try {
    // ═══ COURSES ═══
    if (action === 'courses') {
      const branchScope = resolveBranchFilter(user, params.branchId);
      let query = orgQuery('courses', orgId);
      if (branchScope === '__DENIED__') return ok([]);
      if (typeof branchScope === 'string') query = query.where('branchId', '==', branchScope) as any;
      const snap = await query.get();
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
      const snap = await query.get();
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
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('groups').add(data);
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
      return ok({ id, ...updated.data() });
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
      let students = snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
      });

      // Multi-branch manager: filter in memory
      if (!params.branchId && hasRole(user, 'manager') && user.branchIds.length > 1) {
        students = students.filter((s: any) => 
          s.branchIds.length === 0 || s.branchIds.some((id: string) => user.branchIds.includes(id))
        );
      }
        
      return ok(students);
    }

    if (action === 'createStudent') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.displayName || !body.password) return badRequest('email, displayName and password required');
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
      return ok(snap.docs.map((d: any) => {
        const data = d.data();
        return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
      }));
    }

    if (action === 'createTeacher') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.displayName || !body.password) return badRequest('email, displayName and password required');
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

    if (action === 'inviteUser') {
      if (!hasRole(user, 'admin')) return forbidden();
      const body = JSON.parse(event.body || '{}');
      if (!body.email || !body.role) return badRequest('email and role required');
      // Look up org name
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      const organizationName = orgDoc.exists ? orgDoc.data()?.name || '' : '';
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
      let query = orgQuery('materials', orgId);
      if (params.courseId) query = query.where('courseId', '==', params.courseId) as any;
      if (params.lessonId) query = query.where('lessonId', '==', params.lessonId) as any;
      const snap = await query.get();
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok(list);
    }

    if (action === 'createMaterial') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.title || !body.url) return badRequest('title and url required');
      const data = {
        organizationId: orgId,
        title: body.title, type: body.type || 'link',
        url: body.url, category: body.category || 'general',
        lessonId: body.lessonId || null, courseId: body.courseId || null,
        authorId: user.uid, authorName: user.displayName,
        createdAt: now(),
      };
      const ref = await adminDb.collection('materials').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'deleteMaterial') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('materials').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      await adminDb.collection('materials').doc(body.id).delete();
      return ok({ deleted: true });
    }

    // ═══ SCHEDULE ═══
    if (action === 'schedule') {
      const branchScope = resolveBranchFilter(user, params.branchId);
      let query = orgQuery('scheduleEvents', orgId);
      if (params.from) query = query.where('date', '>=', params.from) as any;
      if (params.to) query = query.where('date', '<=', params.to) as any;
      if (params.groupId) query = query.where('groupId', '==', params.groupId) as any;
      if (branchScope === '__DENIED__') return ok([]);
      if (typeof branchScope === 'string') query = query.where('branchId', '==', branchScope) as any;
      const snap = await query.get();
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      if (Array.isArray(branchScope)) {
        list = list.filter((e: any) => !e.branchId || branchScope.includes(e.branchId));
      }
      list.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
      return ok(list);
    }

    if (action === 'createEvent') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.title || !body.date || !body.startTime) return badRequest('title, date, startTime required');
      const data = {
        organizationId: orgId,
        branchId: body.branchId || null,
        type: body.type || 'lesson',
        title: body.title,
        groupId: body.groupId || null, groupName: body.groupName || '',
        courseId: body.courseId || null, courseName: body.courseName || '',
        teacherId: body.teacherId || null, teacherName: body.teacherName || '',
        examId: body.examId || null, lessonId: body.lessonId || null,
        date: body.date, startTime: body.startTime,
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
