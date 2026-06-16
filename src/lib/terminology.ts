import type { TFunction } from 'i18next';
import type { InstitutionType } from '../types';

/**
 * Institution presets. One switch ("тип заведения") adapts the product to a
 * segment: it changes the vocabulary (группы↔классы, студенты↔ученики) and the
 * default grading scale applied to new courses — without forking the product.
 *
 * `icon` is a lucide-react icon name; consumers map it to the component.
 * `defaultGradePresetId` references an id from `./gradePresets`.
 */
export interface InstitutionConfig {
  id: InstitutionType;
  labelKey: string;
  label: string;
  descKey: string;
  desc: string;
  icon: string;
  defaultGradePresetId: string;
  terms: { students: string; student: string; groups: string; group: string };
}

export const INSTITUTIONS: Record<InstitutionType, InstitutionConfig> = {
  center: {
    id: 'center',
    labelKey: 'inst.center',
    label: 'Учебный центр',
    descKey: 'inst.centerDesc',
    desc: 'Курсы и группы, 100-балльная шкала',
    icon: 'GraduationCap',
    defaultGradePresetId: 'hundred',
    terms: { students: 'Студенты', student: 'Студент', groups: 'Группы', group: 'Группа' },
  },
  school: {
    id: 'school',
    labelKey: 'inst.school',
    label: 'Школа',
    descKey: 'inst.schoolDesc',
    desc: 'Классы, ученики и 5-балльная система',
    icon: 'School',
    defaultGradePresetId: 'five_point',
    terms: { students: 'Ученики', student: 'Ученик', groups: 'Классы', group: 'Класс' },
  },
  language: {
    id: 'language',
    labelKey: 'inst.language',
    label: 'Языковые курсы',
    descKey: 'inst.languageDesc',
    desc: 'Группы по уровням, буквенные оценки',
    icon: 'Languages',
    defaultGradePresetId: 'letter_af',
    terms: { students: 'Студенты', student: 'Студент', groups: 'Группы', group: 'Группа' },
  },
  academy: {
    id: 'academy',
    labelKey: 'inst.academy',
    label: 'Онлайн-академия',
    descKey: 'inst.academyDesc',
    desc: 'Потоки и проценты',
    icon: 'Globe',
    defaultGradePresetId: 'percent',
    terms: { students: 'Студенты', student: 'Студент', groups: 'Потоки', group: 'Поток' },
  },
};

export const INSTITUTION_LIST: InstitutionConfig[] = [
  INSTITUTIONS.center,
  INSTITUTIONS.school,
  INSTITUTIONS.language,
  INSTITUTIONS.academy,
];

export function getInstitution(type?: InstitutionType | null): InstitutionConfig {
  return (type && INSTITUTIONS[type]) || INSTITUTIONS.center;
}

export type TermKey = 'students' | 'student' | 'groups' | 'group';

/**
 * Resolve a localized institution-specific term, falling back to the preset's
 * Russian default. Pass i18next's `t`.
 */
export function term(
  t: TFunction,
  type: InstitutionType | null | undefined,
  key: TermKey,
): string {
  const inst = getInstitution(type);
  return t(`terms.${inst.id}.${key}`, { defaultValue: inst.terms[key] });
}
