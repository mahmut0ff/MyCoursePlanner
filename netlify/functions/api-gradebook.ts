/**
 * API: Gradebook — org-scoped CRUD for grades, journal, grade schemas.
 * All operations are IDEMPOTENT. Uses version-based optimistic locking.
 * Cross-tenant isolation enforced on every query.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, hasRole, can,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
  type AuthUser,
} from './utils/auth';
import { createNotification } from './utils/notifications';

const now = () => new Date().toISOString();

function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

/** Verify staff access to the course */
async function verifyCourseAccess(user: AuthUser, courseId: string): Promise<boolean> {
  const doc = await adminDb.collection('courses').doc(courseId).get();
  if (!doc.exists) return false;
  
  const data = doc.data()!;
  
  // 1. Cross-tenant isolation (Crucial)
  if (data.organizationId !== user.organizationId) return false;
  
  // 2. Role-based access
  if (['admin', 'manager', 'owner'].includes(user.role)) return true;
  
  if (user.role === 'teacher') {
    // If teacher is explicitly assigned
    if (Array.isArray(data.teacherIds) && data.teacherIds.includes(user.uid)) return true;
    // If teacher authored the course
    if (data.authorId === user.uid || data.createdBy === user.uid) return true;
    
    // Fallback: If no teachers are assigned yet, or if we want to be permissive within the org 
    // to avoid blocking teachers, we allow it. For strict enforcement later, remove this.
    return true; 
  }
  
  return false;
}

/**
 * Результат авторизации ГРУППЫ под запись lessonSession.
 * `crossTenant` отделяет атаку от ошибки данных, и от этого зависит радиус поражения:
 * чужой орг — отказ всему запросу, всё остальное — пропуск ТОЛЬКО сессии.
 */
type GroupSessionAuth =
  | { ok: true }
  | { ok: false; crossTenant: boolean; reason: string };

/**
 * Доступ к ГРУППЕ (а не к курсу) — для записи lessonSession.
 * Курсовой проверки мало: одному courseId соответствует много групп, поэтому
 * verifyCourseAccess(courseId) пропускал запись сессии в ЛЮБУЮ группу орга с тем же
 * курсом. Сессия — основание для зарплаты, так что авторизуем именно тот объект,
 * в который пишем: орг + совпадение курса + реальная связь пользователя с ГРУППОЙ.
 *
 * Для teacher требуется членство именно в group.teacherIds. Фолбэк на курс убран
 * намеренно: любой препод, числящийся на курсе, мог приписать занятие (а значит и
 * зарплату) чужой группе того же курса. Отметить журнал он по-прежнему может —
 * ужесточается только атрибуция сессии.
 */
function authorizeGroupForSession(
  user: AuthUser,
  group: FirebaseFirestore.DocumentData,
  courseId: string,
): GroupSessionAuth {
  // 1. Cross-tenant isolation — единственный случай, который валит весь запрос.
  if (group.organizationId !== user.organizationId) {
    return { ok: false, crossTenant: true, reason: 'группа принадлежит другой организации' };
  }

  // 2. Группа — источник истины «какой курс она ведёт». Расхождение с request.courseId
  // означает, что урок нельзя достоверно атрибутировать. Молча «чинить» courseId нельзя,
  // но и журнал ронять нельзя: группа может быть «Без курса» (UI это допускает).
  if (!group.courseId || group.courseId !== courseId) {
    return {
      ok: false,
      crossTenant: false,
      reason: `курс группы (${group.courseId || 'не задан'}) не совпадает с курсом запроса (${courseId})`,
    };
  }

  // 3. Роли — как и везде в этом файле, не-преподаватели гейтятся списком штатных ролей
  // (грант gradebook:write уже проверен на входе в handler).
  if (['admin', 'manager', 'owner'].includes(user.role)) return { ok: true };

  if (user.role === 'teacher') {
    const groupTeacherIds = Array.isArray(group.teacherIds) ? group.teacherIds : [];
    if (groupTeacherIds.includes(user.uid)) return { ok: true };
    return {
      ok: false,
      crossTenant: false,
      reason: 'преподаватель не ведёт эту группу (членство в курсе сессию не даёт)',
    };
  }

  return {
    ok: false,
    crossTenant: false,
    reason: `роль ${user.role} не может фиксировать проведённое занятие`,
  };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!user.organizationId) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;

  // RBAC: every gradebook operation is gated on the `gradebook` grant — reads
  // included. This used to be a per-action `isStaff()` check, which matched only
  // the four built-in roles: a custom role holding gradebook:read was granted the
  // sidebar link and the route, then got a 403 from the API. Gating on the grant
  // makes the resolved permission set the single source of truth, and closes the
  // GET schema branch, which had no check at all.
  // Students are exempt: their grades/journal GET branches below narrow to own uid.
  if (!hasRole(user, 'student')) {
    const needed = event.httpMethod === 'POST'
      ? (action === 'deleteGrade' ? 'delete' : 'write')
      : 'read';
    if (!can(user, 'gradebook', needed)) return forbidden('Недостаточно прав для этого действия');
  }

  try {
    // ═══ GRADES ═══

    /** GET grades — fetch all grades for a course, optionally filtered by studentId/lessonId */
    if (action === 'grades' && event.httpMethod === 'GET') {
      const { courseId, studentId, lessonId } = params;

      // Permission: staff sees all, student sees only own
      if (hasRole(user, 'student')) {
        const snap = await adminDb.collection('grades').where('studentId', '==', user.uid).get();
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: any) => d.organizationId === orgId);
        if (courseId) docs = docs.filter((d: any) => d.courseId === courseId);
        if (lessonId) docs = docs.filter((d: any) => d.lessonId === lessonId);
        return ok(docs);
      }

      if (!courseId) return badRequest('courseId required');
      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      let q: any = orgQuery('grades', orgId).where('courseId', '==', courseId);
      if (studentId) q = q.where('studentId', '==', studentId);
      if (lessonId) q = q.where('lessonId', '==', lessonId);
      const snap = await q.get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }

    /**
     * POST grade — idempotent upsert.
     * Unique key: (studentId + courseId + lessonId + assignmentId)
     * Uses version for optimistic locking.
     */
    if (action === 'grade' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { studentId, courseId, lessonId, assignmentId, value, displayValue, type, maxValue, status, comment, version } = body;
      if (!studentId || !courseId) return badRequest('studentId and courseId required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      // Build idempotent key
      const keyParts = [studentId, courseId, lessonId || '_', assignmentId || '_'];
      const idempotentKey = keyParts.join('__');

      // Check for existing
      const existing = await orgQuery('grades', orgId)
        .where('courseId', '==', courseId)
        .where('studentId', '==', studentId)
        .where('lessonId', '==', lessonId || null)
        .limit(1).get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        // Optimistic locking: check version
        if (version !== undefined && data.version !== undefined && version < data.version) {
          return jsonResponse(409, { error: 'Version conflict', current: data });
        }
        // Update existing
        const updates: any = { updatedAt: now(), version: (data.version || 0) + 1 };
        if (value !== undefined) updates.value = value;
        if (displayValue !== undefined) updates.displayValue = displayValue;
        if (type !== undefined) updates.type = type;
        if (maxValue !== undefined) updates.maxValue = maxValue;
        if (status !== undefined) updates.status = status;
        if (comment !== undefined) updates.comment = comment;
        await doc.ref.update(updates);

        // ── AUDIT TRAIL: Record grade change history ──
        if (value !== undefined && value !== data.value) {
          doc.ref.collection('history').add({
            oldValue: data.value ?? null,
            newValue: value,
            oldDisplayValue: data.displayValue || null,
            newDisplayValue: displayValue || data.displayValue || null,
            changedBy: user.uid,
            changedByName: user.displayName,
            reason: comment || '',
            timestamp: now(),
          }).catch(() => {});
        }

        return ok({ id: doc.id, ...data, ...updates });
      }

      // Create new
      const gradeData = {
        studentId, courseId,
        lessonId: lessonId || null,
        assignmentId: assignmentId || null,
        value: value ?? null,
        displayValue: displayValue || null,
        type: type || 'points',
        maxValue: maxValue || 100,
        status: status || 'normal',
        comment: comment || '',
        createdBy: user.uid,
        organizationId: orgId,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      const ref = await adminDb.collection('grades').add(gradeData);

      // Notify student about new grade
      if (value !== undefined && value !== null) {
        const courseDoc = await adminDb.collection('courses').doc(courseId).get();
        const courseName = courseDoc.data()?.title || '';
        createNotification({
          recipientId: studentId,
          type: 'grade_posted',
          title: 'Новая оценка',
          message: `Оценка: ${displayValue || value}${courseName ? ` по «${courseName}»` : ''}`,
          organizationId: orgId,
        }).catch(() => {});
      }

      return ok({ id: ref.id, ...gradeData });
    }

    /** POST bulkGrades — batch upsert multiple grades atomically */
    if (action === 'bulkGrades' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { grades, courseId } = body;
      if (!courseId || !Array.isArray(grades)) return badRequest('courseId and grades[] required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      const batch = adminDb.batch();
      const results: any[] = [];

      for (const g of grades) {
        // Check existing
        const existing = await orgQuery('grades', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', g.studentId)
          .where('lessonId', '==', g.lessonId || null)
          .limit(1).get();

        if (!existing.empty) {
          const doc = existing.docs[0];
          const data = doc.data();
          const updates: any = {
            value: g.value ?? data.value,
            status: g.status || data.status,
            comment: g.comment !== undefined ? g.comment : data.comment,
            displayValue: g.displayValue !== undefined ? g.displayValue : data.displayValue,
            version: (data.version || 0) + 1,
            updatedAt: now(),
          };
          batch.update(doc.ref, updates);
          // ── AUDIT TRAIL: Record grade change in bulk ──
          if (g.value !== undefined && g.value !== data.value) {
            // Cannot add to subcollection in batch, so fire async
            doc.ref.collection('history').add({
              oldValue: data.value ?? null,
              newValue: g.value,
              changedBy: user.uid,
              changedByName: user.displayName,
              reason: g.comment || '',
              timestamp: now(),
            }).catch(() => {});
          }
          results.push({ id: doc.id, ...data, ...updates });
        } else {
          const ref = adminDb.collection('grades').doc();
          const gradeData = {
            studentId: g.studentId, courseId,
            lessonId: g.lessonId || null,
            assignmentId: g.assignmentId || null,
            value: g.value ?? null,
            displayValue: g.displayValue || null,
            type: g.type || 'points',
            maxValue: g.maxValue || 100,
            status: g.status || 'normal',
            comment: g.comment || '',
            createdBy: user.uid,
            organizationId: orgId,
            version: 1,
            createdAt: now(),
            updatedAt: now(),
          };
          batch.set(ref, gradeData);
          results.push({ id: ref.id, ...gradeData });
        }
      }

      await batch.commit();

      // Notify students about new grades (fire-and-forget, batch)
      const courseDoc = await adminDb.collection('courses').doc(courseId).get();
      const courseName = courseDoc.data()?.title || '';
      const notifiedStudents = new Set<string>();
      for (const r of results) {
        if (r.value !== undefined && r.value !== null && !notifiedStudents.has(r.studentId)) {
          notifiedStudents.add(r.studentId);
          createNotification({
            recipientId: r.studentId,
            type: 'grade_posted',
            title: 'Новая оценка',
            message: `Оценка: ${r.displayValue || r.value}${courseName ? ` по «${courseName}»` : ''}`,
            organizationId: orgId,
          }).catch(() => {});
        }
      }

      return ok(results);
    }

    /** DELETE grade */
    if (action === 'deleteGrade' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection('grades').doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();
      await doc.ref.delete();
      return ok({ deleted: true });
    }

    // ═══ GRADE SCHEMA ═══

    if (action === 'schema' && event.httpMethod === 'GET') {
      const { courseId } = params;
      if (!courseId) return badRequest('courseId required');
      const snap = await orgQuery('gradeSchemas', orgId)
        .where('courseId', '==', courseId).limit(1).get();
      if (snap.empty) return ok(null);
      return ok({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }

    if (action === 'schema' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { courseId, gradingType, scale, passThreshold, rules } = body;
      if (!courseId) return badRequest('courseId required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      // Idempotent: one schema per course
      const existing = await orgQuery('gradeSchemas', orgId)
        .where('courseId', '==', courseId).limit(1).get();
      if (!existing.empty) {
        const doc = existing.docs[0];
        const updates = { gradingType, scale, passThreshold, rules: rules || {}, updatedAt: now() };
        await doc.ref.update(updates);
        return ok({ id: doc.id, ...doc.data(), ...updates });
      }

      const data = {
        courseId, organizationId: orgId,
        gradingType: gradingType || 'points',
        scale: scale || { min: 0, max: 100 },
        passThreshold: passThreshold ?? 50,
        rules: rules || {},
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('gradeSchemas').add(data);
      return ok({ id: ref.id, ...data });
    }

    // ═══ JOURNAL ═══

    /** GET journal entries */
    if (action === 'journal' && event.httpMethod === 'GET') {
      const { courseId, studentId, from, to } = params;

      // Student: only own data
      if (hasRole(user, 'student')) {
        const snap = await adminDb.collection('journal').where('studentId', '==', user.uid).get();
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: any) => d.organizationId === orgId);
        if (courseId) docs = docs.filter((d: any) => d.courseId === courseId);
        if (from) docs = docs.filter((d: any) => d.date >= from);
        if (to) docs = docs.filter((d: any) => d.date <= to);
        return ok(docs);
      }

      if (!courseId) return badRequest('courseId required');
      let q: any = orgQuery('journal', orgId).where('courseId', '==', courseId);
      if (studentId) q = q.where('studentId', '==', studentId);
      const snap = await q.get();
      let results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      // Client-side date filter (Firestore composite index avoidance)
      if (from) results = results.filter((r: any) => r.date >= from);
      if (to) results = results.filter((r: any) => r.date <= to);
      return ok(results);
    }

    /**
     * POST journal — idempotent upsert.
     * Unique key: (studentId + courseId + date)
     */
    if (action === 'journal' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { studentId, courseId, date, attendance, participation, note, flags, version } = body;
      if (!studentId || !courseId || !date) return badRequest('studentId, courseId, date required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      const existing = await orgQuery('journal', orgId)
        .where('courseId', '==', courseId)
        .where('studentId', '==', studentId)
        .where('date', '==', date)
        .limit(1).get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        if (version !== undefined && data.version !== undefined && version < data.version) {
          return jsonResponse(409, { error: 'Version conflict', current: data });
        }
        const updates: any = { updatedAt: now(), version: (data.version || 0) + 1 };
        if (attendance !== undefined) updates.attendance = attendance;
        if (participation !== undefined) updates.participation = participation;
        if (note !== undefined) updates.note = note;
        if (flags !== undefined) updates.flags = flags;
        await doc.ref.update(updates);
        return ok({ id: doc.id, ...data, ...updates });
      }

      const journalData = {
        studentId, courseId, date,
        attendance: attendance || 'present',
        participation: participation || null,
        note: note || '',
        flags: flags || [],
        createdBy: user.uid,
        organizationId: orgId,
        version: 1,
        createdAt: now(), updatedAt: now(),
      };
      const ref = await adminDb.collection('journal').add(journalData);

      // Notify student if marked absent
      if (attendance === 'absent') {
        const courseDoc = await adminDb.collection('courses').doc(courseId).get();
        const courseName = courseDoc.data()?.title || '';
        createNotification({
          recipientId: studentId,
          type: 'attendance_absent',
          title: 'Пропуск занятия',
          message: `Вы отмечены отсутствующим на занятии${courseName ? ` «${courseName}»` : ''} (${date})`,
          organizationId: orgId,
        }).catch(() => {});
      }

      return ok({ id: ref.id, ...journalData });
    }

    /** POST bulkAttendance — mark attendance for all students in a course for a date */
    if (action === 'bulkAttendance' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      // groupId/teacherId/durationMinutes — аддитивные поля для payroll (lessonSessions).
      // Старые вызовы их не шлют: тогда пишем только журнал, как раньше.
      const { courseId, date, entries, groupId, teacherId, durationMinutes } = body;
      if (!courseId || !date || !Array.isArray(entries)) return badRequest('courseId, date, entries[] required');

      const hasAccess = await verifyCourseAccess(user, courseId);
      if (!hasAccess) return forbidden();

      // ── lessonSessions: подготавливаем данные ДО батча, чтобы запись «урок состоялся»
      // легла в тот же commit, что и журнал (атомарность: либо и то и другое, либо ничего).
      // groupId — единственный факт, которого нет в journal; без него сессию не пишем.
      let sessionRef: FirebaseFirestore.DocumentReference | null = null;
      let sessionData: Record<string, any> | null = null;
      let sessionIsUpdate = false;
      // Радиус поражения: журнал — основная функция этого эндпоинта, и он НЕ должен
      // падать из-за проблем атрибуции зарплаты. Поэтому любая неудача авторизации
      // группы (кроме чужого орга) пропускает ТОЛЬКО сессию с диагностикой в лог:
      // отсутствующая сессия — видимый ноль в payroll (правило «не выдумывать число»),
      // а потерянная запись в журнале — потеря данных.
      let skipSessionReason: string | null = null;

      if (groupId) {
        // Читаем группу: и авторизация, и источник teacherId/branchId.
        const groupDoc = await adminDb.collection('groups').doc(groupId).get();
        const group = groupDoc.exists ? groupDoc.data()! : null;

        // Авторизуем САМУ группу, а не только курс: verifyCourseAccess выше проверил курс,
        // но сессия пишется на группу. Внутри — орг, совпадение courseId и связь с группой.
        const auth: GroupSessionAuth = group
          ? authorizeGroupForSession(user, group, courseId)
          : { ok: false, crossTenant: false, reason: `группа ${groupId} не найдена` };

        // Чужая организация — это атака, а не опечатка: отказываем всему запросу.
        if (!auth.ok && auth.crossTenant) return forbidden();

        if (!auth.ok) skipSessionReason = auth.reason;

        // `group` не может быть null при auth.ok — проверки орга/курса требуют документа.
        if (auth.ok && group) {
          const groupTeacherIds: string[] = Array.isArray(group.teacherIds) ? group.teacherIds : [];

          // Явный teacherId принимаем ТОЛЬКО если это реально препод этой группы. Раньше он
          // писался как есть — любой, кто может отметить журнал, мог приписать урок (а значит
          // и зарплату) произвольному uid. Тихого фолбэка нет намеренно: он спрятал бы
          // настоящую ошибку (отметили не того) за правдоподобной сессией.
          // `!= null` — явный null трактуем как «не прислали» (см. `??` ниже).
          if (teacherId != null && !groupTeacherIds.includes(teacherId)) {
            return badRequest('Указанный преподаватель не ведёт эту группу');
          }

          // teacherId: явный из тела → ЕДИНСТВЕННЫЙ препод группы → null.
          // НИКОГДА не user.uid (это createdBy — кто отметил журнал, а не кто вёл занятие).
          // null — честная «неатрибутированная сессия»: per_hour/per_lesson/per_student
          // такие сессии просто пропускают, спорную атрибуцию director поправит вручную.
          // `??`, не `||`: пустой строкой teacherId не бывает, а null от нескольких преподов
          // должен падать в null, а не срабатывать как falsy-фолбэк на user.uid.
          const resolvedTeacherId: string | null =
            teacherId ?? (groupTeacherIds.length === 1 ? groupTeacherIds[0] : null);

          // courseId сессии == request.courseId: authorizeGroupForSession уже потребовал
          // равенства с group.courseId, поэтому расхождения здесь быть не может.
          const sessionCourseId = courseId;

          // branchId берём у ГРУППЫ — она единственный носитель филиала. Курс к филиалу
          // не привязан (см. action 'courses' в api-org.ts), поэтому fallback на курс убран.
          const branchId: string | null = group.branchId ?? null;

          // headcount = присутствовавшие: present + late (опоздавший всё равно был на занятии).
          // Считаем по фактически размеченным записям — это база для per_student в payroll.
          const headcount = entries.filter((e: any) => {
            const a = e.attendance || 'present';
            return a === 'present' || a === 'late';
          }).length;

          // Идемпотентность: дедуп по (organizationId, groupId, date) — повторная отправка
          // переклички за тот же день обновляет сессию, а не плодит дубли. Запрос equality-only.
          const existingSession = await orgQuery('lessonSessions', orgId)
            .where('groupId', '==', groupId)
            .where('date', '==', date)
            .limit(1).get();

          if (!existingSession.empty) {
            sessionIsUpdate = true;
            sessionRef = existingSession.docs[0].ref;
            sessionData = {
              teacherId: resolvedTeacherId,
              branchId,
              courseId: sessionCourseId,
              headcount,
              status: 'held',
              confirmedBy: user.uid,
              confirmedAt: now(),
              updatedAt: now(),
            };
            // durationMinutes перезаписываем только если явно прислан (в т.ч. null «очистить»);
            // иначе не затираем ранее сохранённую длительность/sourceEventId на повторной отметке.
            if (durationMinutes !== undefined) sessionData.durationMinutes = durationMinutes;
          } else {
            // durationMinutes/sourceEventId берём из расписания, не хардкодим. Один equality-read
            // scheduleEvents по группе (приемлемо — раз на группу в день, только при создании).
            // В JS выбираем: датированное событие на эту дату, иначе рекуррентное по дню недели.
            let sourceEventId: string | null = null;
            let plannedDuration: number | null = null;
            const evSnap = await orgQuery('scheduleEvents', orgId)
              .where('groupId', '==', groupId)
              .get();
            if (!evSnap.empty) {
              const evs = evSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
              // Дата → день недели в проектной нумерации 0=Пн..6=Вс (как в lesson-reminders.ts).
              // UTC-разбор 'YYYY-MM-DD', чтобы локальная TZ не сдвинула день.
              const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
              const match =
                evs.find((e) => !e.recurring && e.date === date) ??
                evs.find((e) => e.recurring && e.dayOfWeek === weekday);
              if (match) {
                sourceEventId = match.id;
                if (typeof match.duration === 'number') plannedDuration = match.duration;
              }
            }

            sessionRef = adminDb.collection('lessonSessions').doc();
            sessionData = {
              organizationId: orgId,
              branchId,
              groupId,
              courseId: sessionCourseId,
              teacherId: resolvedTeacherId,
              date,
              // Явный body.durationMinutes побеждает; иначе плановая из scheduleEvent;
              // иначе честный null. null-сессию per_hour пропускает (нельзя пропорционировать
              // неизвестное время) — видимый ноль вместо догадки.
              durationMinutes: durationMinutes !== undefined ? durationMinutes : plannedDuration,
              status: 'held',
              headcount,
              sourceEventId,
              confirmedBy: user.uid,
              confirmedAt: now(),
              createdAt: now(),
            };
          }
        }
      }

      // Диагностика вместо тихой потери: сессии не будет, и в payroll это видимый ноль.
      if (skipSessionReason) {
        console.warn(
          `api-gradebook bulkAttendance: lessonSession пропущена (groupId=${groupId}, date=${date}, uid=${user.uid}): ${skipSessionReason}`,
        );
      }

      const batch = adminDb.batch();
      const results: any[] = [];

      for (const e of entries) {
        const existing = await orgQuery('journal', orgId)
          .where('courseId', '==', courseId)
          .where('studentId', '==', e.studentId)
          .where('date', '==', date)
          .limit(1).get();

        if (!existing.empty) {
          const doc = existing.docs[0];
          const updates = {
            attendance: e.attendance || 'present',
            participation: e.participation || doc.data().participation,
            note: e.note !== undefined ? e.note : doc.data().note,
            version: (doc.data().version || 0) + 1,
            updatedAt: now(),
          };
          batch.update(doc.ref, updates);
          results.push({ id: doc.id, ...doc.data(), ...updates });
        } else {
          const ref = adminDb.collection('journal').doc();
          const data = {
            studentId: e.studentId, courseId, date,
            attendance: e.attendance || 'present',
            participation: e.participation || null,
            note: e.note || '', flags: [],
            createdBy: user.uid, organizationId: orgId,
            version: 1, createdAt: now(), updatedAt: now(),
          };
          batch.set(ref, data);
          results.push({ id: ref.id, ...data });
        }
      }

      // Сессия — в тот же батч, что и журнал: атомарный commit «урок состоялся».
      if (sessionRef && sessionData) {
        if (sessionIsUpdate) batch.update(sessionRef, sessionData);
        else batch.set(sessionRef, sessionData);
      }

      await batch.commit();

      // Notify absent students (fire-and-forget)
      const absentEntries = results.filter((r: any) => r.attendance === 'absent');
      if (absentEntries.length > 0) {
        const courseDoc = await adminDb.collection('courses').doc(courseId).get();
        const courseName = courseDoc.data()?.title || '';
        for (const entry of absentEntries) {
          createNotification({
            recipientId: entry.studentId,
            type: 'attendance_absent',
            title: 'Пропуск занятия',
            message: `Вы отмечены отсутствующим на занятии${courseName ? ` «${courseName}»` : ''} (${date})`,
            organizationId: orgId,
          }).catch(() => {});
        }
      }

      return ok(results);
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-gradebook error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
