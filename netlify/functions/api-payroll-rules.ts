/**
 * API: Payroll Compensation Rules — карточки ставок учителей (`compensationRules`).
 *
 * Правило append-only и датируется периодом действия. Ключевой инвариант:
 * ОДНО активное правило на учителя на период. Изменение ставки не правит старое
 * правило, а закрывает его `effectiveTo` и вставляет новую версию с `supersedesId`
 * — иначе расчётный лист за закрытый месяц начинает пересказывать историю задним
 * числом («почему изменилась оплата» перестаёт иметь ответ).
 *
 * Все запросы здесь — ТОЛЬКО на равенство: composite-индексы в этом проекте не
 * деплоятся (см. monthly-billing.ts). Сортировка и пересечение периодов — в JS.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { batchGetUserNames } from './utils/finance-names';
import {
  verifyAuth, can, getOrgFilter, resolveBranchFilter, recordInBranchScope, requireBranchScope,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';

const COLLECTION = 'compensationRules';
const LINES_COLLECTION = 'payrollLines';
const PERIODS_COLLECTION = 'payrollPeriods';

/** Зеркало union-типа CompensationRule['status'] из src/types/index.ts. Держите синхронно. */
const RULE_STATUSES = ['active', 'archived'];

/** Зеркало PayComponent.kind из src/types/index.ts. Держите синхронно. */
const COMPONENT_KINDS = ['salary', 'percent_revenue', 'per_lesson', 'per_hour', 'per_student'];

/**
 * 'YYYY-MM' с проверкой номера месяца. Строже, чем /^\d{4}-\d{2}$/, намеренно:
 * '2026-13' прошёл бы слабую проверку, а потом навсегда выпал бы из сравнений
 * с реальными периодами (мы сравниваем периоды лексикографически, и '2026-13'
 * больше любого настоящего месяца этого года). Формат — семантика
 * billingPeriodKey, чтобы зарплата и биллинг понимали «2026-07» одинаково.
 */
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Заглушка «бессрочно» для сравнения периодов. Лексикографически больше любого месяца. */
const OPEN_END = '9999-12';

/** Состояния периода, после которых правило уже участвовало в замороженной ведомости. */
const FROZEN_STATES = ['approved', 'paid'];

/** Сигнальная ошибка из runTransaction → 409 (внутри транзакции нельзя вернуть Response). */
class RuleConflictError extends Error {}

/** Месяц перед указанным: '2026-01' → '2025-12'. Без Date — формат тот же, что у billingPeriodKey. */
function prevPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Пересекаются ли два закрытых-справа интервала месяцев (обе границы включительно). */
function periodsOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  return aFrom <= (bTo || OPEN_END) && bFrom <= (aTo || OPEN_END);
}

/** Целые минорные единицы: дробь здесь — это молча потерянные копейки в расчёте. */
function isPositiveMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Область действия компонента. Явный аллоулист: в снапшот строки ведомости
 * scope уезжает целиком и замораживается, поэтому мусорные поля оттуда уже
 * не вычистить.
 */
function normalizeScope(raw: any): { scope?: { courseIds?: string[]; groupIds?: string[] }; error?: string } {
  if (raw === undefined || raw === null) return { scope: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'scope должен быть объектом' };
  const scope: { courseIds?: string[]; groupIds?: string[] } = {};
  for (const key of ['courseIds', 'groupIds'] as const) {
    const list = raw[key];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list) || list.some((v: any) => typeof v !== 'string' || !v)) {
      return { error: `scope.${key} должен быть массивом идентификаторов` };
    }
    scope[key] = Array.from(new Set(list as string[]));
  }
  return { scope };
}

/**
 * Валидация и нормализация компонентов ставки. Возвращает НОВЫЕ объекты, а не
 * присланные: тело никогда не спредится в документ, иначе клиент протолкнул бы
 * в замороженный снапшот произвольные поля.
 */
function normalizeComponents(raw: any): { components?: any[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Правило должно содержать хотя бы один компонент' };
  }
  const components: any[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const at = `Компонент №${i + 1}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { error: `${at}: ожидается объект` };
    if (!COMPONENT_KINDS.includes(c.kind)) {
      return { error: `${at}: недопустимый тип «${c.kind}». Допустимые: ${COMPONENT_KINDS.join(', ')}.` };
    }

    if (c.kind === 'salary') {
      if (!isPositiveMinor(c.amountMinor)) {
        return { error: `${at} (оклад): amountMinor должен быть целым положительным числом в минорных единицах` };
      }
      components.push({ kind: 'salary', amountMinor: c.amountMinor });
      continue;
    }

    const { scope, error: scopeError } = normalizeScope(c.scope);
    if (scopeError) return { error: `${at}: ${scopeError}` };

    if (c.kind === 'percent_revenue') {
      // Базисные пункты: 2000 = 20%. Целое — потому что процент нигде не
      // умножается на float, доля считается как minor * bp / 10000.
      if (typeof c.percentBp !== 'number' || !Number.isSafeInteger(c.percentBp) || c.percentBp < 1 || c.percentBp > 10000) {
        return { error: `${at} (процент): percentBp должен быть целым числом от 1 до 10000 (базисные пункты, 2000 = 20%)` };
      }
      // База сейчас единственная — СОБРАННАЯ касса. Оставлять поле свободным
      // нельзя: движок читает его буквально и на неизвестной базе посчитал бы ноль.
      if (c.base !== 'collected') {
        return { error: `${at} (процент): base должен быть 'collected' — процент считается от СОБРАННЫХ денег` };
      }
      components.push({ kind: 'percent_revenue', percentBp: c.percentBp, base: 'collected', scope });
      continue;
    }

    // per_lesson / per_hour / per_student
    if (!isPositiveMinor(c.amountMinor)) {
      return { error: `${at}: amountMinor должен быть целым положительным числом в минорных единицах` };
    }
    components.push({ kind: c.kind, amountMinor: c.amountMinor, scope });
  }
  return { components };
}

/** Валидация пары дат действия правила. */
function validateEffective(effectiveFrom: any, effectiveTo: any): string | null {
  if (typeof effectiveFrom !== 'string' || !PERIOD_RE.test(effectiveFrom)) {
    return 'effectiveFrom должен быть месяцем в формате ГГГГ-ММ';
  }
  if (effectiveTo !== null && effectiveTo !== undefined) {
    if (typeof effectiveTo !== 'string' || !PERIOD_RE.test(effectiveTo)) {
      return 'effectiveTo должен быть месяцем в формате ГГГГ-ММ либо null';
    }
    if (effectiveTo < effectiveFrom) {
      return 'effectiveTo не может быть раньше effectiveFrom';
    }
  }
  return null;
}

/**
 * Использовалось ли правило в уже замороженной ведомости.
 *
 * Два equality-клауза по payrollLines, затем периоды читаются по id (getAll, не
 * запрос) — ни одного индекса. organizationId в запросе не опционален: без него
 * строка чужого тенанта заблокировала бы легитимную правку и заодно раскрыла бы
 * факт её существования (тот же урок, что в api-finance-plans DELETE).
 */
async function inspectRuleUsage(orgFilter: string, ruleId: string): Promise<{ lineCount: number; frozenStates: string[] }> {
  const linesSnap = await adminDb.collection(LINES_COLLECTION)
    .where('ruleId', '==', ruleId)
    .where('organizationId', '==', orgFilter)
    .get();

  if (linesSnap.size === 0) return { lineCount: 0, frozenStates: [] };

  const periodIds = Array.from(new Set(
    linesSnap.docs.map((d: any) => d.data()?.periodId).filter(Boolean),
  ));
  const periods = await getDocsByIds(PERIODS_COLLECTION, periodIds, ['state', 'organizationId']);

  const frozenStates: string[] = [];
  for (const p of Object.values(periods) as any[]) {
    if (p.organizationId !== orgFilter) continue;
    if (FROZEN_STATES.includes(p.state)) frozenStates.push(p.state);
  }
  return { lineCount: linesSnap.size, frozenStates };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // ── GET: список ставок организации ─────────────────────────────────────
    if (event.httpMethod === 'GET') {
      if (!can(user, 'payroll', 'read')) return forbidden('Нет доступа к модулю зарплат');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);
      // Только равенства — несколько таких клауз индекса не требуют.
      if (params.teacherId) query = query.where('teacherId', '==', params.teacherId);
      if (params.status) {
        if (!RULE_STATUSES.includes(params.status)) {
          return badRequest(`Недопустимый статус ставки. Допустимые: ${RULE_STATUSES.join(', ')}.`);
        }
        query = query.where('status', '==', params.status);
      }

      const snap = await query.get();
      let results = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));

      results = results.filter((r: any) => recordInBranchScope(r.branchId, branchFilter));

      // Сортировка в памяти: orderBy в запросе потребовал бы composite-индекс.
      // Свежие периоды действия сверху, при равенстве — новые записи первыми.
      results.sort((a: any, b: any) =>
        (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '')
        || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const teacherNames = await batchGetUserNames(
        results.map((r: any) => r.teacherId).filter(Boolean),
      );
      for (const r of results) {
        if (r.teacherId) r.teacherName = teacherNames.get(r.teacherId) || '';
      }

      // Голый массив — договорённость дома (как api-finance-plans GET).
      return ok(results);
    }

    // ── POST: создать ставку ───────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      if (!body.teacherId || typeof body.teacherId !== 'string') return badRequest('teacherId обязателен');

      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (!label) return badRequest('Название ставки обязательно — оно печатается на расчётном листе');

      const effectiveError = validateEffective(body.effectiveFrom, body.effectiveTo);
      if (effectiveError) return badRequest(effectiveError);
      const effectiveFrom: string = body.effectiveFrom;
      const effectiveTo: string | null = body.effectiveTo ?? null;

      const { components, error: componentsError } = normalizeComponents(body.components);
      if (componentsError) return badRequest(componentsError);

      // Учитель должен быть членом ЭТОЙ организации. Читаем orgMembers по id
      // (getDoc, не запрос): это работает и для offlineTeacher — синтетического
      // id без Firebase Auth, — поэтому проверять наличие Auth-аккаунта нельзя.
      const memberDoc = await adminDb.collection('orgMembers').doc(orgFilter)
        .collection('members').doc(body.teacherId).get();
      if (!memberDoc.exists) return badRequest('Преподаватель не найден в этой организации');

      // Резолвим филиал тем же фолбэком, что и финансы, и проверяем ТО, ЧТО
      // РЕАЛЬНО ЗАПИШЕМ, — иначе сотрудник, ограниченный филиалом А, завёл бы
      // ставку в филиале Б, просто прислав его id в теле.
      const branchId = body.branchId ?? user.primaryBranchId ?? null;
      const branchError = requireBranchScope(user, branchId);
      if (branchError) return branchError;

      // ── Инвариант «одно активное правило на учителя на период» ───────────
      // Два equality-клауза, пересечение периодов считаем в JS.
      const activeSnap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', orgFilter)
        .where('teacherId', '==', body.teacherId)
        .where('status', '==', 'active')
        .get();

      const overlapping = activeSnap.docs
        .map((d: any) => ({ id: d.id, ...d.data() as any }))
        .filter((r: any) => periodsOverlap(r.effectiveFrom, r.effectiveTo ?? null, effectiveFrom, effectiveTo));

      // Настоящий конфликт (не преемственность): старое правило начинается не
      // РАНЬШЕ нового, значит закрыть его предыдущим месяцем нельзя — получится
      // правило с пустым или отрицательным сроком действия. Это ошибка ввода
      // (директор перепутал даты), а не смена ставки.
      const genuineConflict = overlapping.find((r: any) => !(r.effectiveFrom < effectiveFrom));
      if (genuineConflict) {
        return jsonResponse(409, {
          error: `У преподавателя уже есть активная ставка «${genuineConflict.label || genuineConflict.id}» `
            + `с ${genuineConflict.effectiveFrom} по ${genuineConflict.effectiveTo || 'бессрочно'}, и она пересекается с новой. `
            + `Новая ставка должна начинаться позже действующей — тогда действующая закроется автоматически.`,
          conflictRuleId: genuineConflict.id,
        });
      }

      const closeAt = prevPeriod(effectiveFrom);
      const now = new Date().toISOString();
      const newRef = adminDb.collection(COLLECTION).doc();

      // Явный аллоулист. organizationId/createdBy/status/supersedesId — служебные,
      // их ставит сервер: клиент не должен уметь создать чужую или сразу
      // «архивную» ставку, ни подделать цепочку аудита.
      const data: Record<string, any> = {
        teacherId: body.teacherId,
        branchId,
        label,
        status: 'active',
        components,
        effectiveFrom,
        effectiveTo,
        // Цепочка «почему изменилась оплата»: на кого встали. Если закрываем
        // несколько — ссылаемся на самое позднее из них.
        supersedesId: overlapping.length
          ? overlapping.slice().sort((a: any, b: any) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0].id
          : null,
        organizationId: orgFilter,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      };

      // Закрытие старых правил и вставка нового — одна транзакция: между двумя
      // отдельными записями существует момент, когда у учителя либо две активные
      // ставки, либо ни одной, и расчёт, попавший в эту щель, посчитает неверно.
      try {
        await adminDb.runTransaction(async (t) => {
          // Firestore требует, чтобы все чтения шли до всех записей.
          const supersededDocs = await Promise.all(
            overlapping.map((r: any) => t.get(adminDb.collection(COLLECTION).doc(r.id))),
          );

          const toClose: Array<{ ref: FirebaseFirestore.DocumentReference; from: string }> = [];
          for (const doc of supersededDocs) {
            if (!doc.exists) continue;
            const d = doc.data()!;
            // Проверка организации повторяется ВНУТРИ транзакции: чтение,
            // которое авторизовало эту запись, не атомарно с ней.
            if (d.organizationId !== orgFilter) continue;
            // Правило могли заархивировать или подвинуть, пока мы считали.
            if (d.status !== 'active') continue;
            if (!periodsOverlap(d.effectiveFrom, d.effectiveTo ?? null, effectiveFrom, effectiveTo)) continue;
            if (!(d.effectiveFrom < effectiveFrom)) {
              throw new RuleConflictError(d.id || doc.id);
            }
            toClose.push({ ref: doc.ref, from: d.effectiveFrom });
          }

          for (const c of toClose) {
            t.update(c.ref, { effectiveTo: closeAt, updatedAt: now });
          }
          t.set(newRef, data);
        });
      } catch (err: any) {
        if (err instanceof RuleConflictError) {
          return jsonResponse(409, {
            error: 'Действующая ставка преподавателя изменилась во время сохранения и теперь конфликтует с новой. Откройте список ставок заново и повторите.',
            conflictRuleId: err.message,
          });
        }
        throw err;
      }

      return ok({ id: newRef.id, ...data });
    }

    // ── PUT: правка ставки ─────────────────────────────────────────────────
    if (event.httpMethod === 'PUT') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const ruleId = body.ruleId || body.id;
      if (!ruleId) return badRequest('ruleId required');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const docRef = adminDb.collection(COLLECTION).doc(ruleId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Ставка не найдена');

      const existing = doc.data()!;
      // Без этого любой держатель payroll:write переписал бы ставку в чужой
      // организации, просто угадав id.
      if (existing.organizationId !== orgFilter) return forbidden();

      const branchError = requireBranchScope(user, existing.branchId);
      if (branchError) return branchError;

      // Правка ставки, по которой уже утверждена (или выплачена) ведомость —
      // это переписывание истории: снапшоты строк заморожены, а карточка под
      // ними поехала бы, и расчётный лист перестал бы объяснять сам себя.
      const usage = await inspectRuleUsage(orgFilter, ruleId);
      if (usage.frozenStates.length > 0) {
        return jsonResponse(409, {
          error: 'По этой ставке уже утверждена ведомость — менять её нельзя. Создайте новую версию ставки с более поздней датой начала: действующая закроется автоматически.',
          frozenStates: Array.from(new Set(usage.frozenStates)),
        });
      }

      // Явный аллоулист безопасных полей. teacherId/effectiveFrom/organizationId/
      // createdBy/supersedesId — идентичность и аудит: перенос ставки на другого
      // учителя или на другой месяц обязан быть новой версией, а не правкой.
      const updates: Record<string, any> = { updatedAt: new Date().toISOString() };

      if (body.label !== undefined) {
        const label = typeof body.label === 'string' ? body.label.trim() : '';
        if (!label) return badRequest('Название ставки обязательно — оно печатается на расчётном листе');
        updates.label = label;
      }

      if (body.components !== undefined) {
        const { components, error: componentsError } = normalizeComponents(body.components);
        if (componentsError) return badRequest(componentsError);
        updates.components = components;
      }

      if (body.effectiveTo !== undefined) {
        // Валидируем против СУЩЕСТВУЮЩЕГО effectiveFrom: его менять нельзя.
        const effectiveError = validateEffective(existing.effectiveFrom, body.effectiveTo);
        if (effectiveError) return badRequest(effectiveError);
        updates.effectiveTo = body.effectiveTo ?? null;
      }

      if (body.status !== undefined) {
        if (!RULE_STATUSES.includes(body.status)) {
          return badRequest(`Недопустимый статус ставки. Допустимые: ${RULE_STATUSES.join(', ')}.`);
        }
        updates.status = body.status;
      }

      await docRef.update(updates);
      return ok({ id: doc.id, ...existing, ...updates });
    }

    // ── DELETE: удалить ставку ─────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      if (!can(user, 'payroll', 'delete')) return forbidden('Недостаточно прав для этого действия');

      const ruleId = params.id;
      if (!ruleId) return badRequest('id required');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const docRef = adminDb.collection(COLLECTION).doc(ruleId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Ставка не найдена');

      const existing = doc.data()!;
      if (existing.organizationId !== orgFilter) return forbidden();

      const branchError = requireBranchScope(user, existing.branchId);
      if (branchError) return branchError;

      const usage = await inspectRuleUsage(orgFilter, ruleId);

      // Утверждённая или выплаченная ведомость — это бухгалтерский документ.
      // Удаление ставки под ним оставляет строки со ссылкой в никуда и лишает
      // директора ответа на вопрос «по какой ставке я это заплатил». force тут
      // НЕ помогает намеренно: архивация решает ту же задачу без потери аудита.
      if (usage.frozenStates.length > 0) {
        return jsonResponse(409, {
          error: 'По этой ставке уже утверждена ведомость — удалить её нельзя. Заархивируйте ставку: она перестанет участвовать в расчётах, но история сохранится.',
          frozenStates: Array.from(new Set(usage.frozenStates)),
          payrollLines: usage.lineCount,
        });
      }

      // Черновые строки ведомости тоже осиротеют, но это поправимо пересчётом —
      // достаточно заставить вызывающего подтвердить (как api-finance-plans).
      if (usage.lineCount > 0 && params.force !== 'true') {
        return jsonResponse(409, {
          error: `К этой ставке привязано строк ведомости: ${usage.lineCount}. Удаление оставит их без ставки.`,
          payrollLines: usage.lineCount,
        });
      }

      await docRef.delete();
      return ok({ deleted: true, id: ruleId });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Payroll Rules API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
