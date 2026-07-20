/**
 * Перевод зарплатных чисел на человеческий язык — одно место на весь раздел.
 *
 * Сервер живёт в целых минорных единицах (тыйынах) и базисных пунктах, потому
 * что только целые числа считаются без дрейфа. Директор в этих единицах НЕ
 * мыслит: он вводит «30 000» и «20%». Конвертация происходит ровно здесь, на
 * границе формы, и больше нигде — иначе округление разъедется с расчётным
 * листом, который считал сервер.
 */
import type { PayComponent, PayrollPeriodState, RuleScope } from '../../types';
import { formatMoney } from '../../lib/money';

/**
 * Подпись переводчика в том виде, в каком её зовёт весь репозиторий:
 * ключ + инлайновый русский фолбэк. Функции ниже чистые, поэтому `t` приходит
 * параметром, а не через хук.
 */
export type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** Деньги из минорных единиц. Единственная точка деления на 100 при показе. */
export const formatMinor = (minor?: number | null): string => formatMoney(Number(minor || 0) / 100);

/** Со знаком — для штрафов и правок, где минус несёт смысл. */
export const formatMinorSigned = (minor?: number | null): string => {
  const value = Number(minor || 0);
  const sign = value < 0 ? '−' : '+';
  return `${sign}${formatMoney(Math.abs(value) / 100)}`;
};

/** Минорные единицы → строка для поля ввода в сомах. */
export const minorToSomInput = (minor?: number | null): string => {
  const value = Number(minor || 0);
  if (!value) return '';
  // Целые суммы показываем без хвоста «.00»: директор вводил «30000», и увидеть
  // при редактировании «30000.00» он не должен.
  return Number.isInteger(value / 100) ? String(value / 100) : (value / 100).toFixed(2);
};

/**
 * Сомы из поля ввода → целые минорные единицы. null = ввод непригоден.
 * Запятая как разделитель принимается: на русской раскладке её набирают чаще точки.
 */
export const somInputToMinor = (raw: string): number | null => {
  const normalized = String(raw ?? '').replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Округляем ОДИН раз, здесь: дальше сумма живёт целыми тыйынами до самого сервера.
  return Math.round(value * 100);
};

/** Базисные пункты → строка для поля «проценты» (2000 → «20»). */
export const bpToPercentInput = (bp?: number | null): string => {
  const value = Number(bp || 0);
  if (!value) return '';
  return Number.isInteger(value / 100) ? String(value / 100) : (value / 100).toFixed(2);
};

/** Проценты из поля ввода → базисные пункты. null = ввод непригоден (сервер ждёт 1..10000). */
export const percentInputToBp = (raw: string): number | null => {
  const normalized = String(raw ?? '').replace(/\s/g, '').replace(',', '.').replace('%', '');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const bp = Math.round(value * 100);
  if (bp < 1 || bp > 10000) return null;
  return bp;
};

/** «20%» из 2000. */
export const formatPercentBp = (bp?: number | null): string => `${bpToPercentInput(bp) || '0'}%`;

/** Компоненты ставки по видам — порядок задаёт и список в редакторе. */
export const COMPONENT_KINDS: PayComponent['kind'][] = [
  'salary',
  'percent_revenue',
  'per_lesson',
  'per_hour',
  'per_student',
];

/**
 * Виды, которые считаются ТОЛЬКО по журналу посещаемости. Про них редактор
 * обязан сказать прямым текстом: без отметки посещаемости с выбранной группой
 * запись урока не рождается, и зарплата молча выходит меньше настоящей.
 */
export const SESSION_BASED_KINDS: PayComponent['kind'][] = ['per_lesson', 'per_hour', 'per_student'];

export const isSessionBased = (kind: PayComponent['kind']): boolean => SESSION_BASED_KINDS.includes(kind);

/** Название вида компонента для выпадающего списка. */
export const componentKindLabel = (kind: PayComponent['kind'], t: Translate): string => {
  switch (kind) {
    case 'salary': return t('payroll.kindSalary', 'Оклад');
    case 'percent_revenue': return t('payroll.kindPercent', 'Процент от собранного');
    case 'per_lesson': return t('payroll.kindPerLesson', 'За занятие');
    case 'per_hour': return t('payroll.kindPerHour', 'За час');
    case 'per_student': return t('payroll.kindPerStudent', 'За студента');
    default: return String(kind);
  }
};

/**
 * Компонент одной строкой по-русски: «Оклад 30 000 с.», «20% от собранного».
 * Директор читает ставку, а не JSON, поэтому список правил рисуется отсюда.
 */
export const describeComponent = (component: PayComponent, t: Translate): string => {
  switch (component.kind) {
    case 'salary':
      return t('payroll.summarySalary', 'Оклад {{amount}}', { amount: formatMinor(component.amountMinor) });
    case 'percent_revenue':
      return t('payroll.summaryPercent', '{{percent}} от собранного', { percent: formatPercentBp(component.percentBp) });
    case 'per_lesson':
      return t('payroll.summaryPerLesson', '{{amount}} за занятие', { amount: formatMinor(component.amountMinor) });
    case 'per_hour':
      return t('payroll.summaryPerHour', '{{amount}} за час', { amount: formatMinor(component.amountMinor) });
    case 'per_student':
      return t('payroll.summaryPerStudent', '{{amount}} за студента', { amount: formatMinor(component.amountMinor) });
    default:
      return '';
  }
};

/** «Оклад 30 000 с. + 20% от собранного» — вся ставка одной фразой. */
export const describeComponents = (components: PayComponent[] | undefined, t: Translate): string => {
  const list = (components ?? []).map(c => describeComponent(c, t)).filter(Boolean);
  return list.length ? list.join(' + ') : t('payroll.noComponents', 'Компонентов нет');
};

/** Пусто = все курсы и группы преподавателя. Именно так это читает движок. */
export const describeScope = (
  scope: RuleScope | undefined,
  nameOf: (id: string) => string,
  t: Translate,
): string => {
  const groupIds = scope?.groupIds ?? [];
  const courseIds = scope?.courseIds ?? [];
  if (!groupIds.length && !courseIds.length) return t('payroll.scopeAll', 'Все курсы и группы');
  // Приоритет ровно как в matchesScope движка: если названы группы, курсы НЕ
  // учитываются вовсе. Перечислять их через запятую значило бы обещать
  // объединение, которого движок не делает, — а разница здесь в зарплате.
  if (groupIds.length) {
    const groups = groupIds.map(nameOf).filter(Boolean).join(', ');
    return courseIds.length
      // Старые ставки успели сохранить и то и другое — говорим, что реально считается.
      ? t('payroll.scopeGroupsOverCourses', 'Группы: {{groups}} (выбранные курсы не учитываются)', { groups })
      : t('payroll.scopeGroupsOnly', 'Группы: {{groups}}', { groups });
  }
  return t('payroll.scopeCoursesOnly', 'Курсы: {{courses}}', {
    courses: courseIds.map(nameOf).filter(Boolean).join(', '),
  });
};

/** Период действия ставки: обе границы включительно, null справа = бессрочно. */
export const describeEffective = (from: string, to: string | null | undefined, t: Translate): string =>
  to
    ? t('payroll.effectiveRange', 'с {{from}} по {{to}}', { from, to })
    : t('payroll.effectiveOpen', 'с {{from}}, бессрочно', { from });

/** Оформление бейджа состояния ведомости. Прогресс читается цветом. */
export const PERIOD_STATE_STYLE: Record<PayrollPeriodState, { key: string; fallback: string; badge: string }> = {
  draft: {
    key: 'payroll.stateDraft',
    fallback: 'Черновик',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  calculated: {
    key: 'payroll.stateCalculated',
    fallback: 'Рассчитано',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  },
  approved: {
    key: 'payroll.stateApproved',
    fallback: 'Утверждено',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  paid: {
    key: 'payroll.statePaid',
    fallback: 'Выплачено',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
};

/** Текущий месяц как 'YYYY-MM' — семантика billingPeriodKey на сервере. */
export const currentPeriodKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Месяц 'YYYY-MM' по-русски для заголовков: «июль 2026». */
export const formatPeriodLabel = (period: string): string => {
  const [y, m] = String(period || '').split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return period;
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};
