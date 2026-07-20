/**
 * Payment-plan predicates — the single source of truth for "does this plan still
 * owe us money?".
 *
 * `studentPaymentPlans.status` can be `'cancelled'`: api-org.ts writes it when a
 * student is removed from a group while their plan is still untouched (pending,
 * nothing paid). That is a write-off — the academy has stopped claiming the money.
 *
 * Almost every consumer used to skip only `'paid'`, so cancelled plans kept
 * inflating outstanding-debt totals, kept their students in debtor lists and risk
 * counts, and — worst of all — kept them on the automated Telegram reminder list
 * for money nobody expects them to pay. api-finance-metrics was fixed first, which
 * made the dashboard and the AI copilot report different debt for the same org on
 * the same day. Everything that asks the debt question now asks it here.
 *
 * Deliberately dependency-free so any function (including hot, non-AI endpoints
 * like api-dashboard / api-risk) can import it without dragging in a module graph.
 */

/** Statuses that mean the plan is settled or written off — never debt-bearing. */
const SETTLED_STATUSES = ['paid', 'cancelled'];

/** Remaining balance on a plan, floored at 0 (an overpayment is not a negative debt). */
export function planDebt(plan: any): number {
  return Math.max(0, (plan?.totalAmount || 0) - (plan?.paidAmount || 0));
}

/**
 * True when a plan still represents money the org is owed: it is neither paid nor
 * cancelled AND it has a positive outstanding balance.
 *
 * Use this for debt totals, debtor lists, overdue counts, risk signals, digest
 * figures and — most importantly — automated reminder recipient selection.
 */
export function isDebtBearingPlan(plan: any): boolean {
  if (!plan) return false;
  if (SETTLED_STATUSES.includes(plan.status)) return false;
  return planDebt(plan) > 0;
}

/**
 * Календарный день срока в виде 'YYYY-MM-DD', или null если срока нет / он мусорный.
 *
 * Реальные документы несут ОБЕ формы: часть писателей кладёт голую дату
 * ('2026-07-20'), часть — полный ISO ('2026-07-20T00:00:00.000Z', см.
 * billingDeadlineISO в api-org.ts). Срез первых 10 символов нормализует обе, не
 * втягивая разбор дат и часовые пояса. Date/Timestamp поддержаны на случай
 * писателя, который положил не строку.
 */
function deadlineDayKey(deadline: unknown): string | null {
  let raw: unknown = deadline;
  if (raw instanceof Date) raw = raw.toISOString();
  else if (raw && typeof (raw as any).toDate === 'function') raw = (raw as any).toDate().toISOString();
  if (typeof raw !== 'string') return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Смещение «рабочего дня организации» от UTC, в минутах. UTC+6 — Asia/Bishkek.
 *
 * Почему константа, а не часовой пояс сервера: Netlify-функция всегда выполняется
 * в UTC, поэтому «локальное время сервера» — это UTC, и граница суток уезжала бы
 * на шесть часов ВПЕРЁД относительно клиента. Директор в Бишкеке в 02:00 21-го
 * числа видел бы, что счёт со сроком «20-е» ещё не просрочен: по UTC там всё ещё
 * 20-е. Ошибка невидимая — в логах сервера всё «правильно».
 *
 * Рынок продукта — Центральная Азия (UTC+5/+6). Берём +6 как явный, задокумен-
 * тированный дефолт. Появится поле часового пояса у организации — оно должно
 * ЗАМЕНИТЬ эту константу (передавать смещение аргументом в orgDayKey), а не
 * добавиться рядом с ней.
 */
const ORG_DAY_UTC_OFFSET_MINUTES = 6 * 60;

/**
 * Календарный день «сегодня» глазами организации, 'YYYY-MM-DD'.
 * Сдвигаем момент на смещение и берём дату уже сдвинутого UTC — так не тянем
 * Intl и не зависим от зоны машины, где крутится тест или функция.
 */
export function orgDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + ORG_DAY_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/**
 * Сколько календарных дней осталось до срока: 0 — срок сегодня, 1 — завтра,
 * отрицательное — просрочка на столько дней. null, если срока нет / он нечитаем.
 *
 * Считаем по КЛЮЧАМ ДНЕЙ, а не по разнице миллисекунд. Разница миллисекунд с
 * `Math.ceil` совпадает с этим правилом только случайно (для срока в полночь она
 * даёт -0 в день срока) и расходится с ним, как только у срока появляется
 * ненулевое время: '2026-07-20T18:00:00Z' в 09:15 того же дня давал daysLeft = 1
 * («оплата завтра») вместо 0 («оплата сегодня»).
 */
export function daysUntilDeadline(deadline: unknown, now: Date = new Date()): number | null {
  const day = deadlineDayKey(deadline);
  if (!day) return null;
  const asUtc = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
  return Math.round((asUtc(day) - asUtc(orgDayKey(now))) / 86_400_000);
}

/**
 * True когда срок оплаты РЕАЛЬНО прошёл — то есть его день целиком истёк.
 *
 * ── Почему это выглядит как ошибка на единицу (и почему это НЕ она) ──
 * `deadline` — это «оплатить ДО КОНЦА такого-то дня», а не мгновение. Наивное
 * `plan.deadline < new Date().toISOString()` сравнивает голую дату '2026-07-20' с
 * полным ISO '2026-07-20T09:15:00.000Z'; лексикографически это TRUE, потому что
 * короткая строка — префикс длинной. В итоге в 00:00 ТОГО САМОГО дня, когда
 * платёж только предстоит внести, счёт уже уезжал в 'overdue': студент попадал в
 * должники, в счётчик просрочки на дашборде и в автоматическую рассылку
 * debt-reminders — с требованием денег, которые ещё не просрочены.
 *
 * Поэтому сравниваем однородное с однородным: только календарные ДАТЫ. Срок,
 * наступающий сегодня, просрочкой не считается; вчерашний — считается.
 *
 * Живёт здесь, а не в двух эндпоинтах, потому что api-finance-plans (который
 * ПИШЕТ статус) и api-finance-metrics (который его СЧИТАЕТ) обязаны отвечать на
 * этот вопрос одинаково — разойдясь, они показывают директору два разных числа
 * просрочки по одной и той же организации.
 *
 * «Сегодня» берём в дне организации (orgDayKey), а не в UTC: см. комментарий у
 * ORG_DAY_UTC_OFFSET_MINUTES.
 */
export function isDeadlineMissed(deadline: unknown, now: Date = new Date()): boolean {
  const day = deadlineDayKey(deadline);
  if (!day) return false; // срока нет или он нечитаем — просрочить нечего
  return day < orgDayKey(now);
}

/**
 * True когда счёт следует показывать как просроченный.
 *
 * ── Источник истины — СРОК, а не записанный статус ──
 * Раньше здесь стояло `if (plan.status === 'overdue') return true;` до всякой
 * проверки срока. Статус 'overdue' при этом никто и нигде не снимает:
 * derivePlanStatus сознательно его сохраняет (там нет доступа к deadline). В
 * итоге просрочка была необратимой: директор ПРОДЛЕВАЛ срок, а счёт навсегда
 * оставался просроченным — раздувал KPI долга, висел в списке должников, и
 * студенту продолжали уходить «Просрочена оплата» за деньги, которые ещё не
 * просрочены.
 *
 * Поэтому: есть читаемый срок — решает только он (это позволяет и снять
 * просрочку, и поставить её). Срока нет или он мусорный — вычислить нечего,
 * только тогда доверяем записанному статусу.
 */
export function isPlanOverdue(plan: any, now: Date = new Date()): boolean {
  if (!plan) return false;
  if (deadlineDayKey(plan.deadline) !== null) return isDeadlineMissed(plan.deadline, now);
  return plan.status === 'overdue';
}
