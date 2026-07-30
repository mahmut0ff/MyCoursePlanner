/**
 * API: Teacher Activity — KPI преподавателей и лента активности.
 *
 * Читает журнал `teacherActivity` (его пишут мутации через utils/teacher-activity)
 * и агрегирует в KPI по преподавателям. Чтение гейтится правом
 * `teacher_activity:read` (см. utils/rbac). POST action=ping — служебная запись
 * входа: её шлёт любой сотрудник о СЕБЕ (актёр берётся из токена), право
 * teacher_activity здесь не нужно.
 *
 * Индексов не заводит (см. memory «Firestore indexes are not deployed»): журнал
 * читается по равенству `orgMonth` (или `organizationId` для 'all'), окно периода,
 * фильтр филиала и сортировка — уже в памяти. Область филиала определяется по
 * членству преподавателя (memberInBranchScope), а не по branchId события — так
 * событие без филиала не выпадает из per-branch выборки своего же автора.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, can, isStaff, getOrgFilter,
  resolveBranchFilter, memberInBranchScope, memberHoldsRole,
  ok, unauthorized, forbidden, badRequest, jsonResponse,
} from './utils/auth';
import { getPeriodRange } from './utils/finance-period';
import { batchGetUserNames } from './utils/finance-names';
import { recordLoginActivity, TEACHER_ACTIVITY_COLLECTION } from './utils/teacher-activity';
import {
  buildKpiRows, countWorkingDays, orgMonthsBetween,
  type ActivityEvent, type RosterTeacher, type KpiTotals,
} from './utils/teacher-kpi';

const TEACHING_ROLES = ['teacher', 'mentor'];

interface RawActivityDoc {
  id: string;
  actorId?: string;
  actorName?: string | null;
  type?: string;
  count?: number | null;
  branchId?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  dayKey?: string | null;
  createdAt?: string | null;
  meta?: Record<string, unknown> | null;
}

function emptyTotals(): KpiTotals {
  return { teachers: 0, activeTeachers: 0, totalActions: 0, avgActionsPerTeacher: 0, topTeacherId: null };
}

/** Выборка журнала за период. 'all' — одним равенством по org; иначе — месяцы-бакеты. */
async function fetchOrgActivity(
  orgId: string, period: string, startIso: string, endIso: string,
): Promise<RawActivityDoc[]> {
  if (period === 'all') {
    const snap = await adminDb.collection(TEACHER_ACTIVITY_COLLECTION)
      .where('organizationId', '==', orgId).get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as RawActivityDoc[];
  }
  const months = orgMonthsBetween(startIso, endIso);
  const snaps = await Promise.all(
    months.map(m =>
      adminDb.collection(TEACHER_ACTIVITY_COLLECTION)
        .where('orgMonth', '==', `${orgId}_${m}`).get().catch(() => null),
    ),
  );
  const docs: RawActivityDoc[] = [];
  for (const s of snaps) {
    if (!s) continue;
    s.docs.forEach(d => docs.push({ id: d.id, ...(d.data() as Record<string, unknown>) } as RawActivityDoc));
  }
  return docs;
}

interface MemberDoc {
  id: string;
  userId?: string;
  name?: string;
  userName?: string;
  role?: string;
  roles?: string[];
  branchIds?: string[];
}

/** Преподаватели организации, активные и в области выбранного филиала. */
async function fetchTeachingRoster(
  orgId: string, scope: string | null | string[],
): Promise<{ id: string; name?: string }[]> {
  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members').where('status', '==', 'active').get();
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as MemberDoc))
    .filter(m => memberHoldsRole(m, TEACHING_ROLES))
    .filter(m => memberInBranchScope(m.branchIds, scope))
    .map(m => ({ id: m.userId || m.id, name: m.name || m.userName }));
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || 'kpi';

  try {
    // ── POST ping — запись собственного входа (актёр из токена, право не нужно) ──
    if (action === 'ping' && event.httpMethod === 'POST') {
      if (!isStaff(user)) return ok({ ok: false }); // вход трекаем только у персонала
      await recordLoginActivity({
        organizationId: user.organizationId, actorId: user.uid,
        actorName: user.displayName, actorRole: user.role, branchId: user.primaryBranchId,
      });
      return ok({ ok: true });
    }

    // ── Чтение KPI / ленты — по праву teacher_activity:read ──
    if (!can(user, 'teacher_activity', 'read')) return forbidden('Нет доступа к активности преподавателей');

    const orgId = getOrgFilter(user);
    if (!orgId) return badRequest('Organization context required');

    const scope = resolveBranchFilter(user, params.branchId);
    if (scope === '__DENIED__') {
      return ok(action === 'timeline'
        ? { teacherId: params.teacherId || null, events: [] }
        : { period: null, rows: [], totals: emptyTotals() });
    }

    const period = params.period || 'current_month';
    const { startIso, endIso } = getPeriodRange(period);

    const rawEvents = await fetchOrgActivity(orgId, period, startIso, endIso);
    // Точная отсечка по окну периода — месяц-бакеты берутся с запасом ±1 месяц.
    const windowed = rawEvents.filter(e => {
      const at = e.createdAt || '';
      return at >= startIso && at <= endIso;
    });

    // ── timeline: лента одного преподавателя (для карточки в UI) ──
    if (action === 'timeline') {
      const teacherId = params.teacherId;
      if (!teacherId) return badRequest('teacherId required');
      const roster = await fetchTeachingRoster(orgId, scope);
      const inScope = scope === null || roster.some(r => r.id === teacherId);
      if (!inScope) return forbidden('Преподаватель вне области филиала');
      const events = windowed
        .filter(e => e.actorId === teacherId)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 100)
        .map(e => ({
          id: e.id, type: e.type, count: e.count ?? 1,
          entityId: e.entityId ?? null, entityLabel: e.entityLabel ?? null,
          branchId: e.branchId ?? null, createdAt: e.createdAt ?? null, meta: e.meta ?? null,
        }));
      return ok({ teacherId, period: { period, startIso, endIso }, events });
    }

    // ── kpi (по умолчанию) ──
    const roster = await fetchTeachingRoster(orgId, scope);
    const rosterIds = new Set(roster.map(r => r.id));

    // Выбранный филиал → только события преподавателей в области; «Все филиалы»
    // (scope === null) → все события, включая ушедших сотрудников и иные роли.
    const scopedEvents = scope === null
      ? windowed
      : windowed.filter(e => e.actorId && rosterIds.has(e.actorId));

    // Имена: ростер резолвим всегда (надёжно), события — только если не денормализовано.
    const nameIds = new Set<string>(roster.map(r => r.id));
    scopedEvents.forEach(e => { if (e.actorId && !e.actorName) nameIds.add(e.actorId); });
    const resolved = nameIds.size ? await batchGetUserNames([...nameIds]) : new Map<string, string>();

    const rosterTeachers: RosterTeacher[] = roster.map(r => ({
      teacherId: r.id, name: resolved.get(r.id) || r.name || r.id,
    }));
    const events: ActivityEvent[] = scopedEvents.map(e => ({
      actorId: e.actorId || '',
      actorName: e.actorName || resolved.get(e.actorId || '') || null,
      type: e.type || '',
      count: e.count ?? 1,
      dayKey: e.dayKey ?? null,
      createdAt: e.createdAt ?? null,
      branchId: e.branchId ?? null,
    }));

    const expectedActiveDays = countWorkingDays(startIso, endIso);
    const { rows, totals } = buildKpiRows(events, rosterTeachers, { expectedActiveDays });

    return ok({ period: { period, startIso, endIso, expectedActiveDays }, rows, totals });
  } catch (err: any) {
    console.error('api-teacher-activity error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
