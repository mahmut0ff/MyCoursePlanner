import { describe, it, expect } from 'vitest';
import {
  detectPreset,
  schemaChoices,
  choiceNumericValue,
  entryNumericValue,
  describeSchema,
  getPreset,
} from '../gradePresets';

const letter = {
  gradingType: 'letter' as const,
  scale: { min: 0, max: 100, labels: { A: '90–100', B: '80–89', C: '70–79', D: '60–69', F: '0–59' } },
  passThreshold: 60,
};

const passFail = { gradingType: 'pass_fail' as const, scale: { min: 0, max: 1 }, passThreshold: 1 };

const fivePoint = { gradingType: 'points' as const, scale: { min: 2, max: 5 }, passThreshold: 3 };

describe('detectPreset', () => {
  it('узнаёт пресет по сохранённой схеме — id пресета в базе не хранится', () => {
    expect(detectPreset(fivePoint)?.id).toBe('five_point');
    expect(detectPreset(letter)?.id).toBe('letter_af');
    expect(detectPreset(passFail)?.id).toBe('pass_fail');
  });

  it('не считает пресетом подправленную вручную шкалу', () => {
    expect(detectPreset({ ...fivePoint, passThreshold: 4 })).toBeUndefined();
    expect(detectPreset({ ...letter, scale: { ...letter.scale, labels: { A: '90–100' } } })).toBeUndefined();
  });

  it('пустые labels и их отсутствие — одно и то же', () => {
    expect(detectPreset({ ...passFail, scale: { min: 0, max: 1, labels: {} } })?.id).toBe('pass_fail');
  });
});

describe('schemaChoices', () => {
  it('числовые шкалы выбором не ограничены', () => {
    expect(schemaChoices(fivePoint)).toEqual([]);
    expect(schemaChoices({ ...fivePoint, gradingType: 'percent' })).toEqual([]);
  });

  it('зачёт/незачёт подставляет значения по умолчанию, но уважает свои', () => {
    expect(schemaChoices(passFail)).toEqual(['Зачёт', 'Незачёт']);
    expect(schemaChoices({ ...passFail, scale: { min: 0, max: 1, labels: { Сдал: '', 'Не сдал': '' } } }))
      .toEqual(['Сдал', 'Не сдал']);
  });

  it('буквенная шкала без символов не даёт списка — иначе оценку не поставить', () => {
    expect(schemaChoices({ ...letter, scale: { min: 0, max: 100 } })).toEqual([]);
  });
});

describe('choiceNumericValue', () => {
  it('буква берёт середину своего диапазона', () => {
    expect(choiceNumericValue(letter, 'A')).toBe(95);
    expect(choiceNumericValue(letter, 'C')).toBe(74.5);
    expect(choiceNumericValue(letter, 'F')).toBe(29.5);
  });

  it('зачёт — максимум шкалы, незачёт — минимум', () => {
    expect(choiceNumericValue(passFail, 'Зачёт')).toBe(1);
    expect(choiceNumericValue(passFail, 'Незачёт')).toBe(0);
  });

  it('без распознанного диапазона отметки раскладываются равномерно, первая — высшая', () => {
    const custom = {
      gradingType: 'custom' as const,
      scale: { min: 0, max: 10, labels: { Отлично: '', Хорошо: '', Плохо: '' } },
      passThreshold: 5,
    };
    expect(choiceNumericValue(custom, 'Отлично')).toBe(10);
    expect(choiceNumericValue(custom, 'Хорошо')).toBe(5);
    expect(choiceNumericValue(custom, 'Плохо')).toBe(0);
  });

  it('диапазон, не влезающий в шкалу, заменяется равномерным раскладом', () => {
    // Буквенные подписи от 100-балльной шкалы на шкале 0–5: «A» = 95 дала бы
    // средний балл под 1900%, а зажатие по максимуму уравняло бы A и F.
    const small = { ...letter, scale: { ...letter.scale, min: 0, max: 5 } };
    expect(choiceNumericValue(small, 'A')).toBe(5);
    expect(choiceNumericValue(small, 'C')).toBe(2.5);
    expect(choiceNumericValue(small, 'F')).toBe(0);
  });

  it('чужая отметка и числовая шкала числа не дают', () => {
    expect(choiceNumericValue(letter, 'Z')).toBeNull();
    expect(choiceNumericValue(fivePoint, '4')).toBeNull();
    expect(choiceNumericValue(letter, '')).toBeNull();
  });
});

describe('entryNumericValue', () => {
  it('сохранённое число важнее пересчёта', () => {
    expect(entryNumericValue({ value: 88, displayValue: 'A' }, letter)).toBe(88);
  });

  it('старым отметкам без числа значение восстанавливается по шкале', () => {
    expect(entryNumericValue({ value: null, displayValue: 'B' }, letter)).toBe(84.5);
    expect(entryNumericValue({ value: null, displayValue: 'Зачёт' }, passFail)).toBe(1);
  });

  it('пустая ячейка остаётся вне среднего', () => {
    expect(entryNumericValue({ value: null }, letter)).toBeNull();
    expect(entryNumericValue(undefined, letter)).toBeNull();
    expect(entryNumericValue({ value: null, displayValue: 'B' }, null)).toBeNull();
  });

  it('«незачёт» считается нулём, а не отсутствием оценки', () => {
    expect(entryNumericValue({ value: null, displayValue: 'Незачёт' }, passFail)).toBe(0);
  });
});

describe('describeSchema', () => {
  it('называет пресет, а произвольную шкалу описывает диапазоном', () => {
    expect(describeSchema(fivePoint)).toBe('5-балльная');
    expect(describeSchema({ ...fivePoint, scale: { min: 0, max: 70 } })).toBe('Баллы 0–70');
    expect(describeSchema(null)).toBe('—');
  });
});

describe('getPreset', () => {
  it('пресеты доступны по id', () => {
    expect(getPreset('ielts')?.scale.max).toBe(9);
    expect(getPreset('nope')).toBeUndefined();
  });
});
