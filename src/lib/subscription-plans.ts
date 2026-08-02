/**
 * Тарифы самой платформы (то, что платит академия за SabakHub) — единственный
 * источник истины по идентификаторам, ценам и старшинству.
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

/** Цена тарифа в сомах за месяц. Ключи — только канонические id. */
const PLAN_PRICES: Record<PlanId, number> = {
  starter: 1990,
  professional: 4990,
  enterprise: 14900,
};

/** Старшинство тарифа: больше — старше. Нужно для «апгрейд или даунгрейд». */
const PLAN_ORDER: Record<PlanId, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

/** Известен ли идентификатор вообще (с учётом legacy). */
export function isKnownPlanId(planId?: string | null): boolean {
  if (!planId) return false;
  return planId in PLAN_PRICES || planId in LEGACY_PLAN_ALIASES;
}

/**
 * Приводит любой сохранённый id к каноническому.
 * Неизвестный или отсутствующий — 'starter': это самый скромный тариф, поэтому
 * ошибка канонизации не может ВЫДАТЬ прав, только недодать.
 */
export function normalizePlanId(planId?: string | null): PlanId {
  if (!planId) return 'starter';
  if (planId in PLAN_PRICES) return planId as PlanId;
  return LEGACY_PLAN_ALIASES[planId] || 'starter';
}

/** Цена тарифа в сомах. Legacy-id стоит столько же, сколько тариф, которым он стал. */
export function planPrice(planId?: string | null): number {
  return PLAN_PRICES[normalizePlanId(planId)];
}

/** Старшинство тарифа для сравнения «выше/ниже». */
export function planRank(planId?: string | null): number {
  return PLAN_ORDER[normalizePlanId(planId)];
}

/** Суточная стоимость тарифа — база пропорционального пересчёта при смене. */
export function planDailyRate(planId?: string | null): number {
  return Math.round((planPrice(planId) / 30) * 100) / 100;
}
