/**
 * Журнал активности преподавателей — серверная запись событий.
 *
 * Каждое трекаемое действие (оценка, посещаемость, проверка ДЗ, создание
 * экзамена/квиза/урока, вход) пишет сюда лёгкое событие. Пишем на СЕРВЕРЕ, из тех
 * же функций, где происходит само действие: актёр берётся из проверенного токена
 * (verifyAuth), поэтому KPI нельзя накрутить с клиента — авторство здесь
 * неподделываемо, как senderSide в поддержке.
 *
 * Запись — best-effort: любая ошибка глотается (console.error) и НИКОГДА не валит
 * основную мутацию — сохранение оценки важнее строчки статистики.
 *
 * Индексов не требует: коллекция читается по равенству `orgMonth` (или
 * `organizationId` для «за всё время»), окно/фильтры — в памяти. Ключ `orgMonth`
 * = `${organizationId}_${YYYY-MM}` ограничивает объём чтения одним месяцем, не
 * заводя составной индекс. См. api-teacher-activity.ts.
 */
import { adminDb } from './firebase-admin';
import { orgDayKey } from './payment-plans';
import type { ActivityType } from './teacher-kpi';

export const TEACHER_ACTIVITY_COLLECTION = 'teacherActivity';

export interface RecordActivityInput {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  actorName?: string | null;
  actorRole?: string | null;
  type: ActivityType;
  branchId?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  /** Вес пакетного действия: например, отмечено 12 учеников за раз. По умолчанию 1. */
  count?: number | null;
  meta?: Record<string, unknown> | null;
}

function orgMonthKey(organizationId: string, dayKey: string): string {
  return `${organizationId}_${dayKey.slice(0, 7)}`;
}

/**
 * Записать одно событие активности. Fire-and-forget по духу, но вызывать с
 * `await`: в serverless незавершённый промис может не долиться до заморозки
 * инстанса. Внутренний try/catch гарантирует, что этот await не бросит.
 */
export async function recordTeacherActivity(input: RecordActivityInput): Promise<void> {
  try {
    const org = input.organizationId;
    const actor = input.actorId;
    if (!org || !actor) return; // без организации/актёра атрибутировать нечего
    const now = new Date();
    const dayKey = orgDayKey(now);
    await adminDb.collection(TEACHER_ACTIVITY_COLLECTION).add({
      organizationId: org,
      actorId: actor,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
      type: input.type,
      branchId: input.branchId ?? null,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      count: typeof input.count === 'number' && input.count > 0 ? Math.round(input.count) : 1,
      meta: input.meta ?? null,
      dayKey,
      orgMonth: orgMonthKey(org, dayKey),
      createdAt: now.toISOString(),
    });
  } catch (e) {
    console.error('recordTeacherActivity failed', e);
  }
}

/**
 * Вход в систему — дедуплицируем до одного документа на преподавателя в день
 * (детерминированный id `login_{uid}_{YYYY-MM-DD}`), иначе каждое обновление
 * страницы плодило бы событие. `count` — число входов за день, `createdAt` —
 * первый вход, `lastLoginAt` — последний. Гонка «двойной вход в одну
 * миллисекунду» безобидна (счётчик слегка занизится), поэтому обходимся
 * read-modify-write без транзакции.
 */
export async function recordLoginActivity(input: Omit<RecordActivityInput, 'type'>): Promise<void> {
  try {
    const org = input.organizationId;
    const actor = input.actorId;
    if (!org || !actor) return;
    const now = new Date();
    const iso = now.toISOString();
    const dayKey = orgDayKey(now);
    const ref = adminDb.collection(TEACHER_ACTIVITY_COLLECTION).doc(`login_${actor}_${dayKey}`);
    const snap = await ref.get();
    const prev = snap.exists ? (snap.data() as Record<string, unknown> | undefined) : undefined;
    await ref.set({
      organizationId: org,
      actorId: actor,
      actorName: input.actorName ?? (prev?.actorName as string | undefined) ?? null,
      actorRole: input.actorRole ?? (prev?.actorRole as string | undefined) ?? null,
      type: 'login',
      branchId: input.branchId ?? (prev?.branchId as string | undefined) ?? null,
      entityId: null,
      entityLabel: null,
      count: (typeof prev?.count === 'number' ? prev.count : 0) + 1,
      meta: null,
      dayKey,
      orgMonth: orgMonthKey(org, dayKey),
      createdAt: (prev?.createdAt as string | undefined) || iso,
      lastLoginAt: iso,
    });
  } catch (e) {
    console.error('recordLoginActivity failed', e);
  }
}
