/**
 * API: Payroll Compensation Rules — ставки преподавателей (`compensationRules`).
 *
 * ОДНА СТАВКА НА ПРЕПОДАВАТЕЛЯ и никаких сроков действия. Это главное отличие
 * от прежней модели: раньше ставка датировалась периодом, правка закрывала
 * старую версию и вставляла новую, а редактор спрашивал «действует с» и
 * «действует по». Директор мыслит не так — у преподавателя просто есть ставка,
 * и она такая, какая сейчас.
 *
 * ФИЛИАЛА У СТАВКИ ТОЖЕ НЕТ. «Двадцать процентов» — свойство человека, а не
 * здания, и преподаватель спокойно ведёт группы в двух филиалах сразу. Прежняя
 * модель «ставка на каждый филиал» на реальных данных давала ровно две беды:
 * ставка, заведённая «не там», молча не начисляла ничего, а у одного человека
 * копились документы-двойники. По филиалам раскладывается уже НАЧИСЛЕННОЕ —
 * при выплате, пропорционально тому, где заработано (см. buildBranchShares).
 *
 * История прошлых месяцев от этого не страдает, и это надо понимать: её защищают
 * не даты, а замороженный снапшот строки (PayrollLine.ruleSnapshot) плюс запрет
 * пересчитывать утверждённый период. Правка ставки в августе физически не может
 * тронуть июльские числа — июль не пересчитывается ни одним путём кода.
 *
 * Отсюда же детерминированный id документа (см. ruleDocId): «ставка Азизы» —
 * это ОДИН документ, и две одновременные записи не могут породить двух ставок,
 * из которых расчёт молча выберет одну. Документы прежней филиальной схемы
 * схлопываются в него при первом же сохранении (см. `stale` ниже) — отдельная
 * миграция для этого не нужна.
 *
 * Все запросы здесь — ТОЛЬКО на равенство: composite-индексы в этом проекте не
 * деплоятся (см. monthly-billing.ts). Сортировка — в JS.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { batchGetUserNames } from './utils/finance-names';
import {
  verifyAuth, can, getOrgFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';

const COLLECTION = 'compensationRules';

/** Зеркало PayComponent.kind из src/types/index.ts. Держите синхронно. */
const COMPONENT_KINDS = ['salary', 'percent_revenue'];

/** Целые минорные единицы: дробь здесь — это молча потерянные копейки в расчёте. */
function isPositiveMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Детерминированный id ставки: (организация, преподаватель).
 *
 * Настоящая гарантия «одна ставка на преподавателя»: Firestore не хранит два
 * документа с одним id, поэтому дубликат физически невозможен — в отличие от
 * проверки «а нет ли уже ставки?», которая не атомарна последующей записи.
 *
 * Хвост `_org` СОХРАНЁН намеренно, хотя филиала больше нет: ровно такой id уже
 * носят все общеорганизационные ставки (а их большинство — это было умолчание
 * формы). Убрать сегмент значило бы осиротить и их тоже, то есть выдумать
 * миграцию там, где её можно не делать.
 *
 * Санитайзер не косметика: id документа не должен содержать '/', быть '.'/'..'
 * или матчить /^__.*__$/. Преобразование чисто функциональное, поэтому одна и та
 * же пара всегда даёт один и тот же id.
 */
function ruleDocId(orgId: string, teacherId: string): string {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 200);
  return `rate_${safe(orgId)}_${safe(teacherId)}_org`;
}

/**
 * Валидация и нормализация оплаты. Возвращает НОВЫЕ объекты, а не присланные:
 * тело никогда не спредится в документ, иначе клиент протолкнул бы в
 * замороженный снапшот произвольные поля.
 *
 * Видов ровно два. Прежние «за занятие», «за час» и «за студента» удалены: они
 * считались по отметкам посещаемости, и зарплата человека молча зависела от
 * того, ведёт ли кто-то журнал.
 */
function normalizeComponents(raw: any): { components?: any[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Укажите оплату: процент или фиксированную сумму' };
  }
  const components: any[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const at = `Оплата №${i + 1}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { error: `${at}: ожидается объект` };
    if (!COMPONENT_KINDS.includes(c.kind)) {
      return {
        error: `${at}: недопустимый вид оплаты «${c.kind}». Допустимы только процент и фиксированная сумма.`,
      };
    }
    // Два процента в одной ставке — это не «сложная схема», а ошибка ввода:
    // расчёт сложил бы их и заплатил вдвое.
    if (seen.has(c.kind)) return { error: `${at}: вид оплаты «${c.kind}» указан дважды` };
    seen.add(c.kind);

    if (c.kind === 'salary') {
      if (!isPositiveMinor(c.amountMinor)) {
        return { error: `${at}: сумма должна быть целым положительным числом в минорных единицах` };
      }
      components.push({ kind: 'salary', amountMinor: c.amountMinor });
      continue;
    }

    // Базисные пункты: 2000 = 20%. Целое — потому что процент нигде не
    // умножается на float, доля считается как minor * bp / 10000.
    if (typeof c.percentBp !== 'number' || !Number.isSafeInteger(c.percentBp) || c.percentBp < 1 || c.percentBp > 10000) {
      return { error: `${at}: процент должен быть целым числом от 1 до 10000 базисных пунктов (2000 = 20%)` };
    }
    // База сейчас единственная — СОБРАННАЯ касса. Оставлять поле свободным
    // нельзя: движок читает его буквально и на неизвестной базе посчитал бы ноль.
    if (c.base !== undefined && c.base !== 'collected') {
      return { error: `${at}: процент считается только от СОБРАННЫХ денег (base: 'collected')` };
    }
    components.push({ kind: 'percent_revenue', percentBp: c.percentBp, base: 'collected' });
  }
  return { components };
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

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);
      // Только равенства — несколько таких клауз индекса не требуют.
      if (params.teacherId) query = query.where('teacherId', '==', params.teacherId);

      const snap = await query.get();
      // Фильтра по филиалу здесь нет и быть не должно. Список обязан показывать
      // РОВНО ТО, что видит расчёт, а расчёт после отвязки читает все ставки
      // организации — включая доставшиеся от филиальной схемы. Спрятать такую
      // ставку значило бы оставить директора в неведении о документе, по
      // которому ему завтра начислят зарплату.
      const results = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));

      const teacherNames = await batchGetUserNames(
        results.map((r: any) => r.teacherId).filter(Boolean),
      );
      for (const r of results) {
        if (r.teacherId) r.teacherName = teacherNames.get(r.teacherId) || '';
      }

      // Сортировка в памяти: orderBy в запросе потребовал бы composite-индекс.
      results.sort((a: any, b: any) =>
        String(a.teacherName || a.teacherId).localeCompare(String(b.teacherName || b.teacherId), 'ru'));

      // Голый массив — договорённость дома (как api-finance-plans GET).
      return ok(results);
    }

    // ── POST: задать ставку преподавателю (создание И правка) ──────────────
    // Один эндпоинт на оба случая намеренно: у преподавателя ставка ровно одна,
    // и «создать» против «изменить» — различие для базы, а не для человека.
    if (event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      if (!body.teacherId || typeof body.teacherId !== 'string') return badRequest('teacherId обязателен');

      const { components, error: componentsError } = normalizeComponents(body.components);
      if (componentsError) return badRequest(componentsError);

      // Преподаватель должен быть членом ЭТОЙ организации. Читаем orgMembers по id
      // (getDoc, не запрос): это работает и для offlineTeacher — синтетического
      // id без Firebase Auth, — поэтому проверять наличие Auth-аккаунта нельзя.
      const memberDoc = await adminDb.collection('orgMembers').doc(orgFilter)
        .collection('members').doc(body.teacherId).get();
      if (!memberDoc.exists) return badRequest('Преподаватель не найден в этой организации');

      const now = new Date().toISOString();
      const ref = adminDb.collection(COLLECTION).doc(ruleDocId(orgFilter, body.teacherId));
      const existing = await ref.get();

      // Явный аллоулист. organizationId/createdBy — служебные, их ставит сервер:
      // клиент не должен уметь создать ставку в чужой организации. Поля branchId
      // здесь нет намеренно, и стирать его у легаси-документа отдельно не нужно:
      // batch.set ниже — ПОЛНАЯ перезапись без merge, поле уходит само.
      const data: Record<string, any> = {
        teacherId: body.teacherId,
        components,
        organizationId: orgFilter,
        createdBy: existing.exists ? (existing.data() as any).createdBy ?? user.uid : user.uid,
        createdAt: existing.exists ? (existing.data() as any).createdAt ?? now : now,
        updatedBy: user.uid,
        updatedAt: now,
      };

      // ── Самолечение от прежних моделей ──
      // Ставки успели побывать датированными версиями с автоid, а затем —
      // отдельным документом на каждый филиал; у одного преподавателя их
      // накапливалось несколько. Расчёт из нескольких выбрал бы одну (с
      // диагностикой), но правка через этот эндпоинт трогала бы только
      // канонический документ — то есть директор менял бы ставку, а начислялась
      // бы старая. Поэтому ЛЮБЫЕ другие документы того же преподавателя
      // удаляются тем же батчем, что и запись: сверки по филиалу здесь больше
      // нет, иначе филиальный двойник пережил бы сохранение и продолжил спорить
      // с канонической ставкой за то, сколько человеку платить.
      const siblings = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', orgFilter)
        .where('teacherId', '==', body.teacherId)
        .get();
      const stale = siblings.docs.filter((d: any) => d.id !== ref.id);

      const batch = adminDb.batch();
      batch.set(ref, data);
      for (const doc of stale) batch.delete(doc.ref);
      await batch.commit();

      return ok({ id: ref.id, ...data, replacedLegacyRules: stale.length });
    }

    // ── DELETE: убрать ставку ──────────────────────────────────────────────
    // Без гардов «по ставке уже утверждена ведомость»: строки ведомости несут
    // собственный замороженный снапшот и не читают карточку ставки, поэтому
    // удаление ничего в истории не ломает. Оно лишь означает «этому человеку
    // больше не начислять».
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
      // Без этого любой держатель payroll:delete снёс бы ставку в чужой
      // организации, просто угадав id.
      if (existing.organizationId !== orgFilter) return forbidden();

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
