/**
 * API: Organization — unified org-scoped CRUD for courses, groups, materials, schedule, settings.
 * All data strictly scoped by organizationId.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminAuth, adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, isSuperAdmin, hasRole, hasPermission, can, getOrgFilter,
  isRosterManager,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  resolveBranchFilter, userHasBranchAccess, memberInBranchScope, memberHoldsRole,
  type AuthUser,
} from './utils/auth';
import { createNotification, notifyOrgAdmins, notifyGroupMembers } from './utils/notifications';
import { recordTeacherActivity } from './utils/teacher-activity';
import { FieldValue } from 'firebase-admin/firestore';
import { getOrgLimits } from './utils/plan-limits';
import { billingPeriodKey, billingDeadlineISO } from './utils/billing';
import { isUntouchedPlan, orgDayKey, planPeriodKey } from './utils/payment-plans';
import { loadTuitionRates, effectiveChargeAmount } from './utils/tuition';
import { roomKeys, sameRoom } from './utils/classrooms';
/* ═══════════════════════════════════════════════ */
/*  Helpers                                        */
/* ═══════════════════════════════════════════════ */
const now = () => new Date().toISOString();

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
  classroomId?: string | null;
  classroomName?: string | null;
  branchId?: string | null;
}

/**
 * Виртуальные кабинеты («Онлайн», «Zoom») вмещают сколько угодно занятий сразу,
 * поэтому накладок по ним не бывает. Запрос — только равенства, без индекса.
 */
async function virtualClassroomIds(orgId: string): Promise<Set<string>> {
  const snap = await adminDb.collection('classrooms')
    .where('organizationId', '==', orgId)
    .where('isVirtual', '==', true)
    .get();
  return new Set(snap.docs.map((d: any) => d.id));
}

/** YYYY-MM-DD for "today", used to ignore events that are already in the past. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ConflictHit { id: string; title: string; kind: 'teacher' | 'room' | 'group'; startTime: string; endTime: string; }

/**
 * Приводит кабинет из тела запроса к трём полям события.
 *
 * Принимаем и справочный classroomId, и старый свободный текст location — второй
 * путь нужен, пока не все экраны переехали, и для импорта расписания. Подпись
 * всегда дублируется в location, чтобы уже существующие читатели не сломались.
 */
async function resolveClassroom(
  orgId: string,
  body: { classroomId?: string | null; location?: string | null },
): Promise<{ classroomId: string | null; classroomName: string; location: string } | { error: string }> {
  if (body.classroomId) {
    const doc = await adminDb.collection('classrooms').doc(body.classroomId).get();
    if (!doc.exists || doc.data()?.organizationId !== orgId) return { error: 'Кабинет не найден' };
    const name = String(doc.data()?.name || '');
    return { classroomId: doc.id, classroomName: name, location: name };
  }
  const free = String(body.location || '').trim();
  return { classroomId: null, classroomName: '', location: free };
}

/**
 * Find scheduling conflicts: an existing event sharing the same teacher, group or
 * room and overlapping in time on the same calendar slot. Handles recurring↔recurring
 * (same weekday), dated↔dated (same date) and a dated event landing on a recurring weekday.
 */
export async function detectScheduleConflicts(orgId: string, cand: ConflictCandidate, excludeId?: string): Promise<ConflictHit[]> {
  const candStart = timeToMinutes(cand.startTime);
  if (candStart === null) return [];
  const candEnd = timeToMinutes(cand.endTime) ?? candStart + (Number(cand.duration) || 45);

  // Кабинет может быть задан справочником (classroomId) или ещё старым текстом
  // (location) — roomKeys выдаёт оба ключа, поэтому переехавшее и непереехавшее
  // событие всё равно узнают друг друга.
  const candRoomKeys = roomKeys(cand);
  const teacherId = cand.teacherId || null;
  const groupId = cand.groupId || null;
  if (!teacherId && !groupId && !candRoomKeys.length) return []; // nothing that can clash

  const [snap, virtualRooms] = await Promise.all([
    adminDb.collection('scheduleEvents').where('organizationId', '==', orgId).get(),
    candRoomKeys.length ? virtualClassroomIds(orgId) : Promise.resolve(new Set<string>()),
  ]);
  const candRoomIsVirtual = !!cand.classroomId && virtualRooms.has(cand.classroomId);
  const hits: ConflictHit[] = [];
  const today = todayStr();

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
      // A weekly lesson only has to dodge one-off events that are still ahead of us.
      // Without the date floor, a single exam last March would block that weekday forever.
      sameSlot = !!e.date && e.date >= today && cand.dayOfWeek === appDayOfWeek(e.date);
    } else { // cand dated, e recurring
      sameSlot = !!cand.date && e.dayOfWeek === appDayOfWeek(cand.date);
    }
    if (!sameSlot) continue;

    // Time overlap?
    const eStart = timeToMinutes(e.startTime);
    if (eStart === null) continue;
    const eEnd = timeToMinutes(e.endTime) ?? eStart + (Number(e.duration) || 45);
    if (Math.max(candStart, eStart) >= Math.min(candEnd, eEnd)) continue;

    // What resource clashes? Teacher/group are physically impossible anywhere, so they
    // are checked across branches. A room clash is scoped to the branch — «Каб. 301»
    // in two buildings is two different rooms — and virtual rooms never clash at all.
    const sameBranch = (cand.branchId || null) === (e.branchId || null);
    const roomClash = !candRoomIsVirtual
      && sameBranch
      && !(e.classroomId && virtualRooms.has(e.classroomId))
      && sameRoom(cand, e);

    let kind: ConflictHit['kind'] | null = null;
    if (teacherId && e.teacherId && e.teacherId === teacherId) kind = 'teacher';
    else if (groupId && e.groupId && e.groupId === groupId) kind = 'group';
    else if (roomClash) kind = 'room';
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

/** Сколько имён кладём в событие журнала — чтобы импорт на 500 человек не раздул документ. */
const ACTIVITY_PEOPLE_CAP = 25;

type RosterActivityType =
  | 'student_created' | 'student_enrolled' | 'student_removed' | 'group_created' | 'group_deleted';

/**
 * Журнал «кто кого и когда»: действия с контингентом пишутся в teacherActivity
 * там же, где происходят, с актёром из проверенного токена — подделать авторство
 * с клиента нельзя (та же логика, что у оценок и посещаемости).
 *
 * `people` — те, кого действие затронуло: в ленте нужно видеть не только
 * «зачислил 12 человек», но и кого именно, поэтому имена денормализуем прямо в
 * событие (иначе отчисленного студента потом уже не по кому резолвить).
 * Best-effort: recordTeacherActivity глотает свои ошибки и не валит мутацию.
 */
function logRoster(
  user: AuthUser,
  type: RosterActivityType,
  opts: {
    entityId?: string | null;
    entityLabel?: string | null;
    count?: number;
    people?: { id: string; name: string }[];
    meta?: Record<string, unknown>;
  },
) {
  const all = (opts.people || []).filter(p => p.id || p.name);
  return recordTeacherActivity({
    organizationId: user.organizationId,
    actorId: user.uid,
    actorName: user.displayName,
    actorRole: user.role,
    type,
    branchId: user.primaryBranchId,
    entityId: opts.entityId ?? null,
    entityLabel: opts.entityLabel ?? null,
    count: opts.count ?? 1,
    meta: {
      ...(opts.meta || {}),
      ...(all.length ? { people: all.slice(0, ACTIVITY_PEOPLE_CAP), peopleTotal: all.length } : {}),
    },
  });
}

/** Имена участников для журнала: сперва то, что уже под рукой, иначе профиль. */
async function namesForActivity(uids: string[], known: Record<string, any> = {}): Promise<{ id: string; name: string }[]> {
  const need = uids.filter(id => !known[id]);
  let fetched: Record<string, any> = {};
  if (need.length) fetched = await getDocsByIds('users', need.slice(0, ACTIVITY_PEOPLE_CAP)).catch(() => ({}));
  return uids.map(id => {
    const src = known[id] || fetched[id] || {};
    return { id, name: src.userName || src.displayName || '' };
  });
}

/**
 * Helper to auto-generate payment plans for students enrolled in a priced course.
 *
 * Экспортируется ради теста: «уже выставлен счёт?» — это правило про деньги, и
 * проверять его надо напрямую, а не через HTTP-обвязку (ср. parseBulkBody ниже).
 */
export async function syncPaymentPlans(orgId: string, branchId: string | null, courseId: string, studentIds: string[]) {
  if (!studentIds || studentIds.length === 0) return;
  
  const courseDoc = await adminDb.collection('courses').doc(courseId).get();
  if (!courseDoc.exists) return;
  const courseData = courseDoc.data()!;

  // Договорные цены зачисляемых. Сумма к оплате берётся у СТУДЕНТА, и только
  // при её отсутствии — из курса (utils/tuition.ts): цена курса стала прайсом
  // по умолчанию, а не единственной истиной.
  const rates = await loadTuitionRates(orgId, courseId, studentIds);
  const price = Number(courseData.price) || 0;

  // Бесплатный курс — но только если ни у кого нет своей цены. Раньше выход был
  // безусловным, и академия, которая держит суммы у учеников, а карточку курса
  // оставила без цены, не получала при зачислении ни одного счёта.
  if (price <= 0 && rates.size === 0) return;

  // One bulk query instead of N individual queries.
  // Equality-only (organizationId + courseId): составные индексы не задеплоены,
  // поэтому статус отсеиваем в JS, а не ещё одним .where.
  const existingSnap = await adminDb.collection('studentPaymentPlans')
    .where('organizationId', '==', orgId)
    .where('courseId', '==', courseId)
    .get();

  // «Уже выставлен счёт» — это ЖИВОЙ счёт. Списанный (status: 'cancelled') таким
  // не считается: его пишет этот же файл, когда студента убирают из группы с
  // нетронутым планом (см. removedStudents в updateGroup). Раньше статус здесь не
  // проверялся, и получалась тихая потеря выручки: студент ушёл → план списан →
  // студента вернули в группу того же курса → syncPaymentPlans видел списанный
  // план, решал, что счёт уже есть, и не создавал ничего. Студент учится и НЕ
  // оплачивается, причём об этом никто и нигде не сообщает.
  //
  // Исключаем РОВНО 'cancelled'. 'paid' и 'partial' исключать нельзя: вернувшийся
  // студент, который уже заплатил (или доплачивает), должен сохранить свой план,
  // а не получить второй счёт за то же обучение.
  const existingStudentIds = new Set(
    existingSnap.docs
      .filter(d => d.data().status !== 'cancelled')
      .map(d => d.data().studentId),
  );

  // Collect new plans to create
  const isMonthly = courseData.paymentFormat === 'monthly';
  const enrollDate = new Date();
  const newPlans: any[] = [];
  for (const studentId of studentIds) {
    if (!existingStudentIds.has(studentId)) {
      const amount = effectiveChargeAmount(rates.get(studentId) ?? null, price);
      // Ноль — «платить нечего»: бесплатный курс или договорная цена 0
      // (стипендиат). Счёт на ноль не выставляем, как и раньше.
      if (amount <= 0) continue;
      newPlans.push({
        organizationId: orgId,
        branchId: branchId || null,
        studentId,
        courseId,
        courseName: courseData.title || '',
        totalAmount: amount,
        // Прайсовая цена = цена курса на момент зачисления; разница с суммой к
        // оплате и есть скидка. Ниже суммы к оплате не опускаем — у платящего
        // выше прайса скидка должна быть нулевой, а не отрицательной.
        listAmount: Math.max(price, amount),
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

/* ─── Bulk roster operations ─────────────────────────────────────────────── */
// Backing for the multi-select bars on the students and teachers pages: delete,
// migrate to a branch, migrate to a group. One code path serves both rosters —
// `kind` picks the roster and, with it, the permission that gates the call
// (student → students:write, teacher → teachers:write).

const BULK_MAX = 500;

type BulkKind = 'student' | 'teacher';

/** Roles that put a member on each roster. Admins/owners are handled separately. */
const BULK_KIND_ROLES: Record<BulkKind, string[]> = {
  student: ['student'],
  teacher: ['teacher', 'mentor'],
};

/** The RBAC resource whose `write` grant gates bulk ops on a roster. */
const bulkResource = (kind: BulkKind) => (kind === 'student' ? 'students' : 'teachers');

/** The group roster array a kind lives in. */
const bulkGroupField = (kind: BulkKind) => (kind === 'student' ? 'studentIds' : 'teacherIds');

/** Profile flag marking a record-only member (created by the org, no auth account). */
const bulkOfflineFlag = (kind: BulkKind) => (kind === 'student' ? 'offlineStudent' : 'offlineTeacher');

/**
 * Parse the shared part of every bulk body: the roster `kind` and the `uids` it
 * addresses. An unknown kind is rejected rather than defaulted — a typo must not
 * silently retarget the other roster (and with it, the other permission).
 */
export function parseBulkBody(body: any): { kind: BulkKind; uids: string[] } | { error: ReturnType<typeof badRequest> } {
  const kind = body.kind;
  if (kind !== 'student' && kind !== 'teacher') return { error: badRequest("kind must be 'student' or 'teacher'") };
  const raw: any[] = Array.isArray(body.uids) ? body.uids : [];
  const uids = [...new Set(raw.filter((u) => typeof u === 'string' && u.trim()).map((u: string) => u.trim()))];
  if (uids.length === 0) return { error: badRequest('uids array required') };
  if (uids.length > BULK_MAX) return { error: badRequest(`Максимум ${BULK_MAX} записей за одну операцию`) };
  return { kind, uids };
}

/**
 * Narrow `uids` to the members a bulk action may actually touch.
 *
 * Each target must be a member of THIS org holding the addressed role, so a uid
 * from another tenant — or a teacher passed to a student-kind call — is dropped
 * rather than acted on. Admins, owners and the caller are never targetable: a
 * bulk op must not be able to decapitate the org or lock out the person running
 * it. Branch-scoped managers are narrowed to their own branches, mirroring what
 * the `students` list does, so they can never act on rows they cannot see.
 *
 * Anything dropped is reported back as `skipped` rather than failing the call:
 * one stale uid in a 200-row selection shouldn't sink the other 199.
 */
export async function resolveBulkTargets(
  user: AuthUser,
  orgId: string,
  kind: BulkKind,
  uids: string[],
): Promise<{ targets: string[]; members: Record<string, any> }> {
  const members = await getDocsByIds(`orgMembers/${orgId}/members`, uids);
  // Anyone holding a branch assignment is scoped by it — a custom role based on
  // 'teacher' is no less restricted than a manager, so key off the assignment
  // rather than the literal role.
  const branchScoped = !isSuperAdmin(user) && !hasRole(user, 'admin') && user.branchIds.length > 0;
  const targets = uids.filter((uid) => {
    const m = members[uid];
    if (!m) return false;                                  // not a member of this org
    if (uid === user.uid) return false;                    // never act on yourself
    if (memberHoldsRole(m, ['owner', 'admin'])) return false;
    if (!memberHoldsRole(m, BULK_KIND_ROLES[kind])) return false;
    if (branchScoped) {
      const b: string[] = m.branchIds || [];
      if (b.length > 0 && !b.some((id: string) => user.branchIds.includes(id))) return false;
    }
    return true;
  });
  return { targets, members };
}

/**
 * Which targets a branch migration would actually change.
 *
 * Reporting every target as «Переведено» even when the destination is where they
 * already sit is how a mis-clicked action passes for a successful one: the bar
 * has two identical arrows, and a branch migration that changes nothing answered
 * with the same green toast as a real move. The count must mean something.
 */
export function branchTargetsNeedingChange(
  targets: string[],
  members: Record<string, any>,
  branchId: string,
): string[] {
  return targets.filter((uid) => {
    const m = members[uid] || {};
    const current: string[] = m.branchIds || [];
    return m.primaryBranchId !== branchId || current.length !== 1 || current[0] !== branchId;
  });
}

/**
 * Which targets a group migration would actually change: anyone not already in
 * the destination, plus anyone who has another group to leave first.
 */
export function groupTargetsNeedingChange(
  targets: string[],
  destinationRoster: string[],
  leaving: Set<string>,
): string[] {
  const inDestination = new Set(destinationRoster);
  return targets.filter((uid) => !inDestination.has(uid) || leaving.has(uid));
}

/** Remove `uids` from the `field` roster of every group that lists any of them. */
async function purgeFromGroups(orgId: string, field: string, uids: string[]) {
  const snap = await orgQuery('groups', orgId).get();
  const hit = new Set(uids);
  const dirty = snap.docs.filter((d: any) => ((d.data()[field] || []) as string[]).some((id) => hit.has(id)));
  for (let i = 0; i < dirty.length; i += 200) {
    const batch = adminDb.batch();
    for (const d of dirty.slice(i, i + 200)) {
      batch.update(d.ref, { [field]: FieldValue.arrayRemove(...uids), updatedAt: now() });
    }
    await batch.commit();
  }
  return dirty.length;
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
      // Курсы НЕ привязаны к филиалу — это общеорганизационный каталог. К филиалу
      // привязывается ГРУППА (см. action 'groups'), а курс — то, что группа ведёт.
      // Раньше здесь стоял strict-фильтр по branchId, и при выборе конкретного
      // филиала в переключателе любой курс без branchId (или с чужим) пропадал из
      // ответа целиком. Из-за этого у преподавателя «терялся» курс его же группы:
      // /courses, Журнал и Оценки достают курс по group.courseId, а самого курса в
      // списке уже не было. Филиалом отфильтруются группы — этого достаточно.
      const query = orgQuery('courses', orgId);
      let snap;
      try { snap = await query.orderBy('createdAt', 'desc').limit(200).get(); }
      catch { snap = await query.get(); }
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
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

      return ok(courseData);
    }

    if (action === 'createCourse') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'courses', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.title) return badRequest('title required');
      const data = {
        organizationId: orgId,
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
      // branchId намеренно НЕ в списке: курс общеорганизационный, филиал держит группа.
      const ALLOWED_FIELDS = ['title', 'description', 'subject', 'teacherIds', 'lessonIds', 'status', 'coverImageUrl', 'price', 'paymentFormat', 'durationMonths'];
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
      // Лимит 200 подрезал список молча, а он питает не только экран групп:
      // «Начислить за месяц» строит кандидатов из групп, поэтому в большой
      // академии часть студентов просто не предлагалась к начислению — без
      // единого признака в интерфейсе. Фолбэк ниже (когда индекса нет) и так
      // тянет ВСЁ, то есть охват зависел от наличия индекса. 2000 — заведомо
      // выше любого реального числа групп, и запрос остаётся ограниченным.
      try { snap = await query.orderBy('createdAt', 'desc').limit(2000).get(); }
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
      // Кто распоряжается группами всей организации: админ/менеджер по роли либо
      // преподаватель с точечным roster_management:write. Остальным преподавателям
      // создание доступно только по орг-политике «свои группы».
      const isPrivileged = isRosterManager(user);
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

      await logRoster(user, 'group_created', {
        entityId: ref.id, entityLabel: data.name,
        meta: { courseId: data.courseId, courseName: data.courseName || null, students: data.studentIds.length },
      });
      // Стартовый состав — это тоже «кого зачислили», иначе группа, собранная
      // сразу с учениками, не оставит в журнале ни одной записи о них.
      if (data.studentIds.length) {
        await logRoster(user, 'student_enrolled', {
          entityId: ref.id, entityLabel: data.name, count: data.studentIds.length,
          people: await namesForActivity(data.studentIds),
          meta: { groupId: ref.id, source: 'createGroup' },
        });
      }

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

      // Field-level authorization. Roster managers (админ/менеджер по роли или
      // преподаватель с roster_management:write) правят запись группы целиком.
      // Остальные преподаватели тоже держат groups:write, но их объём зависит от
      // отношения к группе:
      //   • a teacher who OWNS the group (createdBy) AND whose org enabled the
      //     "manage own groups" policy gets the full editor, like a manager;
      //   • otherwise a teacher who merely TEACHES the group may only advance
      //     syllabus progress / lifecycle status — never reassign people or move
      //     the group. Anything outside their scope is dropped (whitelist), and a
      //     teacher with no relationship to the group is refused outright.
      const isPrivileged = isRosterManager(user);
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
        const droppedStudents = oldStudents.filter((sid: string) => !newStudents.includes(sid));
        // Кто кого добавил/убрал из группы — в журнал активности, с именами.
        if (addedStudents.length) {
          await logRoster(user, 'student_enrolled', {
            entityId: id, entityLabel: updatedData.name || null, count: addedStudents.length,
            people: await namesForActivity(addedStudents),
            meta: { groupId: id, source: 'updateGroup' },
          });
        }
        if (droppedStudents.length) {
          await logRoster(user, 'student_removed', {
            entityId: id, entityLabel: updatedData.name || null, count: droppedStudents.length,
            people: await namesForActivity(droppedStudents),
            meta: { groupId: id, source: 'updateGroup', scope: 'group' },
          });
        }
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
        const removedStudents = droppedStudents;
        if (removedStudents.length > 0 && updatedData.courseId) {
          const plansSnap = await adminDb.collection('studentPaymentPlans')
            .where('organizationId', '==', orgId)
            .where('courseId', '==', updatedData.courseId)
            .get();
          const cancelBatch = adminDb.batch();
          plansSnap.docs.forEach(d => {
            const pd = d.data();
            // Нетронутость решает ФАКТ ОПЛАТЫ, а не статус (isUntouchedPlan).
            // Здесь стояло `pd.status === 'pending'`, и списание работало только
            // для счетов, чей срок ещё не наступил: статус 'overdue' проставляет
            // посторонний код — ночной крон debt-reminders и GET
            // api-finance-plans, — просто по истечении срока, без единого рубля
            // движения. Ушёл студент через день после дедлайна — счёт не
            // списывался никогда и оставался в долге академии навсегда.
            if (removedStudents.includes(pd.studentId) && isUntouchedPlan(pd)) {
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
      // Roster managers delete any group (needs groups:delete). Teachers may delete
      // only groups they own, and only when the org enabled the policy.
      const isPrivileged = isRosterManager(user);
      if (isPrivileged) {
        if (!can(user, 'groups', 'delete')) return forbidden('Недостаточно прав для этого действия');
      } else {
        const ownsGroup = doc.data()?.createdBy === user.uid && (await getTeacherGroupPolicy(orgId)).manage;
        if (!ownsGroup) return forbidden('Можно удалять только свои группы');
      }
      const deletedGroup = doc.data() || {};
      await adminDb.collection('groups').doc(body.id).delete();

      // Списываем нетронутые счета учеников удалённой группы — тем же правилом,
      // что и при выходе одного ученика из неё (updateGroup выше).
      //
      // Асимметрия была странной: убрать студента из группы — счёт списывается,
      // удалить группу целиком вместе со всеми студентами — счета живут дальше.
      // Начисления оставались в дебиторке за курс, которого для этих учеников
      // больше нет, а закрыть их было нечем: группы уже не существует.
      // Оплаченные и частично оплаченные не трогаем — за ними стоят настоящие
      // деньги, и их судьбу решает человек.
      const affectedStudents: string[] = Array.isArray(deletedGroup.studentIds) ? deletedGroup.studentIds : [];
      let cancelledPlans = 0;
      if (affectedStudents.length > 0 && deletedGroup.courseId) {
        // ── Списываем УЗКО: только то, что удаление группы действительно отменяет ──
        // Счёт живёт по ключу (студент × курс × ПЕРИОД) и к группе не привязан
        // вовсе, поэтому выборка по одному courseId захватывает всю историю
        // курса. Без двух ограничений ниже удаление одной закрытой группы
        // списывало студенту и неоплаченные апрель с маем, которые академия ещё
        // взыскивала, и текущий счёт, по которому он учится в другой группе
        // того же курса. Долг при этом исчезает молча: 'cancelled' отбрасывают
        // ВСЕ агрегаторы (isDebtBearingPlan), а крон помесячного начисления
        // считает месяц уже покрытым и счёт не перевыставит — это потеря
        // выручки, а не только потеря долга.
        //
        // 1. Студент, оставшийся в другой ЖИВОЙ группе того же курса, продолжает
        //    учиться — его счета не наши.
        const otherGroupsSnap = await adminDb.collection('groups')
          .where('organizationId', '==', orgId)
          .where('courseId', '==', deletedGroup.courseId)
          .get();
        const stillEnrolled = new Set<string>();
        otherGroupsSnap.docs.forEach(g => {
          if (g.id === body.id) return;
          const gd = g.data() as any;
          if (gd.status && gd.status !== 'active') return;
          for (const sid of (gd.studentIds || [])) stillEnrolled.add(String(sid));
        });

        // 2. Только ТЕКУЩИЙ и будущие периоды. Прошлые месяцы — это уже
        //    оказанная услуга, и списывать их за человека нельзя.
        const currentPeriod = orgDayKey().slice(0, 7);

        const plansSnap = await adminDb.collection('studentPaymentPlans')
          .where('organizationId', '==', orgId)
          .where('courseId', '==', deletedGroup.courseId)
          .get();
        const toCancel = plansSnap.docs.filter(d => {
          const pd = d.data();
          if (!affectedStudents.includes(pd.studentId)) return false;
          if (stillEnrolled.has(String(pd.studentId))) return false;
          if (!isUntouchedPlan(pd)) return false;
          const period = planPeriodKey(pd);
          return !!period && period >= currentPeriod;
        });

        // Чанкуем: батч Firestore держит 500 операций, а у большой группы счетов
        // может быть больше. Ошибку НЕ глотаем — иначе ответ и аудит рапортуют
        // о списании, которого не произошло.
        for (let i = 0; i < toCancel.length; i += 400) {
          const batch = adminDb.batch();
          for (const d of toCancel.slice(i, i + 400)) {
            batch.update(d.ref, { status: 'cancelled', updatedAt: now() });
          }
          await batch.commit();
          cancelledPlans += Math.min(400, toCancel.length - i);
        }
      }

      await logRoster(user, 'group_deleted', {
        entityId: body.id, entityLabel: deletedGroup.name || null,
        meta: { courseId: deletedGroup.courseId || null, students: affectedStudents.length, cancelledPlans },
      });
      return ok({ deleted: true, cancelledPlans });
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
          // `userId || d.id` — тот же приём, что в api-risk, debt-reminders,
          // monthly-billing и ещё семи местах: у части документов участников
          // поля userId нет, и документ ключуется самим uid. Здесь запасного
          // варианта не было, поэтому такой ученик получал uid: undefined и
          // пропадал из ростера — а его начисление, у которого studentId на
          // месте, оставалось в списке оплат строкой без имени.
          return { uid: data.userId || d.id, displayName: data.userName, email: data.userEmail, role: data.role, roles: data.roles || [], branchIds: data.branchIds || [], primaryBranchId: data.primaryBranchId || null, status: data.status || 'active' };
        })
        .filter((m: any) => memberHoldsRole(m, ['student']));

      // Branch scoping in memory (the query above is unscoped by branch).
      // Use resolveBranchFilter so a branch-scoped manager can't read a branch
      // they aren't assigned to — even when they (or the AI copilot) pass an
      // explicit branchId. Mirrors the courses/groups/schedule actions.
      const studentBranchScope = resolveBranchFilter(user, params.branchId);
      if (studentBranchScope === '__DENIED__') return ok([]);
      filtered = filtered.filter((s: any) => memberInBranchScope(s.branchIds, studentBranchScope));

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
      const err = requireOrgStaff(user); if (err) return err;
      // Заводить студентов может тот, кто ведёт контингент организации: админ и
      // менеджер по роли, преподаватель — по выданному roster_management:write.
      if (!isRosterManager(user)) return forbidden('Недостаточно прав для этого действия');
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

        await logRoster(user, 'student_created', {
          entityId: studentUid, entityLabel: body.displayName,
          people: [{ id: studentUid, name: body.displayName }],
          meta: { hasLogin: wantsLogin, groupId: body.groupId || null, branchId: body.primaryBranchId || null },
        });

        // Auto-enroll in group if provided
        if (body.groupId) {
          const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
          if (groupDoc.exists && groupDoc.data()?.organizationId === orgId) {
            await adminDb.collection('groups').doc(body.groupId).update({
              studentIds: FieldValue.arrayUnion(studentUid),
              updatedAt: now(),
            });
            await logRoster(user, 'student_enrolled', {
              entityId: body.groupId, entityLabel: groupDoc.data()?.name || null,
              people: [{ id: studentUid, name: body.displayName }],
              meta: { groupId: body.groupId, source: 'createStudent' },
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
      const err = requireOrgStaff(user); if (err) return err;
      if (!isRosterManager(user)) return forbidden('Недостаточно прав для этого действия');
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

      // Имена здесь уже есть — берём их из самого импорта, без похода в профили.
      const importedPeople = allowed.map((r, i) => ({ id: createdUids[i], name: r.displayName }));
      if (createdUids.length > 0) {
        await logRoster(user, 'student_created', {
          entityLabel: `Импорт: ${createdUids.length}`, count: createdUids.length,
          people: importedPeople,
          meta: { source: 'bulkImport', skipped, groupId: body.groupId || null },
        });
      }

      // Enroll the whole batch into a group + auto-generate payment plans
      if (body.groupId && createdUids.length > 0) {
        const groupDoc = await adminDb.collection('groups').doc(body.groupId).get();
        if (groupDoc.exists && groupDoc.data()?.organizationId === orgId) {
          await adminDb.collection('groups').doc(body.groupId).update({
            studentIds: FieldValue.arrayUnion(...createdUids),
            updatedAt: ts,
          });
          await logRoster(user, 'student_enrolled', {
            entityId: body.groupId, entityLabel: groupDoc.data()?.name || null, count: createdUids.length,
            people: importedPeople,
            meta: { groupId: body.groupId, source: 'bulkImport' },
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

    // Выдать вход студенту, заведённому без него (через «Добавить» без доступа
    // или импортом). До этого логин можно было получить только при создании, а
    // заводить студента заново означало бросить его журнал, оплаты и группы.
    //
    // Ключевой момент: аккаунт создаётся с УЖЕ существующим uid. У офлайн-студента
    // это обычный id документа, и Firebase Auth принимает его как uid, поэтому
    // ничего мигрировать не нужно — все ссылки на студента остаются валидными.
    if (action === 'grantStudentLogin') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'students', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');
      if (typeof body.password !== 'string' || body.password.length < 6) {
        return badRequest('Пароль — минимум 6 символов');
      }

      const member = await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(body.uid).get();
      if (!member.exists) return notFound();
      if (member.data()?.role !== 'student') return badRequest('Действие доступно только для студентов');

      const userRef = adminDb.collection('users').doc(body.uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) return notFound();
      const data = userDoc.data() || {};
      // Уже есть вход — это смена пароля, у неё свой экшен со своими проверками.
      if (data.offlineStudent !== true && data.email) {
        return badRequest('У этого ученика уже есть вход. Используйте смену пароля.');
      }

      const username = String(body.username || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (username.length < 3) return badRequest('Логин — минимум 3 символа');
      const taken = await adminDb.collection('users').where('username', '==', username).limit(1).get();
      if (!taken.empty) return badRequest('Этот логин уже занят');

      const loginEmail = (body.email && String(body.email).trim())
        ? String(body.email).trim().toLowerCase()
        : `${username}@student.sabakhub.app`;
      const dupEmail = await adminDb.collection('users').where('email', '==', loginEmail).limit(1).get();
      if (!dupEmail.empty) return badRequest('Пользователь с таким email уже существует');

      try {
        await adminAuth.createUser({
          uid: body.uid,
          email: loginEmail,
          password: body.password,
          displayName: data.displayName || member.data()?.userName || undefined,
        });
      } catch (e: any) {
        if (e.code === 'auth/uid-already-exists') return badRequest('У этого ученика уже есть аккаунт входа');
        if (e.code === 'auth/email-already-exists') return badRequest('Пользователь с таким email уже существует');
        throw e;
      }

      await userRef.update({
        email: loginEmail,
        username,
        offlineStudent: false,
        hasLogin: true,
        updatedAt: now(),
      });
      await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(body.uid)
        .update({ userEmail: loginEmail, offlineStudent: false, updatedAt: now() }).catch(() => {});

      return ok({ uid: body.uid, username, email: loginEmail });
    }

    if (action === 'resetStudentPassword') {
      const body = JSON.parse(event.body || '{}');
      if (!body.uid || !body.password) return badRequest('uid and password required');
      if (String(body.password).length < 6) return badRequest('Пароль — минимум 6 символов');

      // Who may reset a student's password:
      //  • roster manager with students:write → any student in the org
      //  • teacher → only students enrolled in a group they teach (own-groups scope)
      const canManageAllStudents = isRosterManager(user) && can(user, 'students', 'write');
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

    // ═══ BULK ROSTER OPS (delete / migrate branch / migrate group) ═══

    if (action === 'bulkDeleteMembers') {
      const err = requireOrgStaff(user); if (err) return err;
      const parsed = parseBulkBody(JSON.parse(event.body || '{}'));
      if ('error' in parsed) return parsed.error;
      const { kind, uids } = parsed;
      // Deleting takes the `delete` grant, not `write` — migrating someone between
      // groups and erasing them are different powers, and the catalog separates them.
      if (!can(user, bulkResource(kind), 'delete')) return forbidden('Недостаточно прав для этого действия');

      const { targets, members } = await resolveBulkTargets(user, orgId, kind, uids);
      if (targets.length === 0) return ok({ deleted: 0, skipped: uids.length, purged: 0 });

      // Пишем в журнал ДО удаления: имена берём из ростер-документов, которые
      // сейчас исчезнут — после удаления восстанавливать их будет не по чему.
      if (kind === 'student') {
        await logRoster(user, 'student_removed', {
          count: targets.length,
          people: targets.map(uid => ({ id: uid, name: members[uid]?.userName || '' })),
          meta: { source: 'bulkDelete', scope: 'organization' },
        });
      }

      // 1 ─ Drop both membership mirrors. verifyAuth reads the user-side doc and
      //     every roster reads the org-side one, so a half-delete would leave the
      //     member visible in one of the two.
      for (let i = 0; i < targets.length; i += 200) {
        const batch = adminDb.batch();
        for (const uid of targets.slice(i, i + 200)) {
          batch.delete(adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid));
          batch.delete(adminDb.collection('users').doc(uid).collection('memberships').doc(orgId));
        }
        await batch.commit();
      }

      // 2 ─ Drop them from every group roster, so deletes don't leave ghost ids in
      //     studentIds/teacherIds — the journal, gradebook and group pages read those.
      await purgeFromGroups(orgId, bulkGroupField(kind), targets);

      // 3 ─ A record-only member exists purely as this org's roster row: no auth
      //     account, no way to sign in and reach the profile again. Once the last
      //     membership is gone the profile is unreachable, so delete it too rather
      //     than orphan it. Anyone with a real login keeps their profile — only
      //     their tie to this org is removed.
      const profiles = await getDocsByIds('users', targets);
      const offlineFlag = bulkOfflineFlag(kind);
      const candidates = targets.filter((uid) => {
        const p = profiles[uid];
        return p && p[offlineFlag] === true && p.createdByOrg === true;
      });
      const orphaned = (await Promise.all(candidates.map(async (uid) => {
        // Re-check after the delete above: a profile shared with a second org must
        // survive this org's cleanup.
        const left = await adminDb.collection('users').doc(uid).collection('memberships').limit(1).get();
        return left.empty ? uid : null;
      }))).filter(Boolean) as string[];
      for (let i = 0; i < orphaned.length; i += 400) {
        const batch = adminDb.batch();
        for (const uid of orphaned.slice(i, i + 400)) batch.delete(adminDb.collection('users').doc(uid));
        await batch.commit();
      }

      return ok({ deleted: targets.length, skipped: uids.length - targets.length, purged: orphaned.length });
    }

    if (action === 'bulkSetBranch') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      const parsed = parseBulkBody(body);
      if ('error' in parsed) return parsed.error;
      const { kind, uids } = parsed;
      if (!can(user, bulkResource(kind), 'write')) return forbidden('Недостаточно прав для этого действия');

      const branchId = String(body.branchId || '').trim();
      if (!branchId) return badRequest('branchId required');
      const branchDoc = await adminDb.collection('branches').doc(branchId).get();
      if (!branchDoc.exists || branchDoc.data()?.organizationId !== orgId) return notFound('Branch not found');
      // A branch-scoped member may only migrate people into a branch they hold —
      // otherwise they could push members somewhere they can no longer see.
      if (!userHasBranchAccess(user, branchId)) {
        return forbidden('Нет доступа к этому филиалу');
      }

      const { targets, members } = await resolveBulkTargets(user, orgId, kind, uids);
      if (targets.length === 0) return ok({ moved: 0, skipped: uids.length });

      // Only those whose assignment actually differs — see branchTargetsNeedingChange.
      const changing = branchTargetsNeedingChange(targets, members, branchId);

      // Migration replaces the assignment rather than appending: a member ends up in
      // exactly the destination branch. set(merge) rather than update() so this never
      // throws on a membership that only exists in one mirror.
      const patch = { branchIds: [branchId], primaryBranchId: branchId, updatedAt: now() };
      for (let i = 0; i < changing.length; i += 200) {
        const batch = adminDb.batch();
        for (const uid of changing.slice(i, i + 200)) {
          batch.set(adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid), patch, { merge: true });
          batch.set(adminDb.collection('users').doc(uid).collection('memberships').doc(orgId), patch, { merge: true });
        }
        await batch.commit();
      }

      return ok({
        moved: changing.length,
        skipped: uids.length - targets.length,
        unchanged: targets.length - changing.length,
        branchId,
      });
    }

    if (action === 'bulkSetGroup') {
      const err = requireOrgStaff(user); if (err) return err;
      const body = JSON.parse(event.body || '{}');
      const parsed = parseBulkBody(body);
      if ('error' in parsed) return parsed.error;
      const { kind, uids } = parsed;
      if (!can(user, bulkResource(kind), 'write')) return forbidden('Недостаточно прав для этого действия');

      const groupId = String(body.groupId || '').trim();
      if (!groupId) return badRequest('groupId required');
      const groupDoc = await adminDb.collection('groups').doc(groupId).get();
      if (!groupDoc.exists || groupDoc.data()?.organizationId !== orgId) return notFound('Group not found');

      const { targets, members } = await resolveBulkTargets(user, orgId, kind, uids);
      if (targets.length === 0) return ok({ moved: 0, skipped: uids.length });

      const field = bulkGroupField(kind);

      // Migration = leave every other group, then join the destination. A roster is
      // an array and a member can sit in many groups at once, so without the removal
      // pass a "move" would silently pile up memberships instead of moving anyone.
      const snap = await orgQuery('groups', orgId).get();
      const hit = new Set(targets);
      const leaving = snap.docs.filter((d: any) =>
        d.id !== groupId && ((d.data()[field] || []) as string[]).some((id) => hit.has(id)));
      const leavingIds = new Set<string>();
      leaving.forEach((d: any) => ((d.data()[field] || []) as string[]).forEach((id) => {
        if (hit.has(id)) leavingIds.add(id);
      }));

      // Anyone already sitting in the destination with no other group to leave is
      // not "moved" — saying otherwise makes a no-op indistinguishable from a move.
      const changing = groupTargetsNeedingChange(targets, (groupDoc.data()?.[field] || []) as string[], leavingIds);

      if (changing.length > 0) {
        for (let i = 0; i < leaving.length; i += 200) {
          const batch = adminDb.batch();
          for (const d of leaving.slice(i, i + 200)) {
            batch.update(d.ref, { [field]: FieldValue.arrayRemove(...targets), updatedAt: now() });
          }
          await batch.commit();
        }
        await adminDb.collection('groups').doc(groupId).update({
          [field]: FieldValue.arrayUnion(...targets),
          updatedAt: now(),
        });

        if (kind === 'student') {
          await logRoster(user, 'student_enrolled', {
            entityId: groupId, entityLabel: groupDoc.data()?.name || null, count: changing.length,
            people: await namesForActivity(changing, members),
            meta: { groupId, source: 'bulkSetGroup' },
          });
        }
      }

      // Students joining a priced course get a payment plan, exactly as a fresh
      // import would. syncPaymentPlans skips anyone who already has one, so
      // migrating within the same course is a no-op here.
      if (kind === 'student') {
        const courseId = groupDoc.data()?.courseId;
        if (courseId) {
          await syncPaymentPlans(orgId, groupDoc.data()?.branchId || null, courseId, targets).catch(console.error);
        }
      }

      return ok({
        moved: changing.length,
        skipped: uids.length - targets.length,
        unchanged: targets.length - changing.length,
        groupId,
      });
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

      // Branch scoping, same as the students action — a branch-scoped member must
      // not enumerate staff (or their uids, which feed bulk actions) outside their
      // branches. Org-wide staff carry no branchIds and stay visible to everyone;
      // they teach across branches, so hiding them would empty the teacher pickers.
      const teacherBranchScope = resolveBranchFilter(user, params.branchId);
      if (teacherBranchScope === '__DENIED__') return ok([]);
      if (typeof teacherBranchScope === 'string') {
        members = members.filter((m: any) => m.branchIds.length === 0 || m.branchIds.includes(teacherBranchScope));
      } else if (Array.isArray(teacherBranchScope)) {
        members = members.filter((m: any) =>
          m.branchIds.length === 0 || m.branchIds.some((id: string) => teacherBranchScope.includes(id))
        );
      }

      // Enrich with user profile data (avatarUrl, phone, city, createdAt)
      let enriched = members;
      if (members.length > 0) {
        const uids = members.map((t: any) => t.uid);
        const profileMap = await getDocsByIds('users', uids);
        // Кто из преподавателей подключил Telegram — это внутренняя операционная
        // информация («кого ещё дожать»), студентам в их версии списка не нужна.
        // Наружу уходит только флаг: сам chatId — идентификатор чужого чата.
        const showTelegram = !hasRole(user, 'student');
        enriched = members.map((t: any) => {
          const p = profileMap[t.uid] || {};
          return {
            ...t,
            avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '', city: p.city || '', bio: p.bio || '', createdAt: p.createdAt || '',
            ...(showTelegram ? { telegramLinked: !!p.telegramChatId, telegramLinkedAt: p.telegramLinkedAt || '' } : {}),
          };
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

    // Правка карточки преподавателя. Зеркало updateStudent, но с двумя отличиями:
    // цель обязана держать преподавательскую роль (иначе через этот путь можно было
    // бы править профиль директора, у которого те же teachers:write не спрашиваются),
    // и в белом списке нет username — смена логина трогает вход в систему и живёт
    // отдельно. Роли и статус здесь не меняются: это RBAC, а не карточка.
    if (action === 'updateTeacher') {
      const err = requireOrgStaff(user); if (err) return err;
      if (!can(user, 'teachers', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.uid) return badRequest('uid required');

      const memberDoc = await adminDb.collection('orgMembers').doc(orgId)
        .collection('members').doc(body.uid).get();
      if (!memberDoc.exists) return notFound();
      const member = memberDoc.data() as any;
      if (!memberHoldsRole(member, ['teacher', 'mentor'])) {
        return badRequest('Этот участник не преподаватель');
      }
      // Филиальный менеджер не должен править сотрудников чужих филиалов. Без
      // запрошенного филиала scope — это либо null (общеорганизационный доступ),
      // либо массив своих филиалов; в обоих случаях общеорганизационный препод
      // (без branchIds) остаётся доступен — ровно как в выдаче списка выше.
      if (!memberInBranchScope(member.branchIds || [], resolveBranchFilter(user, undefined))) {
        return forbidden();
      }

      const userDoc = await adminDb.collection('users').doc(body.uid).get();
      if (!userDoc.exists) return notFound();

      const ALLOWED_FIELDS = ['displayName', 'phone', 'city', 'bio', 'avatarUrl', 'country'];
      const updateData: Record<string, any> = { updatedAt: now() };
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }
      await adminDb.collection('users').doc(body.uid).update(updateData);

      // orgMembers держит денормализованное имя — списки читают его, не профиль.
      if (body.displayName) {
        await adminDb.collection('orgMembers').doc(orgId)
          .collection('members').doc(body.uid)
          .update({ userName: body.displayName, updatedAt: now() }).catch(() => {});
      }

      return ok({ uid: body.uid, updated: true });
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
      // Запрос по конкретной группе уже сужен самой группой, и выбор филиала в
      // сайдбаре здесь только мешает: у части групп филиал не проставлен, их
      // занятия тоже без филиала, а под конкретным филиалом записи без него
      // отбрасываются — расписание в карточке группы оказывалось пустым.
      // Собственный скоуп пользователя при этом сохраняется.
      const branchScope = resolveBranchFilter(user, params.groupId ? undefined : params.branchId);
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
      if (!can(user, 'schedule', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      const isRecurring = body.recurring === true;
      if (!body.title || !body.startTime) return badRequest('title and startTime required');
      if (!isRecurring && !body.date) return badRequest('date required for non-recurring events');
      if (isRecurring && (body.dayOfWeek === undefined || body.dayOfWeek === null)) return badRequest('dayOfWeek required for recurring events');

      const room = await resolveClassroom(orgId, body);
      if ('error' in room) return badRequest(room.error);

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
        classroomId: room.classroomId, classroomName: room.classroomName,
        // location держим в синхроне с classroomName: по нему читают дашборды,
        // студенческое расписание и AI-эндпоинты, ещё не знающие о справочнике.
        location: room.location, notes: body.notes || '',
        createdAt: now(), updatedAt: now(),
      };
      // Block double-booking (teacher / group / room) unless explicitly forced.
      if (body.force !== true) {
        const conflicts = await detectScheduleConflicts(orgId, {
          recurring: isRecurring,
          dayOfWeek: isRecurring ? Number(body.dayOfWeek) : null,
          date: isRecurring ? null : body.date,
          startTime: body.startTime, endTime: body.endTime, duration: body.duration,
          teacherId: body.teacherId, groupId: body.groupId,
          classroomId: room.classroomId, classroomName: room.classroomName, location: room.location,
          branchId: body.branchId || null,
        });
        if (conflicts.length) return jsonResponse(409, { error: conflictMessage(conflicts), conflicts });
      }
      const ref = await adminDb.collection('scheduleEvents').add(data);
      return ok({ id: ref.id, ...data });
    }

    if (action === 'updateEvent') {
      if (!can(user, 'schedule', 'write')) return forbidden('Недостаточно прав для этого действия');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('scheduleEvents').doc(body.id).get();
      if (!doc.exists || doc.data()?.organizationId !== orgId) return notFound();
      const before = doc.data()!;
      const { id, force, ...fields } = body;

      // Кабинет пересобираем, только если о нём вообще что-то прислали — иначе
      // правка времени обнулила бы аудиторию.
      if (fields.classroomId !== undefined || fields.location !== undefined) {
        const room = await resolveClassroom(orgId, {
          classroomId: fields.classroomId !== undefined ? fields.classroomId : before.classroomId,
          location: fields.location !== undefined ? fields.location : before.location,
        });
        if ('error' in room) return badRequest(room.error);
        fields.classroomId = room.classroomId;
        fields.classroomName = room.classroomName;
        fields.location = room.location;
      }

      // Re-check conflicts against the event's resulting state (covers drag&drop moves).
      if (force !== true) {
        const m = { ...before, ...fields };
        const conflicts = await detectScheduleConflicts(orgId, {
          recurring: !!m.recurring,
          dayOfWeek: m.recurring ? Number(m.dayOfWeek) : null,
          date: m.recurring ? null : m.date,
          startTime: m.startTime, endTime: m.endTime, duration: m.duration,
          teacherId: m.teacherId, groupId: m.groupId,
          classroomId: m.classroomId, classroomName: m.classroomName, location: m.location,
          branchId: m.branchId || null,
        }, id);
        if (conflicts.length) return jsonResponse(409, { error: conflictMessage(conflicts), conflicts });
      }
      fields.updatedAt = now();
      await adminDb.collection('scheduleEvents').doc(id).update(fields);

      // Notify the group when the time / date / classroom actually changes.
      const changed = ['startTime', 'endTime', 'date', 'dayOfWeek', 'location', 'classroomId'].some(
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
