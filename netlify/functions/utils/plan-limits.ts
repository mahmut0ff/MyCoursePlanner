import { adminDb } from './firebase-admin';
import { forbidden, isSuperAdmin } from './auth';
import { PLAN_LIMITS, FEATURE_MIN_PLAN, normalizePlanId, planHasFeature, type PlanFeature } from '../../../src/lib/subscription-plans';

// Количественные лимиты живут в общем модуле тарифов вместе с ценами и составом —
// иначе клиент, лендинг и сервер снова разойдутся в цифрах.
export { PLAN_LIMITS };

/**
 * Plans that include the AI sales manager / assistant.
 * Lowered from Enterprise-only to Professional and up (aliases included so older
 * plan ids keep working). Single source of truth — used by the AI manager API,
 * the Telegram webhook (custom org bot) and settings gating.
 */
export const AI_MANAGER_PLANS = ['professional', 'pro', 'expert', 'enterprise'];

export function planHasAIManager(planId?: string | null): boolean {
  return !!planId && AI_MANAGER_PLANS.includes(planId);
}

export async function getOrgLimits(organizationId: string) {
  let limits = { ...PLAN_LIMITS.starter };

  try {
    // 1. Get Plan ID
    const orgDoc = await adminDb.collection('organizations').doc(organizationId).get();
    if (orgDoc.exists) {
      // Канонизируем id перед поиском лимитов. PLAN_LIMITS знает только новые
      // идентификаторы, а в базе у части организаций лежат исторические 'pro' и
      // 'expert' — для них поиск не находил ничего, и лимиты молча падали до
      // Starter: 50 учеников на академии, которая платит как за Professional.
      // AI_MANAGER_PLANS ниже эти id знает — расхождение и было ошибкой.
      const planId = normalizePlanId(orgDoc.data()?.planId);
      if (PLAN_LIMITS[planId]) {
        limits = { ...PLAN_LIMITS[planId] };
      }
    }

    // 2. Check super admin overrides
    const overrideDoc = await adminDb.collection('orgOverrides').doc(organizationId).get();
    if (overrideDoc.exists) {
      const overrides = overrideDoc.data();
      if (overrides) {
         if (overrides.maxStudents !== undefined && overrides.maxStudents !== null) limits.maxStudents = overrides.maxStudents;
         if (overrides.maxTeachers !== undefined && overrides.maxTeachers !== null) limits.maxTeachers = overrides.maxTeachers;
         if (overrides.maxExams !== undefined && overrides.maxExams !== null) limits.maxExams = overrides.maxExams;
      }
    }
  } catch (e) {
    console.error(`Error fetching limits for org ${organizationId}:`, e);
  }

  return limits;
}

type AuthUserLike = Parameters<typeof isSuperAdmin>[0];

/**
 * Серверный гейт платного модуля. Возвращает 403, если тариф организации
 * (organizations.planId — то же поле, по которому считаются лимиты) модуль не
 * включает; null — проход.
 *
 * До этого состав тарифа проверял только клиент (PlanContext.canAccess): кнопки
 * прятались, но эндпоинты отвечали любому — Starter-организация могла вести
 * финансы, зарплату, филиалы и сертификаты прямыми запросами, то есть получать
 * Professional/Enterprise бесплатно.
 *
 * Гейтятся ЗАПИСИ платных эндпоинтов. Чтение намеренно открыто: страницы
 * Starter-организаций читают эти данные попутно (бейдж оплаты у студента,
 * сводки), и отказ в чтении ломал бы их, не экономя ничего — создать данные
 * платного модуля без записи нельзя.
 */
export async function requirePlanFeature(user: AuthUserLike, feature: PlanFeature) {
  if (isSuperAdmin(user)) return null;
  if (!user.organizationId) return forbidden('No organization');
  const orgDoc = await adminDb.collection('organizations').doc(user.organizationId).get();
  if (planHasFeature(orgDoc.data()?.planId, feature)) return null;
  return forbidden(`This feature requires the ${FEATURE_MIN_PLAN[feature]} plan`);
}
