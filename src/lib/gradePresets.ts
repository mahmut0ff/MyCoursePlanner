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
