/**
 * API: Lessons — CRUD (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { verifyAuth, isStaff, can, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, isSuperAdmin } from './utils/auth';
import type { AuthUser } from './utils/auth';
import { notifyOrgStudents, createNotification } from './utils/notifications';
import { recordTeacherActivity } from './utils/teacher-activity';
import { LESSONS_COLLECTION } from './utils/lessons';

const COLLECTION = LESSONS_COLLECTION;

/** Блок ДЗ заполнен — тот же критерий, что у бота при выдаче заданий (homework-inbox). */
export function hasHomeworkTask(hw: any): boolean {
  if (typeof hw === 'string') return hw.trim().length > 0;
  return !!hw && typeof hw === 'object' && !!(hw.title || hw.description);
}

/** Студентам групп урока (и их родителям — через createNotification) уходит новое ДЗ. */
async function notifyHomeworkAssigned(orgId: string, groupIds: string[], lessonTitle: string, hw: any): Promise<void> {
  if (!orgId || groupIds.length === 0) return;
  const groups = await getDocsByIds('groups', groupIds);
  const students = new Set<string>();
  for (const g of Object.values(groups)) for (const s of (g as any)?.studentIds || []) students.add(s);
  const title = (typeof hw === 'object' && hw?.title) || lessonTitle;
  const due = typeof hw === 'object' && hw?.dueDate ? ` Срок: до ${String(hw.dueDate).slice(0, 10)}.` : '';
  await Promise.allSettled([...students].map(uid => createNotification({
    recipientId: uid, type: 'homework_assigned', organizationId: orgId, link: '/lessons',
    title: 'Новое домашнее задание',
    message: `«${title}».${due} Сдать можно в Telegram-боте командой /dz.`,
  })));
}

/**
 * Read the group names off the group documents, index for index with `groupIds`.
 *
 * `groupNames` is denormalised so lists don't have to join, and it used to be
 * whatever the client sent. That is how a raw document id ended up in the group
 * filter on the lessons page: the editor built the names from its own group list
 * — scoped to the active branch — and dropped the ones it couldn't resolve, so
 * the array came in shorter than `groupIds`, every later name landed on the wrong
 * group, and the last id had no name to pair with. Names also went stale on
 * rename, and any other write path (AI factory, duplication) set ids with no
 * names at all.
 *
 * Derived here instead: one source of truth, always aligned, always current.
 * Ids that no longer resolve to a group in this org are dropped — a lesson
 * should not stay linked to a group that was deleted.
 */
export async function resolveGroupLinkage(
  rawIds: unknown,
  organizationId: string,
): Promise<{ groupIds: string[]; groupNames: string[] }> {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((g): g is string => typeof g === 'string' && !!g.trim()).map((g) => g.trim()))]
    : [];
  if (ids.length === 0) return { groupIds: [], groupNames: [] };

  const docs = await getDocsByIds('groups', ids);
  const groupIds: string[] = [];
  const groupNames: string[] = [];
  for (const id of ids) {
    const g = docs[id];
    if (!g) continue;
    if (organizationId && g.organizationId && g.organizationId !== organizationId) continue;
    groupIds.push(id);
    groupNames.push(g.name || '');
  }
  return { groupIds, groupNames };
}

/**
 * Whose lessons a caller may read: their own org's (getOrgFilter — a super admin
 * reads across orgs) and, of personal lessons (no org), only the ones they wrote.
 * Applies to every role: a lesson id or a group id proves nothing about the org.
 */
function inReadScope(user: AuthUser, lesson: { organizationId?: string | null; authorId?: string }): boolean {
  if (isSuperAdmin(user)) return true;
  if (!lesson.organizationId) return lesson.authorId === user.uid;
  return lesson.organizationId === getOrgFilter(user);
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized(event);

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Lesson not found');
      const lessonData = doc.data()!;

      // The org check used to run for students only, so staff of any org could
      // read any lesson by id.
      if (!inReadScope(user, lessonData)) return forbidden();
      // Students only see published lessons.
      if (!isStaff(user) && lessonData.status !== 'published') return notFound('Lesson not found');

      return ok({ id: doc.id, ...lessonData });
    }

    // Filter by groupId — returns lessons that include this groupId in their groupIds array
    if (params.groupId) {
      try {
        const snap = await adminDb.collection(COLLECTION)
          .where('groupIds', 'array-contains', params.groupId)
          .limit(200)
          .get();
        // A group id proves nothing about the org — this used to return any org's
        // lessons. Scoped in memory: personal lessons match by author, which can't
        // be OR-ed into an organizationId filter.
        let lessons = snap.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((l) => inReadScope(user, l));
        // Sort by createdAt desc in memory (avoids composite index requirement)
        lessons.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        // For students, only show published lessons
        if (user.role === 'student') {
          return ok(lessons.filter((l: any) => l.status === 'published'));
        }
        return ok(lessons);
      } catch (err: any) {
        console.error('Lesson groupId query failed:', err);
        return jsonResponse(500, { error: `Group filter failed: ${err.message}` });
      }
    }

    try {
      const orgFilter = getOrgFilter(user);
      if (params.orgId === 'none') {
        const snap = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).orderBy('createdAt', 'desc').get();
        const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').orderBy('createdAt', 'desc').get();
        const allDocs = [...snap.docs, ...snap2.docs].reduce((acc, curr) => {
           if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
           return acc;
        }, [] as any[]);
        return ok(allDocs.map((d: any) => ({ id: d.id, ...d.data() })));
      }

      let snap;
      if (isSuperAdmin(user)) {
        snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get();
      } else if (orgFilter) {
        snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').limit(200).get();
      } else {
        // Freelance teacher (no org) — show only their own lessons
        const snap1 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).orderBy('createdAt', 'desc').get();
        const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').orderBy('createdAt', 'desc').get();
        const allDocs = [...snap1.docs, ...snap2.docs].reduce((acc, curr) => {
           if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
           return acc;
        }, [] as any[]);
        return ok(allDocs.map((d: any) => ({ id: d.id, ...d.data() })));
      }
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      console.error('Lesson listing query failed:', err);
      return jsonResponse(500, { error: `Listing failed: ${err.message || 'Unknown error'}. Check Firestore composite indexes for lessonPlans collection.` });
    }
  }

  if (!isStaff(user)) return forbidden();
  // RBAC: writes require lessons:write, deletes require lessons:delete.
  if (!can(user, 'lessons', event.httpMethod === 'DELETE' ? 'delete' : 'write')) return forbidden('Недостаточно прав для этого действия');

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.title) return badRequest('title required');
    const now = new Date().toISOString();
    const linkage = await resolveGroupLinkage(body.groupIds, user.organizationId || '');
    const data = {
      ...body,
      authorId: user.uid,
      authorName: user.displayName,
      organizationId: user.organizationId || '',
      ...linkage,
      status: body.status || 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    // Notify org students about new lesson
    if (user.organizationId && data.status === 'published') {
      notifyOrgStudents(
        user.organizationId, 'new_lesson',
        'Новый урок',
        `Опубликован урок «${body.title}»`,
        '/lessons',
      ).catch(() => {});
    }
    // Задание ДЗ едет полем урока (body.homework), отдельного эндпоинта нет —
    // поэтому «создание ДЗ» фиксируем здесь, когда поле непустое.
    const hasHomework = !!body.homework && (typeof body.homework === 'string'
      ? body.homework.trim().length > 0
      : typeof body.homework === 'object' && Object.keys(body.homework).length > 0);
    if (data.status !== 'draft' && hasHomeworkTask(body.homework)) {
      await notifyHomeworkAssigned(data.organizationId, data.groupIds, body.title, body.homework).catch(() => {});
    }
    await recordTeacherActivity({
      organizationId: user.organizationId, actorId: user.uid, actorName: user.displayName, actorRole: user.role,
      type: 'lesson_created', branchId: user.primaryBranchId, entityId: ref.id, entityLabel: body.title,
      meta: { status: data.status },
    });
    if (hasHomework) {
      await recordTeacherActivity({
        organizationId: user.organizationId, actorId: user.uid, actorName: user.displayName, actorRole: user.role,
        type: 'homework_created', branchId: user.primaryBranchId, entityId: ref.id, entityLabel: body.title,
      });
    }
    return ok({ id: ref.id, ...data });
  }

  // PUT
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');
    const { id, ...updateFields } = body;
    // Same rule as on create: the names come from the group documents, never from
    // the payload. A partial update that mentions neither key leaves the linkage
    // alone; one that carries names without ids has its names dropped rather than
    // trusted — it must not be able to rewrite the roster it isn't addressing.
    if ('groupIds' in updateFields) {
      Object.assign(updateFields, await resolveGroupLinkage(updateFields.groupIds, user.organizationId || ''));
    } else {
      delete updateFields.groupNames;
    }
    updateFields.updatedAt = new Date().toISOString();
    const before = (await adminDb.collection(COLLECTION).doc(id).get()).data() || {};
    await adminDb.collection(COLLECTION).doc(id).update(updateFields);
    const updated = await adminDb.collection(COLLECTION).doc(id).get();
    const after: any = updated.data() || {};
    // Видимым ДЗ становится, когда урок опубликован и блок заполнен; шлём только на этом переходе.
    const visible = (l: any) => l.status !== 'draft' && hasHomeworkTask(l.homework);
    if (visible(after) && !visible(before) && after.organizationId === user.organizationId) {
      await notifyHomeworkAssigned(after.organizationId, after.groupIds || [], after.title || '', after.homework).catch(() => {});
    }
    return ok({ id: updated.id, ...after });
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    if (!params.id) return badRequest('id required');
    const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
    if (!doc.exists) return notFound('Lesson not found');
    // Verify org ownership (skip for super_admin)
    if (user.organizationId && doc.data()?.organizationId !== user.organizationId) return forbidden();
    await adminDb.collection(COLLECTION).doc(params.id).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
