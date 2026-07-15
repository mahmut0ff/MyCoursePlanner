/**
 * API: Organization — unified org-scoped CRUD for courses, groups, materials, schedule, settings.
 * All data strictly scoped by organizationId.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminAuth, adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, isSuperAdmin, hasRole, hasPermission, can, getOrgFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  resolveBranchFilter,
  type AuthUser,
} from './utils/auth';
import { createNotification, notifyOrgAdmins, notifyGroupMembers } from './utils/notifications';
import { FieldValue } from 'firebase-admin/firestore';
import { getOrgLimits } from './utils/plan-limits';
import { billingPeriodKey, billingDeadlineISO } from './utils/billing';
/* ═══════════════════════════════════════════════ */
/*  Helpers                                        */
/* ═══════════════════════════════════════════════ */
const now = () => new Date().toISOString();

/**
 * A member "holds" an app role if it's their primary `role` OR appears in their
 * multi-role `roles[]` set. Used so a multi-role member (e.g. teacher + manager)
 * shows up under every list they belong to, not just their primary role. Falls
 * back to the single `role` field for legacy members that have no `roles` array.
 */
function memberHoldsRole(m: { role?: string; roles?: string[] }, wanted: string[]): boolean {
  const held = new Set<string>([m.role, ...(Array.isArray(m.roles) ? m.roles : [])].filter(Boolean) as string[]);
  return wanted.some((r) => held.has(r));
}

// ─── Schedule conflict detection ───────────────────────────────────────────
// Authoritative server-side check so EVERY path (manual create, drag&drop, paste,
// AI import) is protected — the client check only sees the loaded week/branch.

/** "HH:MM" → minutes since midnight, or null if unparseable. */
function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Weekday in the app's convention (0=Mon … 6=Sun) from a YYYY-MM-DD string. */
function appDayOfWeek(dateStr: string): number {
  const js = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun … 6=Sat
  return (js + 6) % 7;
}

interface ConflictCandidate {
  recurring: boolean;
  dayOfWeek: number | null;
  date: string | null;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  teacherId?: string | null;
  groupId?: string | null;
  location?: string | null;
}

interface ConflictHit { id: string; title: string; kind: 'teacher' | 'room' | 'group'; startTime: string; endTime: string; }

/**
 * Find scheduling conflicts: an existing event sharing the same teacher, group or
 * room and overlapping in time on the same calendar slot. Handles recurring↔recurring
 * (same weekday), dated↔dated (same date) and a dated event landing on a recurring weekday.
 */
async function detectScheduleConflicts(orgId: string, cand: ConflictCandidate, excludeId?: string): Promise<ConflictHit[]> {
  const candStart = timeToMinutes(cand.startTime);
  if (candStart === null) return [];
  const candEnd = timeToMinutes(cand.endTime) ?? candStart + (Number(cand.duration) || 45);

  const room = (cand.location || '').trim().toLowerCase();
  const teacherId = cand.teacherId || null;
  const groupId = cand.groupId || null;
  if (!teacherId && !groupId && !room) return []; // nothing that can clash

  const snap = await adminDb.collection('scheduleEvents').where('organizationId', '==', orgId).get();
  const hits: ConflictHit[] = [];

  for (const doc of snap.docs) {
    if (doc.id === excludeId) continue;
    const e = doc.data() as any;

    // Same calendar slot?
    let sameSlot = false;
    if (cand.recurring && e.recurring) {
      sameSlot = e.dayOfWeek === cand.dayOfWeek;
    } else if (!cand.recurring && !e.recurring) {
      sameSlot = !!cand.date && e.date === cand.date;
    } else if (cand.recurring && !e.recurring) {
      sameSlot = !!e.date && cand.dayOfWeek === appDayOfWeek(e.date);
    } else { // cand dated, e recurring
      sameSlot = !!cand.date && e.dayOfWeek === appDayOfWeek(cand.date);
    }
    if (!sameSlot) continue;

    // Time overlap?
    const eStart = timeToMinutes(e.startTime);
    if (eStart === null) continue;
    const eEnd = timeToMinutes(e.endTime) ?? eStart + (Number(e.duration) || 45);
    if (Math.max(candStart, eStart) >= Math.min(candEnd, eEnd)) continue;

    // What resource clashes? Teacher/group are physically impossible; room is a resource clash.
    let kind: ConflictHit['kind'] | null = null;
    if (teacherId && e.teacherId && e.teacherId === teacherId) kind = 'teacher';
    else if (groupId && e.groupId && e.groupId === groupId) kind = 'group';
    else if (room && e.location && String(e.location).trim().toLowerCase() === room) kind = 'room';
    if (!kind) continue;

    hits.push({ id: doc.id, title: e.title || 'Занятие', kind, startTime: e.startTime || '', endTime: e.endTime || '' });
  }
  return hits;
}

function conflictMessage(hits: ConflictHit[]): string {
  const h = hits[0];
  const who = h.kind === 'teacher' ? 'преподаватель уже занят'
    : h.kind === 'group' ? 'у группы уже есть занятие'
    : 'кабинет уже занят';
  const span = h.startTime ? ` ${h.startTime}${h.endTime ? '–' + h.endTime : ''}` : '';
  const more = hits.length > 1 ? ` (и ещё ${hits.length - 1})` : '';
  return `Конфликт: ${who} — «${h.title}»${span}${more}.`;
}

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
  const isMonthly = courseData.paymentFormat === 'monthly';
  const enrollDate = new Date();
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
        nextDueDate: isMonthly ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        // Tag monthly plans with a billing period + deadline so the monthly-billing
        // cron can dedupe and debt-reminders can chase them.
        ...(isMonthly ? { billingType: 'monthly', period: billingPeriodKey(enrollDate), deadline: billingDeadlineISO(enrollDate) } : {}),
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

/**
 * Org-level teacher policy toggles (admin-controlled), both off by default:
 *   • manage — teachers may create/edit/delete groups they own (createdBy === uid);
 *   • status — teachers may archive / change the status of a group they teach.
 * Stored on the orgSettings doc; read lazily so admin/manager paths pay nothing.
 */
async function getTeacherGroupPolicy(orgId: string): Promise<{ manage: boolean; status: boolean }> {
  try {
    const doc = await adminDb.collection('orgSettings').doc(orgId).get();
    const d = doc.exists ? doc.data() : null;
    return { manage: d?.teacherGroupManagement === true, status: d?.teacherGroupStatus === true };
  } catch {
    return { manage: false, status: false };
  }
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
      if (!can(user, 'courses', 'write')) return forbidden('Недостаточно прав для этого действия');
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
      // Course edits are an admin/manager action. Teachers hold courses:write for
      // lesson/material authoring, but must NOT be able to PATCH arbitrary course
      // records (price, branch, status, teacher roster…). No teacher UI calls
      // updateCourse — the create/edit affordances are all admin-gated.
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Недостаточно прав для этого действия');
      if (!can(user, 'courses', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('courses').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      // Whitelist mutable fields so a blind body spread can't overwrite
      // organizationId / createdBy / createdAt (mirrors updateStudent).
      const ALLOWED_FIELDS = ['title', 'description', 'subject', 'teacherIds', 'lessonIds', 'status', 'coverImageUrl', 'price', 'paymentFormat', 'durationMonths', 'branchId'];
      const fields: Record<string, any> = { updatedAt: now() };
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) fields[key] = body[key];
      }
      await adminDb.collection('courses').doc(body.id).update(fields);
      const updated = await adminDb.collection('courses').doc(body.id).get();
      return ok({ id: body.id, ...updated.data() });
    }

    if (action === 'deleteCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'courses', 'delete')) return forbidden('Недостаточно прав для этого действия');
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
      if (!can(user, 'groups', 'write')) return forbidden('Недостаточно прав для этого действия');
      // Teachers can create groups only when the org enabled the "manage own groups"
      // policy. Admins/managers always may (their groups:write is unconditional).
      const isPrivileged = hasRole(user, 'admin', 'manager') || isSuperAdmin(user);
      if (!isPrivileged && !(await getTeacherGroupPolicy(orgId)).manage) {
        return forbidden('Создание групп недоступно для преподавателей');
      }
      const body = JSON.parse(event.body || '{}');
      if (!body.name || !body.courseId) return badRequest('name and courseId required');
      // A teacher who creates a group is teaching it — record ownership and make sure
      // they're on the teacher list so it lands in their "Мои" view and own-groups scope.
      const teacherIds: string[] = Array.isArray(body.teacherIds) ? [...body.teacherIds] : [];
      if (!isPrivileged && !teacherIds.includes(user.uid)) teacherIds.push(user.uid);
      const data = {
        organizationId: orgId,
        branchId: body.branchId || null,
        courseId: body.courseId,
        courseName: body.courseName || '',
        name: body.name,
        studentIds: body.studentIds || [],
        teacherIds,
        createdBy: user.uid,
        chatLinkTitle: body.chatLinkTitle || '',
        chatLinkUrl: body.chatLinkUrl || '',
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('groups').add(data);
      
      // Auto-generate payment plans
      await syncPaymentPlans(orgId, data.branchId, data.courseId, data.studentIds).catch(console.error);
      
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'groups', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('groups').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const oldData = doc.data()!;

      // Field-level authorization. Admins/managers manage the whole group record.
      // Teachers also hold groups:write, but their scope depends on ownership:
      //   • a teacher who OWNS the group (createdBy) AND whose org enabled the
      //     "manage own groups" policy gets the full editor, like a manager;
      //   • otherwise a teacher who merely TEACHES the group may only advance
      //     syllabus progress / lifecycle status — never reassign people or move
      //     the group. Anything outside their scope is dropped (whitelist), and a
      //     teacher with no relationship to the group is refused outright.
      const isPrivileged = hasRole(user, 'admin', 'manager') || isSuperAdmin(user);
      let fullEditor = isPrivileged;
      // Whether a teacher who merely teaches the group may change its lifecycle
      // status (active/completed/archived) — an admin-controlled org policy.
      let teacherStatusAllowed = false;
      if (!isPrivileged) {
        const teacherIds: string[] = oldData.teacherIds || [];
        const teachesGroup = teacherIds.includes(user.uid);
        const policy = await getTeacherGroupPolicy(orgId);
        const ownsGroup = oldData.createdBy === user.uid && policy.manage;
        if (!teachesGroup && !ownsGroup) {
          return forbidden('Можно изменять только свои группы');
        }
        fullEditor = ownsGroup;
        teacherStatusAllowed = policy.status;
      }
      // Owners/admins/managers manage the whole record. A teacher who only teaches
      // the group may always advance syllabus progress, and may change the group
      // status only when the org enabled that policy.
      const ALLOWED_FIELDS = fullEditor
        ? ['name', 'courseId', 'courseName', 'branchId', 'studentIds', 'teacherIds', 'chatLinkTitle', 'chatLinkUrl', 'currentSyllabusItemId', 'status']
        : (teacherStatusAllowed ? ['currentSyllabusItemId', 'status'] : ['currentSyllabusItemId']);
      const id = body.id;
      if (body.status !== undefined && !['active', 'completed', 'archived'].includes(body.status)) {
        return badRequest('invalid status');
      }
      const fields: Record<string, any> = { updatedAt: now() };
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) fields[key] = body[key];
      }
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
      // Admins/managers delete any group (needs groups:delete). Teachers may delete
      // only groups they own, and only when the org enabled the policy.
      const isPrivileged = hasRole(user, 'admin', 'manager') || isSuperAdmin(user);
      if (isPrivileged) {
        if (!can(user, 'groups', 'delete')) return forbidden('Недостаточно прав для этого действия');
      } else {
        const ownsGroup = doc.data()?.createdBy === user.uid && (await getTeacherGroupPolicy(orgId)).manage;
        if (!ownsGroup) return forbidden('Можно удалять только свои группы');
      }
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

    // ═══ TEACHER SELF-SERVICE: join / leave a course or group ═══
    // A staff member (teacher/admin/manager) adds or removes ONLY THEMSELVES to/from
    // teacherIds. Atomic arrayUnion/arrayRemove — unlike updateGroup/updateCourse this
    // can never touch another user or any other field. No approval needed.
    if (action === 'teacherJoinCourse' || action === 'teacherLeaveCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.courseId) return badRequest('courseId required');
      const ref = adminDb.collection('courses').doc(body.courseId);
      const doc = await ref.get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const joining = action === 'teacherJoinCourse';
      await ref.update({
        teacherIds: joining ? FieldValue.arrayUnion(user.uid) : FieldValue.arrayRemove(user.uid),
        updatedAt: now(),
      });
      return ok({ courseId: body.courseId, joined: joining });
    }

    if (action === 'teacherJoinGroup' || action === 'teacherLeaveGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      if (!body.groupId) return badRequest('groupId required');
      const ref = adminDb.collection('groups').doc(body.groupId);
      const doc = await ref.get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const joining = action === 'teacherJoinGroup';
      await ref.update({
        teacherIds: joining ? FieldValue.arrayUnion(user.uid) : FieldValue.arrayRemove(user.uid),
        updatedAt: now(),
      });
      return ok({ groupId: body.groupId, joined: joining });
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
        const profileMap = await getDocsByIds('users', uids, ['avatarUrl', 'photoURL']);
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

    // ═══ STUDENTS (everyone who holds the student role in this org, incl. multi-role) ═══
    if (action === 'students') {
      // Fetch by status only, then keep anyone whose primary OR secondary role is
      // student. This lets a multi-role member (e.g. teacher + student) appear here too.
      const snap = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', 'in', ['active', 'expelled'])
        .get();
      let filtered = snap.docs
        .map((d: any) => {
          const data = d.data();
          return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, roles: data.roles || [], branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null, status: data.status || 'active' };
        })
        .filter((m: any) => memberHoldsRole(m, ['student']));

      // Branch scoping in memory (the query above is unscoped by branch).
      if (params.branchId) {
        filtered = filtered.filter((s: any) => s.branchIds.includes(params.branchId));
      } else if (hasRole(user, 'manager') && user.branchIds.length > 0) {
        filtered = filtered.filter((s: any) =>
          s.branchIds.length === 0 || s.branchIds.some((id: string) => user.branchIds.includes(id))
        );
      }

      // Enrich with user profile data (avatarUrl, phone, city, createdAt).
      // Uses a single batched getAll() instead of sequential `in` queries so this
      // stays ~1 round-trip regardless of roster size. The old code fired one
      // Firestore query per 10 students *sequentially* (e.g. 20 serial round-trips
      // for 200 students, ~2s), which is what made this page slow as orgs grew.
      if (filtered.length > 0) {
        const profileMap = await getDocsByIds('users', filtered.map((s: any) => s.uid));
        filtered = filtered.map((s: any) => {
          const p = profileMap[s.uid] || {};
          return { ...s, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', skills: p.skills || [], username: p.username || '', pinnedBadges: p.pinnedBadges || [], parentPortalKey: p.parentPortalKey || '', createdAt: p.createdAt || '' };
        });
      }
        
      return ok(filtered);
    }

    if (action === 'createStudent') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      if (!can(user, 'students', 'write')) return forbidden('Недостаточно прав для этого действия');
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

      // When a password is supplied we create a real Firebase Auth account so the
      // student can actually sign in (with a username, or an email). Without it we
      // create a "record-only" offline student (for journal / finances) that cannot log in.
      const wantsLogin = !!(body.password && (body.username || body.email));

      try {
        const profile: Record<string, any> = {
          displayName: body.displayName,
          role: 'student',
          organizationId: orgId,
          activeOrgId: orgId,
          phone: body.phone || '',
          createdByOrg: true,
          createdAt: now(),
          updatedAt: now(),
        };
        // Optional enrollment date (дата поступления) — YYYY-MM-DD, manager-set.
        const enrollmentDate = String(body.enrollmentDate || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(enrollmentDate)) profile.enrollmentDate = enrollmentDate;

        let studentUid: string;
        let loginInfo: { username?: string; email?: string } | null = null;

        if (wantsLogin) {
          const username = String(body.username || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
          if (body.username && username.length < 3) return badRequest('Username must be at least 3 characters');
          if (typeof body.password !== 'string' || body.password.length < 6) {
            return badRequest('Password must be at least 6 characters');
          }
          if (username) {
            const taken = await adminDb.collection('users').where('username', '==', username).limit(1).get();
            if (!taken.empty) return badRequest('Этот логин уже занят');
          }
          // Synthesize a login email from the username when no real email is provided —
          // login resolves username → email before Firebase sign-in, so this is enough.
          const loginEmail = (body.email && String(body.email).trim())
            ? String(body.email).trim().toLowerCase()
            : `${username}@student.sabakhub.app`;
          const dupEmail = await adminDb.collection('users').where('email', '==', loginEmail).limit(1).get();
          if (!dupEmail.empty) return badRequest('Пользователь с таким email уже существует');

          const authUser = await adminAuth.createUser({
            email: loginEmail,
            password: body.password,
            displayName: body.displayName,
          });
          studentUid = authUser.uid;
          profile.email = loginEmail;
          if (username) profile.username = username;
          profile.offlineStudent = false;
          profile.hasLogin = true;
          loginInfo = { username: username || undefined, email: loginEmail };
        } else {
          // Generate a unique ID for the offline student (no Firebase Auth account)
          studentUid = adminDb.collection('users').doc().id;
          profile.offlineStudent = true;   // Flag: not a real Firebase Auth user
        }

        await adminDb.collection('users').doc(studentUid).set(profile);

        // Denormalized org name so the org switcher / member lists show a real
        // name instead of the raw org id.
        const organizationName = (await adminDb.collection('organizations').doc(orgId).get()).data()?.name || '';

        // Create orgMembers entry so student appears in all lists
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(studentUid).set({
          userId: studentUid,
          userName: body.displayName,
          ...(profile.email ? { userEmail: profile.email } : {}),
          role: 'student',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          createdByOrg: true,
          offlineStudent: !wantsLogin,
          joinedAt: now()
        });

        // Create membership sub-doc on user for role resolution
        await adminDb.collection('users').doc(studentUid).collection('memberships').doc(orgId).set({
          role: 'student',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          organizationId: orgId,
          organizationName,
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

        return ok({ uid: studentUid, ...profile, login: loginInfo });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email уже зарегистрирован в системе');
        if (e.code === 'auth/invalid-password') return badRequest('Пароль слишком слабый (минимум 6 символов)');
        throw e;
      }
    }

    if (action === 'bulkCreateStudents') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      if (!can(user, 'students', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      const rows: any[] = Array.isArray(body.students) ? body.students : [];
      if (rows.length === 0) return badRequest('students array required');
      if (rows.length > 1000) return badRequest('Maximum 1000 students per import');

      // Normalize + drop rows without a name
      const clean = rows
        .map((r: any) => ({
          displayName: String(r.displayName || r.name || '').trim(),
          phone: String(r.phone || '').trim(),
        }))
        .filter((r: { displayName: string }) => r.displayName.length > 0);
      if (clean.length === 0) return badRequest('Нет валидных строк — в каждой нужно имя');

      // Enforce student limit against the real active-student count
      const limits = await getOrgLimits(orgId);
      let allowed = clean;
      let skipped = 0;
      if (limits.maxStudents !== -1) {
        const currentSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
          .where('role', '==', 'student').where('status', '==', 'active').get();
        const remaining = Math.max(0, limits.maxStudents - currentSnap.size);
        if (clean.length > remaining) {
          allowed = clean.slice(0, remaining);
          skipped = clean.length - remaining;
        }
      }
      if (allowed.length === 0) {
        return ok({ created: 0, skipped, limit: limits.maxStudents, reason: 'limit' });
      }

      const branchIds = body.branchIds || [];
      const primaryBranchId = body.primaryBranchId || null;
      // Optional enrollment date (дата поступления) applied to the whole batch — YYYY-MM-DD.
      const enrollmentDateRaw = String(body.enrollmentDate || '').trim();
      const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(enrollmentDateRaw) ? enrollmentDateRaw : null;
      const ts = now();
      const createdUids: string[] = [];

      // Write in chunked batches (<=150 students × 3 writes = <=450 ops, under the 500 limit)
      const CHUNK = 150;
      for (let i = 0; i < allowed.length; i += CHUNK) {
        const slice = allowed.slice(i, i + CHUNK);
        const batch = adminDb.batch();
        for (const r of slice) {
          const ref = adminDb.collection('users').doc();
          const uid = ref.id;
          createdUids.push(uid);
          batch.set(ref, {
            displayName: r.displayName,
            role: 'student',
            organizationId: orgId,
            activeOrgId: orgId,
            phone: r.phone,
            createdByOrg: true,
            offlineStudent: true,
            ...(enrollmentDate ? { enrollmentDate } : {}),
            importedAt: ts,
            createdAt: ts,
            updatedAt: ts,
          });
          batch.set(adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid), {
            userId: uid,
            userName: r.displayName,
            role: 'student',
            status: 'active',
            branchIds,
            primaryBranchId,
            createdByOrg: true,
            offlineStudent: true,
            joinedAt: ts,
          });
          batch.set(adminDb.collection('users').doc(uid).collection('memberships').doc(orgId), {
            role: 'student',
            status: 'active',
            branchIds,
            primaryBranchId,
            joinedAt: ts,
          });
        }
        await batch.commit();
      }

      // Enroll the whole batch into a group + auto-generate payment plans
      if (body.groupId && createdUids.length > 0) {
        const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
        if (groupDoc.exists && groupDoc.data()?.organizationId === orgId) {
          await adminDb.collection('groups').doc(body.groupId).update({
            studentIds: FieldValue.arrayUnion(...createdUids),
            updatedAt: ts,
          });
          const courseId = body.courseId || groupDoc.data()?.courseId;
          if (courseId) {
            await syncPaymentPlans(orgId, primaryBranchId, courseId, createdUids).catch(console.error);
          }
        }
      }

      return ok({ created: createdUids.length, skipped, limit: limits.maxStudents });
    }

    if (action === 'updateStudent') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'students', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');
      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      if (!userDoc.exists) return notFound();
      // Verify student belongs to this org via membership (not flat field)
      const studentMemberDoc = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members').doc(body.uid).get();
      if (!studentMemberDoc.exists) return notFound();

      // Whitelist: only allow safe profile fields — prevent privilege escalation
      const ALLOWED_FIELDS = ['displayName', 'phone', 'city', 'bio', 'avatarUrl', 'skills', 'country', 'username', 'enrollmentDate'];
      const updateData: Record<string, any> = { updatedAt: now() };
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }
      // enrollmentDate must be a valid YYYY-MM-DD, or empty string to clear it.
      if (updateData.enrollmentDate !== undefined) {
        const d = String(updateData.enrollmentDate).trim();
        if (d === '') updateData.enrollmentDate = FieldValue.delete();
        else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) updateData.enrollmentDate = d;
        else return badRequest('Некорректная дата поступления');
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

    if (action === 'resetStudentPassword') {
      const body = JSON.parse(event.body || '{}');
      if (!body.uid || !body.password) return badRequest('uid and password required');
      if (String(body.password).length < 6) return badRequest('Пароль — минимум 6 символов');

      // Who may reset a student's password:
      //  • admin/manager with students:write → any student in the org
      //  • teacher → only students enrolled in a group they teach (own-groups scope)
      const canManageAllStudents = hasRole(user, 'admin', 'manager') && can(user, 'students', 'write');
      const isTeacher = hasRole(user, 'teacher');
      if (!canManageAllStudents && !isTeacher) return forbidden('Недостаточно прав для этого действия');

      // Student must belong to this org.
      const member = await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(body.uid).get();
      if (!member.exists) return notFound();

      // Teachers are scoped to their own groups: allow the reset only when the teacher
      // shares a group with this student (assigned as teacher + student is enrolled).
      if (!canManageAllStudents) {
        const groupsSnap = await adminDb.collection('groups').where('organizationId', '==', orgId).get();
        const sharesGroup = groupsSnap.docs.some((g: any) => {
          const gd = g.data();
          return (gd.teacherIds || []).includes(user.uid) && (gd.studentIds || []).includes(body.uid);
        });
        if (!sharesGroup) return forbidden('Можно менять пароль только студентам из своих групп');
      }

      // Only login-enabled students have an auth account to update.
      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      const data = userDoc.data() || {};
      if (data.offlineStudent === true || !data.email) {
        return badRequest('У этого ученика нет входа в систему. Создайте логин при добавлении или отправьте ссылку-приглашение.');
      }
      try {
        await adminAuth.updateUser(body.uid, { password: body.password });
        return ok({ uid: body.uid, updated: true });
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') return badRequest('Аккаунт не найден в системе аутентификации');
        throw e;
      }
    }

    // ═══ TEACHERS (everyone who holds a teaching role in this org, incl. multi-role) ═══
    if (action === 'teachers') {
      const snap = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members')
        .where('status', '==', 'active')
        .get();
      let members = snap.docs
        .map((d: any) => {
          const data = d.data();
          return { uid: data.userId, displayName: data.userName, email: data.userEmail, role: data.role, roles: data.roles || [], branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null };
        })
        .filter((m: any) => memberHoldsRole(m, ['teacher', 'admin', 'owner', 'mentor']));

      if (params.branchId) {
        members = members.filter((m: any) => m.branchIds.includes(params.branchId));
      }

      // Enrich with user profile data (avatarUrl, phone, city, createdAt)
      let enriched = members;
      if (members.length > 0) {
        const uids = members.map((t: any) => t.uid);
        const profileMap = await getDocsByIds('users', uids);
        enriched = members.map((t: any) => {
          const p = profileMap[t.uid] || {};
          return { ...t, avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', createdAt: p.createdAt || '' };
        });
      }

      return ok(enriched);
    }

    if (action === 'createTeacher') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden();
      if (!can(user, 'teachers', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.displayName) return badRequest('displayName required');

      // Check teacher limit
      const limits = await getOrgLimits(orgId);
      if (limits.maxTeachers !== -1) {
        const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
        if ((orgData?.teachersCount || 0) >= limits.maxTeachers) {
          return badRequest('Organization has reached the teacher limit for its plan.');
        }
      }

      // Mirrors createStudent: a password + (username or email) creates a real
      // Firebase Auth account the teacher can sign in with. Without it we create a
      // "record-only" teacher (for schedule / group assignment) that cannot log in yet.
      const wantsLogin = !!(body.password && (body.username || body.email));

      try {
        const profile: Record<string, any> = {
          displayName: body.displayName,
          role: 'teacher',
          organizationId: orgId,
          activeOrgId: orgId,
          phone: body.phone || '',
          createdByOrg: true,
          createdAt: now(),
          updatedAt: now(),
        };

        let teacherUid: string;
        let loginInfo: { username?: string; email?: string } | null = null;

        if (wantsLogin) {
          const username = String(body.username || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
          if (body.username && username.length < 3) return badRequest('Username must be at least 3 characters');
          if (typeof body.password !== 'string' || body.password.length < 6) {
            return badRequest('Password must be at least 6 characters');
          }
          if (username) {
            const taken = await adminDb.collection('users').where('username', '==', username).limit(1).get();
            if (!taken.empty) return badRequest('Этот логин уже занят');
          }
          // Synthesize a login email from the username when no real email is provided —
          // login resolves username → email before Firebase sign-in, so this is enough.
          const loginEmail = (body.email && String(body.email).trim())
            ? String(body.email).trim().toLowerCase()
            : `${username}@teacher.sabakhub.app`;
          const dupEmail = await adminDb.collection('users').where('email', '==', loginEmail).limit(1).get();
          if (!dupEmail.empty) return badRequest('Пользователь с таким email уже существует');

          const authUser = await adminAuth.createUser({
            email: loginEmail,
            password: body.password,
            displayName: body.displayName,
          });
          teacherUid = authUser.uid;
          profile.email = loginEmail;
          if (username) profile.username = username;
          profile.offlineTeacher = false;
          profile.hasLogin = true;
          loginInfo = { username: username || undefined, email: loginEmail };
        } else {
          // Generate a unique ID for the record-only teacher (no Firebase Auth account)
          teacherUid = adminDb.collection('users').doc().id;
          profile.offlineTeacher = true;   // Flag: not a real Firebase Auth user
        }

        await adminDb.collection('users').doc(teacherUid).set(profile);

        // Denormalized org name so the org switcher / member lists show a real
        // name instead of the raw org id.
        const organizationName = (await adminDb.collection('organizations').doc(orgId).get()).data()?.name || '';

        // Create orgMembers entry so teacher appears in all lists
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(teacherUid).set({
          userId: teacherUid,
          userName: body.displayName,
          ...(profile.email ? { userEmail: profile.email } : {}),
          role: 'teacher',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          createdByOrg: true,
          offlineTeacher: !wantsLogin,
          joinedAt: now(),
        });

        // Create membership sub-doc on user for role resolution
        await adminDb.collection('users').doc(teacherUid).collection('memberships').doc(orgId).set({
          role: 'teacher',
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          organizationId: orgId,
          organizationName,
          joinedAt: now(),
        });

        return ok({ uid: teacherUid, ...profile, login: loginInfo });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email уже зарегистрирован в системе');
        if (e.code === 'auth/invalid-password') return badRequest('Пароль слишком слабый (минимум 6 символов)');
        throw e;
      }
    }

    // ═══ CREATE USER (real account with an arbitrary combination of app roles) ═══
    if (action === 'createUser') {
      // Admin-only: this can grant admin/manager, so managers may not use it (anti-escalation).
      if (!hasRole(user, 'admin')) return forbidden('Только директор может создавать пользователей');
      const body = JSON.parse(event.body || '{}');
      if (!body.displayName) return badRequest('displayName required');

      const VALID = ['admin', 'manager', 'teacher', 'student'];
      const roles: string[] = [...new Set(Array.isArray(body.roles) ? body.roles : [])].filter((r: any) => VALID.includes(r)) as string[];
      if (roles.length === 0) return badRequest('Выберите хотя бы одну роль');
      // Deterministic primary: strongest role wins (admin > manager > teacher > student).
      const PRIORITY = ['admin', 'manager', 'teacher', 'student'];
      const primary = PRIORITY.find((r) => roles.includes(r))!;

      if (typeof body.password !== 'string' || body.password.length < 6) {
        return badRequest('Пароль минимум 6 символов');
      }
      if (!body.username && !body.email) return badRequest('Укажите логин или email');

      // Plan seat limits: student seat if student; teacher/staff seat for admin/manager/teacher.
      const limits = await getOrgLimits(orgId);
      const orgData = (await adminDb.collection('organizations').doc(orgId).get()).data();
      if (roles.includes('student') && limits.maxStudents !== -1 && (orgData?.studentsCount || 0) >= limits.maxStudents) {
        return badRequest('Достигнут лимит студентов по тарифу.');
      }
      if (roles.some((r) => ['admin', 'manager', 'teacher'].includes(r)) && limits.maxTeachers !== -1 && (orgData?.teachersCount || 0) >= limits.maxTeachers) {
        return badRequest('Достигнут лимит сотрудников по тарифу.');
      }

      try {
        const username = String(body.username || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
        if (body.username && username.length < 3) return badRequest('Логин минимум 3 символа');
        if (username) {
          const taken = await adminDb.collection('users').where('username', '==', username).limit(1).get();
          if (!taken.empty) return badRequest('Этот логин уже занят');
        }
        // Synthesize a login email from the username when no real email is given —
        // login resolves username → email before Firebase sign-in, so this is enough.
        const loginEmail = (body.email && String(body.email).trim())
          ? String(body.email).trim().toLowerCase()
          : `${username}@user.sabakhub.app`;
        const dupEmail = await adminDb.collection('users').where('email', '==', loginEmail).limit(1).get();
        if (!dupEmail.empty) return badRequest('Пользователь с таким email уже существует');

        const authUser = await adminAuth.createUser({
          email: loginEmail,
          password: body.password,
          displayName: body.displayName,
        });
        const uid = authUser.uid;
        const organizationName = orgData?.name || '';

        const profile: Record<string, any> = {
          displayName: body.displayName,
          role: primary,
          organizationId: orgId,
          activeOrgId: orgId,
          activeRole: primary,
          email: loginEmail,
          phone: body.phone || '',
          createdByOrg: true,
          hasLogin: true,
          createdAt: now(),
          updatedAt: now(),
        };
        if (username) profile.username = username;
        await adminDb.collection('users').doc(uid).set(profile);

        // `role` is the primary (for legacy reads); `roles` is the full multi-role set.
        const memberBase = {
          userId: uid,
          userName: body.displayName,
          userEmail: loginEmail,
          role: primary,
          roles,
          status: 'active',
          branchIds: body.branchIds || [],
          primaryBranchId: body.primaryBranchId || null,
          organizationId: orgId,
          organizationName,
          createdByOrg: true,
          joinedAt: now(),
        };
        await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid).set(memberBase);
        await adminDb.collection('users').doc(uid).collection('memberships').doc(orgId).set(memberBase);

        return ok({ uid, ...profile, roles, login: { username: username || undefined, email: loginEmail } });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return badRequest('Email уже зарегистрирован в системе');
        if (e.code === 'auth/invalid-password') return badRequest('Пароль слишком слабый (минимум 6 символов)');
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
      if (!can(user, 'materials', 'write')) return forbidden('Недостаточно прав для этого действия');
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
      if (!can(user, 'materials', 'write')) return forbidden('Недостаточно прав для этого действия');
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
      if (!can(user, 'materials', 'delete')) return forbidden('Недостаточно прав для этого действия');
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
      if (!can(user, 'schedule', 'write')) return forbidden('Недостаточно прав для этого действия');
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
      // Block double-booking (teacher / group / room) unless explicitly forced.
      if (body.force !== true) {
        const conflicts = await detectScheduleConflicts(orgId, {
          recurring: isRecurring,
          dayOfWeek: isRecurring ? Number(body.dayOfWeek) : null,
          date: isRecurring ? null : body.date,
          startTime: body.startTime, endTime: body.endTime, duration: body.duration,
          teacherId: body.teacherId, groupId: body.groupId, location: body.location,
        });
        if (conflicts.length) return jsonResponse(409, { error: conflictMessage(conflicts), conflicts });
      }
      const ref = await adminDb.collection('scheduleEvents').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateEvent') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Only admins and managers can modify the schedule');
      if (!can(user, 'schedule', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('scheduleEvents').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const before = doc.data()!;
      const { id, force, ...fields } = body;
      // Re-check conflicts against the event's resulting state (covers drag&drop moves).
      if (force !== true) {
        const m = { ...before, ...fields };
        const conflicts = await detectScheduleConflicts(orgId, {
          recurring: !!m.recurring,
          dayOfWeek: m.recurring ? Number(m.dayOfWeek) : null,
          date: m.recurring ? null : m.date,
          startTime: m.startTime, endTime: m.endTime, duration: m.duration,
          teacherId: m.teacherId, groupId: m.groupId, location: m.location,
        }, id);
        if (conflicts.length) return jsonResponse(409, { error: conflictMessage(conflicts), conflicts });
      }
      fields.updatedAt = now();
      await adminDb.collection('scheduleEvents').doc(id).update(fields);

      // Notify the group when the time / date / location actually changes.
      const changed = ['startTime', 'endTime', 'date', 'dayOfWeek', 'location'].some(
        k => fields[k] !== undefined && fields[k] !== before[k]
      );
      if (changed && before.groupId) {
        const title = fields.title ?? before.title;
        const newStart = fields.startTime ?? before.startTime;
        const newDate = fields.date ?? before.date;
        const when = newDate ? `${newDate} ${newStart}` : newStart;
        notifyGroupMembers(
          orgId, before.groupId, 'schedule_changed',
          'Изменение в расписании',
          `Занятие «${title}» изменено. Новое время: ${when}.`,
          '/schedule',
          before.teacherId ? [before.teacherId] : [],
        ).catch(() => {});
      }
      return ok({ id, updated: true });
    }

    if (action === 'deleteEvent') {
      if (!hasRole(user, 'admin', 'manager')) return forbidden('Only admins and managers can modify the schedule');
      if (!can(user, 'schedule', 'delete')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('scheduleEvents').doc(body.id).get();
      const ev = doc.exists ? doc.data()! : null;
      // Only touch events that belong to this org.
      if (ev && ev.organizationId !== orgId) return forbidden();
      await adminDb.collection('scheduleEvents').doc(body.id).delete();

      // Notify the group that the lesson was cancelled.
      if (ev && ev.groupId) {
        const when = ev.date ? `${ev.date} ${ev.startTime || ''}`.trim() : (ev.startTime || '');
        notifyGroupMembers(
          orgId, ev.groupId, 'schedule_changed',
          'Занятие отменено',
          `Занятие «${ev.title}»${when ? ` (${when})` : ''} отменено.`,
          '/schedule',
          ev.teacherId ? [ev.teacherId] : [],
        ).catch(() => {});
      }
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
        institutionType: orgData?.institutionType || 'center',
        timezone: sData.timezone || 'Asia/Bishkek',
        locale: sData.locale || 'ru',
        academicYearStart: sData.academicYearStart || '',
        academicYearEnd: sData.academicYearEnd || '',
        gradingScale: sData.gradingScale || 'percentage',
        passingScore: sData.passingScore || 60,
        primaryColor: sData.primaryColor || '#6366f1',
        teacherGroupManagement: sData.teacherGroupManagement === true,
        teacherGroupStatus: sData.teacherGroupStatus === true,
        updatedAt: sData.updatedAt || '',
        studentsCount: studentsSnap.data().count,
        teachersCount: teachersSnap.data().count,
        storageUsedMb: orgData?.storageUsedMb || 0,
      });
    }

    if (action === 'updateOrgSettings') {
      if (!hasPermission(user, 'settings')) return forbidden('No access to settings module');
      if (!can(user, 'settings', 'write')) return forbidden('Недостаточно прав для этого действия');
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
      if (body.institutionType !== undefined) orgUpdate.institutionType = body.institutionType;
      await adminDb.collection('organizations').doc(orgId).update(orgUpdate);

      // Settings doc (academic config)
      const settingsData: Record<string, any> = {
        timezone: body.timezone, locale: body.locale,
        academicYearStart: body.academicYearStart,
        academicYearEnd: body.academicYearEnd,
        gradingScale: body.gradingScale,
        passingScore: body.passingScore,
        updatedAt: now(),
      };
      // Teacher self-service group management (admin-controlled policy toggles).
      if (body.teacherGroupManagement !== undefined) {
        settingsData.teacherGroupManagement = body.teacherGroupManagement === true;
      }
      if (body.teacherGroupStatus !== undefined) {
        settingsData.teacherGroupStatus = body.teacherGroupStatus === true;
      }
      await adminDb.collection('orgSettings').doc(orgId).set(settingsData, { merge: true });
      return ok({ updated: true });
    }

    // ═══ ORG DASHBOARD STATS ═══
    if (action === 'dashboardStats') {
      const [coursesSnap, groupsSnap, studentsSnap, teachersSnap, lessonsSnap, examsSnap, roomsSnap, scheduleSnap] = await Promise.all([
        orgQuery('courses', orgId).get(),
        orgQuery('groups', orgId).get(),
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', '==', 'student').where('status', '==', 'active').get(),
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', 'in', ['teacher', 'mentor']).where('status', '==', 'active').get(),
        orgQuery('lessonPlans', orgId).get(),
        orgQuery('exams', orgId).get(),
        orgQuery('examRooms', orgId).where('status', '==', 'active').get(),
        orgQuery('scheduleEvents', orgId).limit(1).get(),
      ]);
      return ok({
        totalCourses: coursesSnap.size,
        totalGroups: groupsSnap.size,
        totalStudents: studentsSnap.size,
        totalTeachers: teachersSnap.size,
        totalLessons: lessonsSnap.size,
        totalExams: examsSnap.size,
        activeRooms: roomsSnap.size,
        totalScheduleEvents: scheduleSnap.size,
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
