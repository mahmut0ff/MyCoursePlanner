/**
 * Кабинеты: поведение + защита от расхождения двух копий хелпера.
 *
 * src/lib/classrooms.ts и netlify/functions/utils/classrooms.ts обязаны давать
 * одинаковый ответ: по ним независимо считают занятость клиент (подсветка сетки)
 * и сервер (отказ в двойном бронировании). Разъедутся — и UI покажет «свободно»
 * там, где API вернёт 409.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRoom, roomKeys, sameRoom } from '../classrooms';
import {
  normalizeRoom as srvNormalizeRoom,
  roomKeys as srvRoomKeys,
  sameRoom as srvSameRoom,
} from '../../../netlify/functions/utils/classrooms';

const NAMES = [
  'Каб. 305', 'каб 305', 'КАБИНЕТ №305', '305', 'Кабинет 305', 'Ауд. 305',
  'Аудитория английского', 'Кабинет', 'кабинет', 'Онлайн', 'Zoom',
  '  Каб.   12  ', 'Room 7', 'класс 1-А', '', '   ', null, undefined,
];

describe('normalizeRoom', () => {
  it('схлопывает разные написания одного кабинета', () => {
    const key = normalizeRoom('Каб. 305');
    expect(key).toBe('305');
    for (const n of ['каб 305', 'КАБИНЕТ №305', '305', 'Кабинет 305', 'Ауд. 305']) {
      expect(normalizeRoom(n)).toBe(key);
    }
  });

  it('схлопывает лишние пробелы', () => {
    expect(normalizeRoom('  Каб.   12  ')).toBe('12');
  });

  it('не превращает «Кабинет» в пустой ключ', () => {
    expect(normalizeRoom('Кабинет')).toBe('кабинет');
  });

  it('оставляет содержательные названия различимыми', () => {
    expect(normalizeRoom('Аудитория английского')).toBe('английского');
    expect(normalizeRoom('Аудитория немецкого')).toBe('немецкого');
    expect(normalizeRoom('Аудитория английского')).not.toBe(normalizeRoom('Аудитория немецкого'));
  });

  it('пустое остаётся пустым', () => {
    expect(normalizeRoom('')).toBe('');
    expect(normalizeRoom('   ')).toBe('');
    expect(normalizeRoom(null)).toBe('');
    expect(normalizeRoom(undefined)).toBe('');
  });
});

describe('roomKeys', () => {
  it('у события со справочным кабинетом два ключа', () => {
    expect(roomKeys({ classroomId: 'c1', classroomName: 'Каб. 305' })).toEqual(['id:c1', 'txt:305']);
  });

  it('у старого события только текстовый ключ', () => {
    expect(roomKeys({ location: 'Каб. 305' })).toEqual(['txt:305']);
  });

  it('без кабинета ключей нет', () => {
    expect(roomKeys({})).toEqual([]);
    expect(roomKeys({ location: '' })).toEqual([]);
  });

  it('classroomName перекрывает устаревший location', () => {
    expect(roomKeys({ classroomName: 'Каб. 7', location: 'Каб. 999' })).toEqual(['txt:7']);
  });
});

describe('sameRoom', () => {
  it('связывает переехавшее событие со старым по тексту', () => {
    // Ровно тот случай, ради которого ключей два: одно событие уже привязано
    // к справочнику, второе ещё нет — но кабинет-то физически один.
    expect(sameRoom({ classroomId: 'c1', classroomName: 'Каб. 305' }, { location: 'каб 305' })).toBe(true);
  });

  it('связывает два события по одному classroomId даже при разных подписях', () => {
    expect(sameRoom(
      { classroomId: 'c1', classroomName: 'Каб. 305' },
      { classroomId: 'c1', classroomName: 'Кабинет 305 (новый)' },
    )).toBe(true);
  });

  it('разные кабинеты не пересекаются', () => {
    expect(sameRoom({ classroomId: 'c1', classroomName: 'Каб. 305' }, { location: 'Каб. 306' })).toBe(false);
  });

  it('событие без кабинета ни с чем не конфликтует', () => {
    expect(sameRoom({}, { location: 'Каб. 305' })).toBe(false);
    expect(sameRoom({ location: 'Каб. 305' }, {})).toBe(false);
  });
});

describe('копии клиента и сервера не разъехались', () => {
  it('normalizeRoom совпадает на всей таблице', () => {
    for (const n of NAMES) {
      expect(normalizeRoom(n as any), `normalizeRoom(${JSON.stringify(n)})`)
        .toBe(srvNormalizeRoom(n as any));
    }
  });

  it('roomKeys совпадает', () => {
    for (const n of NAMES) {
      expect(roomKeys({ location: n as any })).toEqual(srvRoomKeys({ location: n as any }));
      expect(roomKeys({ classroomId: 'c1', classroomName: n as any }))
        .toEqual(srvRoomKeys({ classroomId: 'c1', classroomName: n as any }));
    }
  });

  it('sameRoom совпадает на всех парах', () => {
    for (const a of NAMES) {
      for (const b of NAMES) {
        expect(
          sameRoom({ location: a as any }, { location: b as any }),
          `sameRoom(${JSON.stringify(a)}, ${JSON.stringify(b)})`,
        ).toBe(srvSameRoom({ location: a as any }, { location: b as any }));
      }
    }
  });
});
