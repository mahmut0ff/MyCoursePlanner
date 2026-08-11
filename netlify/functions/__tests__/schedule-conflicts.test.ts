/**
 * Определение накладок в расписании.
 *
 * Проверяется в первую очередь граница ЛОЖНОЙ блокировки: администратор должен
 * иметь возможность поставить группе два урока в один день, а разовое занятие
 * из прошлого не должно навсегда занимать день недели у еженедельного урока.
 * Именно эти два случая читались пользователем как «такое занятие уже существует».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const events: any[] = [];
const classrooms: any[] = [];

/**
 * Мини-заглушка Firestore: цепочка .where().where().get().
 * Равенства применяются по-настоящему — иначе фильтр isVirtual в тесте был бы
 * фикцией и «виртуальные кабинеты не конфликтуют» проверялось бы вхолостую.
 */
function makeQuery(rows: () => any[], filters: Array<[string, any]> = []) {
  const q: any = {
    where: (field: string, op: string, value: any) =>
      op === '==' ? makeQuery(rows, [...filters, [field, value]]) : q,
    get: async () => ({
      docs: rows()
        .filter(r => filters.every(([f, v]) => r[f] === v))
        .map((r, i) => ({ id: r.id || `doc-${i}`, data: () => r })),
    }),
  };
  return q;
}

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) =>
      makeQuery(() => (name === 'classrooms' ? classrooms : events))),
  },
  getDocsByIds: vi.fn(),
}));

import { detectScheduleConflicts } from '../api-org';

const ORG = 'org-1';

/** Сегодняшняя дата и дата в прошлом, попадающие на один и тот же день недели. */
const today = new Date();
const todayIso = today.toISOString().slice(0, 10);
const appDow = (d: Date) => (d.getDay() + 6) % 7;
const pastSameWeekday = new Date(today.getTime() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);

/** Любой документ живёт в организации — запрос фильтрует по ней. */
const addEvent = (e: any) => { events.push({ organizationId: ORG, ...e }); };
const addClassroom = (c: any) => { classrooms.push({ organizationId: ORG, ...c }); };

beforeEach(() => { events.length = 0; classrooms.length = 0; });

describe('два занятия в один день', () => {
  it('НЕ считает накладкой второй урок той же группы в другое время', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', groupId: 'g1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '14:00', endTime: '15:00', groupId: 'g1',
    });

    expect(hits).toEqual([]);
  });

  it('НЕ считает накладкой занятия встык', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', groupId: 'g1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '10:00', endTime: '11:00', groupId: 'g1',
    });

    expect(hits).toEqual([]);
  });

  it('считает накладкой реальное пересечение по группе', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', groupId: 'g1', title: 'Алгебра' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:30', endTime: '10:30', groupId: 'g1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('group');
  });

  it('пустое время окончания достраивается из длительности', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '', duration: 90, groupId: 'g1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '10:00', endTime: '11:00', groupId: 'g1',
    });

    expect(hits).toHaveLength(1);
  });
});

describe('еженедельный урок против разовых событий', () => {
  it('разовое событие из ПРОШЛОГО не блокирует день недели', async () => {
    addEvent({ id: 'old', recurring: false, date: pastSameWeekday, startTime: '09:00', endTime: '10:00', teacherId: 't1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: appDow(today), date: null,
      startTime: '09:00', endTime: '10:00', teacherId: 't1',
    });

    expect(hits).toEqual([]);
  });

  it('но предстоящее разовое событие — блокирует', async () => {
    addEvent({ id: 'soon', recurring: false, date: todayIso, startTime: '09:00', endTime: '10:00', teacherId: 't1', title: 'Экзамен' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: appDow(today), date: null,
      startTime: '09:00', endTime: '10:00', teacherId: 't1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('teacher');
  });
});

describe('кабинет и филиалы', () => {
  it('одинаковое имя кабинета в РАЗНЫХ филиалах не конфликтует', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', location: 'Каб. 301', branchId: 'br-1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00', location: 'Каб. 301', branchId: 'br-2',
    });

    expect(hits).toEqual([]);
  });

  it('тот же кабинет в том же филиале — конфликтует', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', location: 'Каб. 301', branchId: 'br-1', title: 'Английский' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00', location: 'каб 301', branchId: 'br-1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('room');
  });

  it('преподаватель занят и в другом филиале — он физически один', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', teacherId: 't1', branchId: 'br-1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00', teacherId: 't1', branchId: 'br-2',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('teacher');
  });
});

describe('справочник кабинетов', () => {
  it('переехавшее и непереехавшее занятие узнают один кабинет', async () => {
    // Старое событие подписано только текстом, новое ссылается на справочник.
    // Если бы сравнивали по одному полю, они бы молча заняли один кабинет.
    addClassroom({ id: 'c1', name: 'Каб. 305', branchId: 'br-1' });
    addEvent({ id: 'old', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', location: 'каб 305', branchId: 'br-1', title: 'Химия' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00',
      classroomId: 'c1', classroomName: 'Каб. 305', location: 'Каб. 305', branchId: 'br-1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('room');
  });

  it('один classroomId конфликтует даже при разных подписях', async () => {
    addClassroom({ id: 'c1', name: 'Каб. 305', branchId: 'br-1' });
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', classroomId: 'c1', classroomName: 'Старое имя', branchId: 'br-1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00',
      classroomId: 'c1', classroomName: 'Каб. 305', branchId: 'br-1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('room');
  });

  it('виртуальный кабинет («Онлайн») вмещает сколько угодно занятий', async () => {
    addClassroom({ id: 'online', name: 'Онлайн', isVirtual: true, branchId: 'br-1' });
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', classroomId: 'online', classroomName: 'Онлайн', branchId: 'br-1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00',
      classroomId: 'online', classroomName: 'Онлайн', branchId: 'br-1',
    });

    expect(hits).toEqual([]);
  });

  it('но преподаватель в двух онлайн-занятиях сразу — всё ещё накладка', async () => {
    addClassroom({ id: 'online', name: 'Онлайн', isVirtual: true, branchId: 'br-1' });
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', classroomId: 'online', teacherId: 't1', branchId: 'br-1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00',
      classroomId: 'online', teacherId: 't1', branchId: 'br-1',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('teacher');
  });
});

describe('прочее', () => {
  it('редактируемое событие не конфликтует само с собой', async () => {
    addEvent({ id: 'self', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', groupId: 'g1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null,
      startTime: '09:00', endTime: '10:00', groupId: 'g1',
    }, 'self');

    expect(hits).toEqual([]);
  });

  it('без преподавателя, группы и кабинета конфликтовать нечему', async () => {
    addEvent({ id: 'a', recurring: true, dayOfWeek: 0, startTime: '09:00', endTime: '10:00', groupId: 'g1' });

    const hits = await detectScheduleConflicts(ORG, {
      recurring: true, dayOfWeek: 0, date: null, startTime: '09:00', endTime: '10:00',
    });

    expect(hits).toEqual([]);
  });
});
