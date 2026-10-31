import type { PostProcessorModule } from 'i18next';
import type { InstitutionType } from '../types';

/**
 * «Студент» везде, «ученик» — только в режиме «школа». Тексты локалей писались
 * вперемешку («Добавить студента» → «Ученик создан»), поэтому слово приводится к
 * режиму на выходе t(), а не правкой сотен строк. Основы совпадают по падежам
 * (ученик-ов / студент-ов, o'quvchi-lar / talaba-lar), так что замена основы
 * не ломает окончания.
 *
 * shortcut: kg не трогаем — «окуучу»/«студент» спрягаются по-разному (окуучулар /
 * студенттер); для kg нужны отдельные ключи, если понадобится.
 */
type Swap = [RegExp, string][];

const RU_TO_STUDENT: Swap = [[/ученик/g, 'студент'], [/Ученик/g, 'Студент'], [/УЧЕНИК/g, 'СТУДЕНТ']];
const RU_TO_PUPIL: Swap = [[/студент/g, 'ученик'], [/Студент/g, 'Ученик'], [/СТУДЕНТ/g, 'УЧЕНИК']];
const EN_TO_STUDENT: Swap = [[/pupil/g, 'student'], [/Pupil/g, 'Student'], [/PUPIL/g, 'STUDENT']];
const EN_TO_PUPIL: Swap = [[/student/g, 'pupil'], [/Student/g, 'Pupil'], [/STUDENT/g, 'PUPIL']];
const UZ_TO_STUDENT: Swap = [[/o['‘ʻ]quvchi/g, 'talaba'], [/O['‘ʻ]quvchi/g, 'Talaba'], [/O['‘ʻ]QUVCHI/g, 'TALABA']];
const UZ_TO_PUPIL: Swap = [[/\btalaba/g, "o'quvchi"], [/\bTalaba/g, "O'quvchi"], [/\bTALABA/g, "O'QUVCHI"]];

const SWAPS: Record<string, { student: Swap; pupil: Swap }> = {
  ru: { student: RU_TO_STUDENT, pupil: RU_TO_PUPIL },
  en: { student: EN_TO_STUDENT, pupil: EN_TO_PUPIL },
  uz: { student: UZ_TO_STUDENT, pupil: UZ_TO_PUPIL },
};

export function applyStudentTerm(value: string, lng: string | undefined, school: boolean): string {
  const swaps = SWAPS[(lng || 'ru').slice(0, 2)];
  if (!swaps || typeof value !== 'string') return value;
  return (school ? swaps.pupil : swaps.student).reduce((s, [re, to]) => s.replace(re, to), value);
}

/** null — вне организации (лендинг, вход, портал родителя): тексты как есть. */
let mode: InstitutionType | null = null;
export const setStudentTermMode = (type: InstitutionType | null): boolean => {
  const changed = mode !== type;
  mode = type;
  return changed;
};

/** Ключи, где оба слова нужны буквально: описания типов заведений, словарь терминов, лендинг. */
const KEEP = /^(inst|terms|landing|home|features)\.|^org\.settings\.institutionTypeDesc$/;

export const studentTermPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'studentTerm',
  process(value, key, _options, translator) {
    if (mode === null) return value;
    const k = Array.isArray(key) ? key[0] : key;
    if (k && KEEP.test(k)) return value;
    return applyStudentTerm(value, translator?.language, mode === 'school');
  },
};
