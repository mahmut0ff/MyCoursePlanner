/**
 * API: Рейтинг студентов — «оценки + посещаемость» по каждому ученику.
 *
 * Отдаёт СЧЁТЧИКИ по паре «студент × курс», а не готовые проценты. Так страница
 * пересобирает срез (все курсы / один курс / одна группа) без похода на сервер и
 * складывает сырые числа, а не средние средних — см. WHY в
 * `src/lib/student-rating.ts`, где живёт вся формула.
 *
 * Индексов не заводит (см. memory «Firestore indexes are not deployed»):
 * `journal`, `grades` и `gradeSchemas` читаются одним равенством по
 * `organizationId`, а окно периода и филиал применяются уже в памяти.
 *
 * Филиал берётся из членства студента (`memberInBranchScope`), как в ростере и
 * api-risk: у самих `journal`/`grades` поля branchId нет и не будет — владелец
 * отказался от филиального разреза академических записей, филиал у них выводится
 * через группу (см. memory «Course branch tracking»).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, can, isStaff,
  resolveBranchFilter, memberInBranchScope, memberHoldsRole,
  ok, unauthorized, forbidden, jsonResponse,
} from './utils/auth';
import { getPeriodRange } from './utils/finance-period';
import { orgDayKey } from './utils/payment-plans';
import { entryNumericValue } from '../../src/lib/gradePresets';
import { emptyCounts, type RatingCounts } from '../../src/lib/student-rating';
import type { GradeSchema } from '../../src/types';

interface RatingStudent {
  uid: string;
  name: string;
  avatarUrl: string;
  branchIds: string[];
}

/** Счётчики одной пары «студент × курс» — плоско, чтобы не раздувать ответ. */
interface RatingStat extends RatingCounts {
  studentId: string;
  courseId: string;
}

/** Ключ корзины. `|` не встречается в id документов Firestore, поэтому склейка однозначна. */
const key = (studentId: string, courseId: string) => `${studentId}|${courseId}`;

/**
 * Максимум шкалы для одной оценки: сохранённый у самой оценки, иначе — из схемы
 * курса. `maxValue` не украшение: пятёрка, записанная с `maxValue: 100`, читается
 * как 5 % и роняет отличника вниз рейтинга (ровно этим отличилась миграция шкалы).
 */
function maxOf(grade: { maxValue?: number | null }, schema: GradeSchema | null): number {
  const own = typeof grade.maxValue === 'number' ? grade.maxValue : 0;
  if (own > 0) return own;
  const fromSchema = schema?.scale?.max;
  return typeof fromSchema === 'number' && fromSchema > 0 ? fromSchema : 0;
}

/** Дата оценки для окна периода: явное поле, иначе момент выставления. */
function gradeInstant(g: { date?: unknown; createdAt?: unknown }): number | null {
  const raw = (typeof g.date === 'string' && g.date) || (typeof g.createdAt === 'string' && g.createdAt) || '';
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  const orgId = user.organizationId;
  if (!orgId) return forbidden();

  // Гейт — собственный ресурс `student_rating`: поимённая сводка по всем
  // ученикам организации это отчёт, а не свои оценки, поэтому право отдельное
  // (студенту оно не выдаётся ни одной ролью по умолчанию) и снимается, не
  // задевая «Аналитику». Преподавателю и менеджеру входит в набор по умолчанию.
  if (!isStaff(user)) return forbidden('Staff access required');
  if (!can(user, 'student_rating', 'read')) return forbidden('Нет доступа к рейтингу студентов');

  const params = event.queryStringParameters || {};
  const period = params.period || 'all';

  // Переключатель филиалов штампует branchId на GET (api.ts BRANCH_SCOPED_ENDPOINTS);
  // resolveBranchFilter — пол, ниже которого запрошенный филиал не расширяет область.
  const branchScope = resolveBranchFilter(user, params.branchId);
  if (branchScope === '__DENIED__') {
    return ok({ period: { period, startIso: '', endIso: '' }, students: [], stats: [] });
  }

  const { startIso, endIso } = getPeriodRange(period);
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  // Журнал датируется календарным днём ('YYYY-MM-DD'), а границы периода —
  // моментами. Сравниваем однородное с однородным: разворачиваем границы в дни
  // КАЛЕНДАРЯ ОРГАНИЗАЦИИ, иначе занятие последнего дня месяца выпадает из него.
  const startDay = orgDayKey(new Date(startIso));
  const endDay = orgDayKey(new Date(endIso));
  const wholeHistory = period === 'all';

  try {
    const [memberSnap, journalSnap, gradesSnap, schemaSnap] = await Promise.all([
      adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active').get(),
      adminDb.collection('journal').where('organizationId', '==', orgId).get(),
      adminDb.collection('grades').where('organizationId', '==', orgId).get(),
      adminDb.collection('gradeSchemas').where('organizationId', '==', orgId).get(),
    ]);

    // ── 1. Кого вообще показываем ──
    const students: RatingStudent[] = [];
    const inScope = new Set<string>();
    for (const doc of memberSnap.docs) {
      const m = doc.data() as Record<string, any>;
      if (!memberHoldsRole(m, ['student'])) continue;
      const branchIds: string[] = Array.isArray(m.branchIds) ? m.branchIds : [];
      if (!memberInBranchScope(branchIds, branchScope)) continue;
      // `userId || doc.id` — часть документов участников ключуется самим uid,
      // без поля userId (тот же приём в api-risk, api-org, monthly-billing).
      const uid: string = m.userId || doc.id;
      if (!uid || inScope.has(uid)) continue;
      inScope.add(uid);
      students.push({ uid, name: m.userName || 'Ученик', avatarUrl: '', branchIds });
    }

    if (students.length === 0) {
      return ok({ period: { period, startIso, endIso }, students: [], stats: [] });
    }

    // Аватары — одним batched getAll, а не запросом на студента.
    const profiles = await getDocsByIds('users', students.map(s => s.uid), ['displayName', 'avatarUrl', 'photoURL']);
    for (const s of students) {
      const p = profiles[s.uid];
      if (!p) continue;
      if (p.displayName) s.name = p.displayName;
      s.avatarUrl = p.avatarUrl || p.photoURL || '';
    }

    // ── 2. Шкалы курсов: нужны и для maxValue-фолбэка, и для перевода букв/зачётов ──
    const schemas = new Map<string, GradeSchema>();
    schemaSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (data.courseId) schemas.set(data.courseId, { id: d.id, ...data } as GradeSchema);
    });

    const buckets = new Map<string, RatingStat>();
    const bucket = (studentId: string, courseId: string): RatingStat => {
      const k = key(studentId, courseId);
      let b = buckets.get(k);
      if (!b) {
        b = { studentId, courseId, ...emptyCounts() };
        buckets.set(k, b);
      }
      return b;
    };

    // ── 3. Посещаемость ──
    for (const doc of journalSnap.docs) {
      const j = doc.data() as Record<string, any>;
      const studentId: string = j.studentId || '';
      const courseId: string = j.courseId || '';
      const date: string = typeof j.date === 'string' ? j.date : '';
      if (!studentId || !courseId || !date) continue;
      if (!inScope.has(studentId)) continue;
      if (!wholeHistory && (date < startDay || date > endDay)) continue;

      const b = bucket(studentId, courseId);
      const attendance: string = j.attendance || 'present';
      if (attendance === 'present') b.present++;
      else if (attendance === 'late') b.late++;
      else if (attendance === 'excused') b.excused++;
      else b.absent++;
      if (!b.lastActivity || date > b.lastActivity) b.lastActivity = date;
    }

    // ── 4. Оценки ──
    for (const doc of gradesSnap.docs) {
      const g = doc.data() as Record<string, any>;
      const studentId: string = g.studentId || '';
      const courseId: string = g.courseId || '';
      if (!studentId || !courseId) continue;
      if (!inScope.has(studentId)) continue;
      // Оценки за ДЗ — отдельная сущность: они идут в KPI преподавателя, а не в
      // успеваемость ученика. Смешать их со средним баллом значит поднять
      // рейтинг тому, кто аккуратно сдаёт домашку, но проваливает занятия.
      if (g.kind === 'homework') continue;

      const ms = gradeInstant(g);
      // Оценка без даты попадает только в «Всё время»: приписать её текущему
      // месяцу — значит выдумать период, которого никто не подтверждал.
      if (!wholeHistory && (ms === null || ms < startMs || ms > endMs)) continue;

      const schema = schemas.get(courseId) || null;
      // Буквы и зачёты идут в средний балл наравне с числами — у каждой отметки
      // есть числовой эквивалент по шкале курса. Что перевести не удалось,
      // молча выпадает, а не считается нулём.
      const value = entryNumericValue(g as any, schema);
      const max = maxOf(g, schema);
      if (value === null || max <= 0) continue;

      const b = bucket(studentId, courseId);
      b.gradeCount++;
      b.gradePctSum += (value / max) * 100;
      b.gradeValueSum += value;
      b.scaleMax = b.gradeCount === 1 ? max : (b.scaleMax === max ? max : null);

      const day = ms !== null ? orgDayKey(new Date(ms)) : null;
      if (day && (!b.lastActivity || day > b.lastActivity)) b.lastActivity = day;
    }

    return ok({
      period: { period, startIso, endIso },
      students,
      stats: Array.from(buckets.values()),
    });
  } catch (e: any) {
    return jsonResponse(500, { error: e?.message || 'Не удалось собрать рейтинг' });
  }
};
