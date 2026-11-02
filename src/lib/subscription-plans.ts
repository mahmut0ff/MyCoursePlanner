/**
 * Тарифы самой платформы (то, что платит академия за SabakHub) — единственный
 * источник истины по идентификаторам, ценам, лимитам, составу и старшинству.
 *
 * До этого таблица цен была скопирована ПЯТЬ раз: api-subscriptions, api-admin,
 * payment-webhook, subscription-reminders и AdminBillingPage. Копии успели
 * разойтись не значениями, а ОХВАТОМ: канонические id знали все, а legacy-id
 * 'pro' и 'expert' — только AI_MANAGER_PLANS и PAYROLL_PLANS. Для остальных
 * такой тариф не существовал: в PLAN_PRICES его нет, значит цена 0 сом в
 * админском биллинге и в MRR, а в PLAN_LIMITS его нет, значит лимиты Starter —
 * 50 учеников на организации, которая платит как за Professional.
 *
 * Лечится это не «дописать legacy в каждую копию», а тем же приёмом, что и с
 * долгом по счетам (src/lib/payment-plans.ts): одно определение, которое
 * импортируют обе стороны. Живёт в `src/lib`, потому что tsconfig.app.json
 * покрывает только `src` — модуль под netlify/functions был бы недостижим из
 * React-страницы, и копия появилась бы снова.
 *
 * Лимиты по той же причине: клиент (types/index.ts) обещал Pro 200 студентов,
 * лендинг — 300, сервер — 200. Теперь число одно.
 *
 * Зависимостей нет намеренно: файл обязан собираться и приложением, и функциями.
 */

/** Действующие тарифы, от младшего к старшему. */
export type PlanId = 'starter' | 'professional' | 'enterprise';

export const PLAN_IDS: PlanId[] = ['starter', 'professional', 'enterprise'];

/**
 * Исторические id, выданные организациям до переименования тарифов.
 *
 * Их нельзя просто переписать в базе: id лежит и в `organizations.planId`, и в
 * `subscriptions.planId`, и в аудите смен тарифа. Поэтому канонизируем на
 * чтении. Соответствие взято из группировок, где legacy-id уже перечислены
 * рядом с новыми (AI_MANAGER_PLANS, PAYROLL_PLANS в utils/plan-limits.ts):
 * 'pro' идёт вместе с 'professional', 'expert' — вместе с 'enterprise'.
 */
const LEGACY_PLAN_ALIASES: Record<string, PlanId> = {
  pro: 'professional',
  expert: 'enterprise',
};

/**
 * Цена тарифа в сомах за месяц. Ключи — только канонические id.
 *
 * Уровни выставлены по рынку Центральной Азии (ноябрь 2026): каждая ступень
 * ниже регионального лидера Modme (≈3 600 / 7 600 / 11 400 сом за 100 / 300 /
 * 1000 студентов) и кыргызской Oimo CRM (8 000 сом), при этом Starter дешевле
 * месячной оплаты одного студента в Бишкеке (3 000–4 500 сом).
 */
const PLAN_PRICES: Record<PlanId, number> = {
  starter: 1990,
  professional: 4990,
  enterprise: 9900,
};

/** Количественные лимиты тарифа; -1 = без ограничений. */
export const PLAN_LIMITS: Record<PlanId, { maxStudents: number; maxTeachers: number; maxExams: number }> = {
  starter: { maxStudents: 50, maxTeachers: 5, maxExams: 20 },
  professional: { maxStudents: 300, maxTeachers: 20, maxExams: -1 },
  enterprise: { maxStudents: -1, maxTeachers: -1, maxExams: -1 },
};

/** Старшинство тарифа: больше — старше. Нужно для «апгрейд или даунгрейд». */
const PLAN_ORDER: Record<PlanId, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

/** Платные модули, которые включаются тарифом. */
export type PlanFeature =
  | 'finances' | 'payroll' | 'gradebook' | 'certificates'
  | 'branches' | 'advancedAnalytics' | 'rbac'
  | 'ai' | 'aiAnalytics';

/**
 * Младший тариф, в котором модуль доступен. Клиент показывает по этой таблице
 * UpgradeWall, сервер — отказывает в записях (utils/plan-limits.ts).
 */
export const FEATURE_MIN_PLAN: Record<PlanFeature, PlanId> = {
  finances: 'professional',
  payroll: 'professional',
  gradebook: 'professional',
  certificates: 'professional',
  advancedAnalytics: 'professional',
  rbac: 'professional',
  branches: 'enterprise',
  ai: 'enterprise',
  aiAnalytics: 'enterprise',
};

/** Известен ли идентификатор вообще (с учётом legacy). */
export function isKnownPlanId(planId?: string | null): boolean {
  if (!planId) return false;
  // Object.hasOwn, а не `in`: `in` находит и ключи ПРОТОТИПА, поэтому
  // planId: 'constructor' проходил валидацию как «известный тариф», а
  // normalizePlanId ниже вернул бы по нему функцию вместо строки.
  return Object.hasOwn(PLAN_PRICES, planId) || Object.hasOwn(LEGACY_PLAN_ALIASES, planId);
}

/**
 * Приводит любой сохранённый id к каноническому.
 * Неизвестный или отсутствующий — 'starter': это самый скромный тариф, поэтому
 * ошибка канонизации не может ВЫДАТЬ прав, только недодать.
 */
export function normalizePlanId(planId?: string | null): PlanId {
  if (!planId) return 'starter';
  if (Object.hasOwn(PLAN_PRICES, planId)) return planId as PlanId;
  if (Object.hasOwn(LEGACY_PLAN_ALIASES, planId)) return LEGACY_PLAN_ALIASES[planId];
  return 'starter';
}

/** Цена тарифа в сомах. Legacy-id стоит столько же, сколько тариф, которым он стал. */
export function planPrice(planId?: string | null): number {
  return PLAN_PRICES[normalizePlanId(planId)];
}

/** Старшинство тарифа для сравнения «выше/ниже». */
export function planRank(planId?: string | null): number {
  return PLAN_ORDER[normalizePlanId(planId)];
}

/** Включён ли модуль в тарифе (legacy-id считается по тарифу, которым он стал). */
export function planHasFeature(planId: string | null | undefined, feature: PlanFeature): boolean {
  return planRank(planId) >= PLAN_ORDER[FEATURE_MIN_PLAN[feature]];
}

/** Суточная стоимость тарифа — база пропорционального пересчёта при смене. */
export function planDailyRate(planId?: string | null): number {
  return Math.round((planPrice(planId) / 30) * 100) / 100;
}
