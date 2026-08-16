/**
 * Ставка по умолчанию — «как мы обычно платим преподавателю».
 *
 * ЗАЧЕМ ОНА ЕСТЬ. Преподаватель без ставки начисляется нулём — молча и законно:
 * система не имеет права выдумать, сколько человеку платить. Но в академии
 * условие почти у всех одно и то же («двадцать процентов»), и заводить его
 * заново каждому — работа, про которую забывают ровно до дня зарплаты. Поэтому
 * организация один раз называет своё умолчание, и оно достаётся каждому новому
 * преподавателю в момент заведения.
 *
 * ЧТО ЭТО НЕ ЗНАЧИТ. Умолчание не подменяет ставку на лету: расчёт по-прежнему
 * читает только реальные документы `compensationRules`. Значит убранная ставка
 * остаётся убранной, а не воскресает при следующем пересчёте, — иначе «убрать
 * ставку» перестало бы что-либо значить.
 *
 * Живёт умолчание полем `payrollDefaultRate` на документе организации: это
 * настройка организации, а не отдельная сущность, и коллекция ради одного
 * объекта была бы лишней.
 */
import { adminDb } from './firebase-admin';

const RULES = 'compensationRules';
const ORGS = 'organizations';

/** Виды оплаты — зеркало PayComponent.kind. Держите синхронно с api-payroll-rules. */
const COMPONENT_KINDS = ['salary', 'percent_revenue'];

export interface DefaultRate {
  components: any[];
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Детерминированный id ставки: (организация, преподаватель).
 *
 * Настоящая гарантия «одна ставка на преподавателя»: Firestore не хранит два
 * документа с одним id, поэтому дубликат физически невозможен — в отличие от
 * проверки «а нет ли уже ставки?», которая не атомарна последующей записи.
 *
 * Хвост `_org` сохранён намеренно, хотя филиала у ставки больше нет: ровно такой
 * id уже носят все общеорганизационные ставки, и смена схемы осиротила бы их.
 *
 * Санитайзер не косметика: id документа не должен содержать '/', быть '.'/'..'
 * или матчить /^__.*__$/.
 */
export function ruleDocId(orgId: string, teacherId: string): string {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 200);
  return `rate_${safe(orgId)}_${safe(teacherId)}_org`;
}

/**
 * Компоненты, которые движок УМЕЕТ начислять.
 *
 * Нужно не для валидации ввода (её делает api-payroll-rules), а чтобы отличить
 * живую ставку от мёртвой: в базе лежат ставки прежних моделей — «за занятие»,
 * «за час», «за студента». Формально ставка есть, а денег по ней не будет
 * никогда, и человек с такой ставкой ничем не лучше человека без неё.
 */
export function componentsArePayable(components: unknown): boolean {
  if (!Array.isArray(components) || !components.length) return false;
  return components.some((c: any) => c && COMPONENT_KINDS.includes(c.kind));
}

/**
 * Работает ли человек в организации ПРЯМО СЕЙЧАС.
 *
 * Проверка положительная, и это не стилистика. Прежний фильтр `status !==
 * 'inactive'` не исключал никого: статус 'inactive' в этой базе не пишет ни один
 * путь кода. Увольнение ставит 'removed' (api-memberships, ветка remove),
 * отчисление — 'expelled', самостоятельный выход — 'left', заявка на вступление
 * — 'pending'. То есть чёрный список пропускал и уволенных, и не принятых, а
 * раздача ставок воскрешала ровно те документы, которые увольнение удалило.
 *
 * `undefined` считаем активным: у членств прежних лет поля статуса нет вовсе, и
 * отсечь их значило бы потерять действующих преподавателей.
 */
export function membershipIsActive(m: { status?: string }): boolean {
  return m?.status === undefined || m?.status === 'active';
}

/** Умолчание организации или null, если его не задали. */
export async function readDefaultRate(orgId: string): Promise<DefaultRate | null> {
  const snap = await adminDb.collection(ORGS).doc(orgId).get();
  if (!snap.exists) return null;
  const raw = (snap.data() as any)?.payrollDefaultRate;
  if (!raw || !componentsArePayable(raw.components)) return null;
  return { components: raw.components, updatedAt: raw.updatedAt, updatedBy: raw.updatedBy };
}

/** Документ ставки, как его пишет api-payroll-rules. Одна форма на все пути записи. */
export function buildRuleDoc(orgId: string, teacherId: string, components: any[], actorUid: string, now: string) {
  return {
    teacherId,
    components,
    organizationId: orgId,
    createdBy: actorUid,
    createdAt: now,
    updatedBy: actorUid,
    updatedAt: now,
    // След происхождения: по нему видно, что ставку никто не назначал руками, —
    // это разные разговоры с преподавателем.
    fromDefault: true,
  };
}

export type EnsureResult = 'created' | 'no_default' | 'has_rate' | 'error';

/**
 * Выдать преподавателю ставку по умолчанию, если у него ещё нет своей.
 *
 * Вызывается в момент ЗАВЕДЕНИЯ преподавателя (создание карточки, выдача
 * преподавательской роли) — то есть ровно один раз на человека. Периодически
 * «досоздавать» ставки нельзя: это воскрешало бы удалённые.
 *
 * Никогда не бросает: провизионирование преподавателя не должно падать из-за
 * зарплатной настройки. Не создать ставку — терпимо (её видно в разделе как
 * «Ставка не задана»), не создать преподавателя — нет.
 */
export async function ensureTeacherRate(
  orgId: string,
  teacherId: string,
  actorUid: string,
): Promise<EnsureResult> {
  try {
    if (!orgId || !teacherId) return 'error';
    const def = await readDefaultRate(orgId);
    if (!def) return 'no_default';

    // Ищем ЛЮБУЮ ставку этого преподавателя, а не только каноническую: у
    // организации могли остаться документы прежних моделей, и вторая ставка
    // поверх них дала бы спор о том, по какой платить.
    const existing = await adminDb.collection(RULES)
      .where('organizationId', '==', orgId)
      .where('teacherId', '==', teacherId)
      .get();
    if (!existing.empty) return 'has_rate';

    const now = new Date().toISOString();
    // create, а не set: параллельное заведение того же человека не должно
    // затереть ставку, которую уже успели назначить руками.
    await adminDb.collection(RULES).doc(ruleDocId(orgId, teacherId))
      .create(buildRuleDoc(orgId, teacherId, def.components, actorUid, now));
    return 'created';
  } catch (err: any) {
    // ALREADY_EXISTS означает «ставка уже есть» — это успех задачи, а не сбой.
    if (err?.code === 6 || /already exists/i.test(String(err?.message || ''))) return 'has_rate';
    console.error('payroll: не удалось выдать ставку по умолчанию', { orgId, teacherId, error: err?.message });
    return 'error';
  }
}
