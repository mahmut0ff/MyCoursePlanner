/**
 * Договорная цена обучения — серверная часть.
 *
 * Правила (приоритет ставки над ценой курса, форма id, что считается заданной
 * ставкой) живут в `src/lib/tuition.ts` и здесь только реэкспортируются: SPA и
 * функции обязаны считать сумму к оплате ОДИНАКОВО — ровно та причина, по которой
 * так же устроен utils/payment-plans.ts. Своё здесь одно — чтение из Firestore.
 */
import { getDocsByIds } from './firebase-admin';
import { tuitionDocId, readTuitionAmount } from '../../../src/lib/tuition';

export {
  TUITION_COLLECTION,
  TUITION_ALL_COURSES,
  tuitionDocId,
  tuitionKey,
  readTuitionAmount,
  effectiveChargeAmount,
} from '../../../src/lib/tuition';

/**
 * Ставки студентов по ОДНОМУ курсу: Map<studentId, amount>. В карте только те,
 * у кого ставка задана, — отсутствие ключа означает «платит по цене курса».
 *
 * Чтение точечное, по детерминированным id (getDocsByIds → getAll), поэтому не
 * нужен ни один индекс и не появляется запроса, который пришлось бы обходить
 * фильтрацией в JS.
 *
 * Организацию перепроверяем полем, хотя она уже зашита в id: документ читается
 * точечно, и единственная защита от чужого тенанта — это сам id. Проверка стоит
 * ноль и закрывает случай, когда id соберут неправильно.
 */
export async function loadTuitionRates(
  orgId: string,
  courseId: string,
  studentIds: Array<string | null | undefined>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(studentIds.filter(Boolean) as string[])];
  if (ids.length === 0 || !courseId) return out;

  const docs = await getDocsByIds(
    'studentTuitions',
    ids.map(sid => tuitionDocId(orgId, sid, courseId)),
  );
  for (const sid of ids) {
    const doc = docs[tuitionDocId(orgId, sid, courseId)];
    if (!doc) continue;
    if (doc.organizationId && doc.organizationId !== orgId) continue;
    const amount = readTuitionAmount(doc);
    if (amount !== null) out.set(sid, amount);
  }
  return out;
}
