import type { GradingType, GradeScale, GradeSchema } from '../types';

/**
 * Ready-made grading scales.
 * Picking a preset fills the whole GradeSchema in one click instead of
 * hand-setting type / min / max / threshold / labels.
 */
export interface GradePreset {
  id: string;
  /** i18n key (with a Russian fallback baked into `label`) */
  labelKey: string;
  label: string;
  gradingType: GradingType;
  scale: GradeScale;
  passThreshold: number;
}

export const GRADE_PRESETS: GradePreset[] = [
  {
    id: 'five_point',
    labelKey: 'gradebook.presetFivePoint',
    label: '5-балльная',
    gradingType: 'points',
    scale: { min: 2, max: 5 },
    passThreshold: 3,
  },
  {
    id: 'hundred',
    labelKey: 'gradebook.presetHundred',
    label: '100-балльная',
    gradingType: 'points',
    scale: { min: 0, max: 100 },
    passThreshold: 60,
  },
  {
    id: 'percent',
    labelKey: 'gradebook.presetPercent',
    label: 'Проценты',
    gradingType: 'percent',
    scale: { min: 0, max: 100 },
    passThreshold: 50,
  },
  {
    id: 'letter_af',
    labelKey: 'gradebook.presetLetter',
    label: 'Буквы A–F',
    gradingType: 'letter',
    scale: {
      min: 0,
      max: 100,
      labels: { A: '90–100', B: '80–89', C: '70–79', D: '60–69', F: '0–59' },
    },
    passThreshold: 60,
  },
  {
    id: 'pass_fail',
    labelKey: 'gradebook.presetPassFail',
    label: 'Зачёт / Незачёт',
    gradingType: 'pass_fail',
    scale: { min: 0, max: 1 },
    passThreshold: 1,
  },
  {
    id: 'ielts',
    labelKey: 'gradebook.presetIelts',
    label: 'IELTS 0–9',
    gradingType: 'points',
    scale: { min: 0, max: 9 },
    passThreshold: 5,
  },
];

export function getPreset(id?: string | null): GradePreset | undefined {
  return GRADE_PRESETS.find((p) => p.id === id);
}

/** Схема курса, из которой видно шкалу: и сохранённая, и черновик в модалке. */
export type SchemaShape = Pick<GradeSchema, 'gradingType' | 'scale' | 'passThreshold'>;

function sameLabels(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a || {})[k] === (b || {})[k]);
}

/**
 * Какой из готовых пресетов сейчас выбран.
 *
 * Пресет нигде не хранится — в базе лежит только его «отпечаток» (тип, диапазон,
 * порог, символы), поэтому активную кнопку приходится узнавать обратным
 * сопоставлением. Без этого модалка открывалась без единой подсветки и было
 * непонятно, какая шкала стоит.
 */
export function detectPreset(schema?: SchemaShape | null): GradePreset | undefined {
  if (!schema?.scale) return undefined;
  return GRADE_PRESETS.find(
    (p) =>
      p.gradingType === schema.gradingType &&
      p.scale.min === schema.scale.min &&
      p.scale.max === schema.scale.max &&
      p.passThreshold === schema.passThreshold &&
      sameLabels(p.scale.labels, schema.scale.labels),
  );
}

/** Значения по умолчанию для «Зачёт / Незачёт», если символы не заданы вручную. */
export const PASS_FAIL_CHOICES = ['Зачёт', 'Незачёт'];

/**
 * Готовый список отметок для нечисловых шкал — из него преподаватель выбирает
 * в журнале вместо свободного ввода.
 *
 * Пустой список означает «выбирать не из чего» (буквенная/своя шкала без
 * заданных символов) — там ячейка остаётся текстовой, иначе оценку было бы
 * вообще не поставить.
 */
export function schemaChoices(schema?: SchemaShape | null): string[] {
  if (!schema) return [];
  const keys = Object.keys(schema.scale?.labels || {});
  if (schema.gradingType === 'pass_fail') return keys.length ? keys : PASS_FAIL_CHOICES;
  if (schema.gradingType === 'letter' || schema.gradingType === 'custom') return keys;
  return [];
}

/** «90–100» → 95, «60» → 60, «отлично» → null. */
function midpointOf(desc?: string): number | null {
  if (!desc) return null;
  const range = desc.match(/(-?\d+(?:[.,]\d+)?)\s*[–—−-]\s*(-?\d+(?:[.,]\d+)?)/);
  if (range) {
    const a = parseFloat(range[1].replace(',', '.'));
    const b = parseFloat(range[2].replace(',', '.'));
    if (!isNaN(a) && !isNaN(b)) return Math.round(((a + b) / 2) * 10) / 10;
  }
  const single = desc.match(/-?\d+(?:[.,]\d+)?/);
  if (single) {
    const n = parseFloat(single[0].replace(',', '.'));
    if (!isNaN(n)) return n;
  }
  return null;
}

/**
 * Числовой эквивалент нечисловой отметки — чтобы «Зачёт» и буквы попадали в
 * средний балл, а не выпадали из него молча.
 *
 * Буква берёт середину своего диапазона («90–100» → 95). Если диапазон не задан
 * или не распознан, отметки раскладываются по шкале равномерно, СВЕРХУ ВНИЗ:
 * первая в списке считается высшей. Зачёт — максимум шкалы, незачёт — минимум.
 */
export function choiceNumericValue(schema: SchemaShape | null | undefined, choice?: string | null): number | null {
  if (!schema || !choice) return null;
  const list = schemaChoices(schema);
  const idx = list.indexOf(choice);
  if (idx === -1) return null;

  const min = schema.scale?.min ?? 0;
  const max = schema.scale?.max ?? 100;

  if (schema.gradingType === 'pass_fail') return idx === 0 ? max : min;

  // Диапазон из подписи берём, только если он вписывается в шкалу. Буквы
  // «90–100» на шкале 0–5 (тип переключили руками) иначе дали бы средний балл
  // под 1900%, а зажатие по максимуму уравняло бы A и F — тогда честнее
  // разложить отметки равномерно.
  const mid = midpointOf(schema.scale?.labels?.[choice]);
  if (mid !== null && mid >= min && mid <= max) return mid;

  if (list.length === 1) return max;
  return Math.round((max - (idx * (max - min)) / (list.length - 1)) * 10) / 10;
}

/**
 * Числовое значение оценки для средних: сохранённое `value`, а для отметок,
 * поставленных до появления этого перевода, — восстановленное из `displayValue`.
 */
export function entryNumericValue(
  entry: { value?: number | null; displayValue?: string } | null | undefined,
  schema: SchemaShape | null | undefined,
): number | null {
  if (typeof entry?.value === 'number') return entry.value;
  return choiceNumericValue(schema, entry?.displayValue);
}

/** Короткое имя шкалы для кнопок и подсказок: «5-балльная», «Баллы 0–70». */
export function describeSchema(schema?: SchemaShape | null): string {
  if (!schema?.scale) return '—';
  const preset = detectPreset(schema);
  if (preset) return preset.label;
  const { min, max } = schema.scale;
  switch (schema.gradingType) {
    case 'pass_fail':
      return 'Зачёт / Незачёт';
    case 'letter':
      return `Буквенная (${Object.keys(schema.scale.labels || {}).join(', ') || '—'})`;
    case 'custom':
      return 'Своя шкала';
    case 'percent':
      return `Проценты ${min}–${max}`;
    default:
      return `Баллы ${min}–${max}`;
  }
}

/**
 * Fallback schema for a course that has none saved yet, seeded from the
 * institution's default grading preset.
 *
 * Shared by the gradebook and the journal on purpose: the journal used to carry
 * its own hard-coded 0–100 fallback, so an unconfigured course in a school
 * (5-point institution default) showed «М: 100» in the journal and a 5-point
 * scale in the gradebook.
 */
export function makeDefaultSchema(presetId: string | undefined, courseId = ''): GradeSchema {
  const preset = getPreset(presetId);
  return {
    id: '',
    courseId,
    organizationId: '',
    gradingType: preset?.gradingType || 'points',
    scale: preset?.scale || { min: 0, max: 100 },
    passThreshold: preset?.passThreshold ?? 50,
    createdAt: '',
    updatedAt: '',
  };
}
