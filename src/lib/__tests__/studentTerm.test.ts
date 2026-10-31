import { describe, it, expect } from 'vitest';
import { applyStudentTerm } from '../studentTerm';

describe('applyStudentTerm', () => {
  it('ru: студент вне школы, ученик в школе, падежи сохраняются', () => {
    expect(applyStudentTerm('Добавить ученика · 3 учеников', 'ru', false)).toBe('Добавить студента · 3 студентов');
    expect(applyStudentTerm('Ученик создан', 'ru', false)).toBe('Студент создан');
    expect(applyStudentTerm('Добавить студента', 'ru', true)).toBe('Добавить ученика');
    expect(applyStudentTerm('Обучение', 'ru', false)).toBe('Обучение');
  });
  it('uz and en swap stems, kg is left alone', () => {
    expect(applyStudentTerm("O'quvchilar ro'yxati", 'uz', false)).toBe("Talabalar ro'yxati");
    expect(applyStudentTerm('talabaga', 'uz', true)).toBe("o'quvchiga");
    expect(applyStudentTerm('talab qilinadi', 'uz', true)).toBe('talab qilinadi');
    expect(applyStudentTerm('Add pupil', 'en', false)).toBe('Add student');
    expect(applyStudentTerm('Students', 'en', true)).toBe('Pupils');
    expect(applyStudentTerm('Окуучу кошуу', 'kg', false)).toBe('Окуучу кошуу');
  });
});
