/**
 * Расписание по кабинетам. Инвариант, ради которого написан модуль: сумма
 * занятий по секциям равна входу — ни одно не потерялось и ни одно не удвоилось.
 */
import { describe, it, expect } from 'vitest';
import { groupByRoom, sectionKeyOf, roomFieldsOf, NO_ROOM } from '../scheduleRooms';
import type { Classroom, ScheduleEvent } from '../../types';

const room = (id: string, name: string, branchId: string | null = null): Classroom => ({
  id,
  organizationId: 'org',
  branchId,
  name,
  nameKey: name.toLowerCase(),
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

const lesson = (id: string, patch: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id,
  organizationId: 'org',
  type: 'lesson',
  title: `Урок ${id}`,
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  duration: 60,
  ...patch,
} as ScheduleEvent);

describe('sectionKeyOf', () => {
  const rooms = [room('c1', 'Каб. 305'), room('c2', 'Онлайн')];

  it('ссылка на кабинет решает всё', () => {
    expect(sectionKeyOf({ classroomId: 'c2', location: 'Каб. 305' }, rooms)).toBe('c2');
  });

  it('свободный текст подтягивается к кабинету справочника', () => {
    // «каб 305», «Кабинет №305» и «305» — тот же кабинет, что и «Каб. 305».
    expect(sectionKeyOf({ location: 'каб 305' }, rooms)).toBe('c1');
    expect(sectionKeyOf({ classroomName: '305' }, rooms)).toBe('c1');
  });

  it('подпись без кабинета в справочнике даёт свою секцию', () => {
    expect(sectionKeyOf({ location: 'Актовый зал' }, rooms)).toBe('txt:актовый зал');
  });

  it('занятие без подписи уходит в «без кабинета»', () => {
    expect(sectionKeyOf({ location: '   ' }, rooms)).toBe(NO_ROOM);
    expect(sectionKeyOf({}, rooms)).toBe(NO_ROOM);
  });

  it('ссылка на архивный кабинет не прячет занятие: работает подпись', () => {
    // Кабинет убрали в архив — справочник его больше не отдаёт, а занятия остались.
    expect(sectionKeyOf({ classroomId: 'gone', classroomName: 'Каб. 305' }, rooms)).toBe('c1');
    expect(sectionKeyOf({ classroomId: 'gone', classroomName: 'Склад' }, rooms)).toBe('txt:склад');
  });

  it('одноимённые кабинеты разных филиалов: занятие идёт в кабинет своего филиала', () => {
    const twins = [room('a', 'Каб. 301', 'branchA'), room('b', 'Каб. 301', 'branchB')];
    expect(sectionKeyOf({ location: 'Каб. 301', branchId: 'branchB' }, twins)).toBe('b');
    expect(sectionKeyOf({ location: 'Каб. 301', branchId: 'branchA' }, twins)).toBe('a');
    // Филиал у занятия не проставлен — детерминированно берём первый одноимённый.
    expect(sectionKeyOf({ location: 'Каб. 301' }, twins)).toBe('a');
  });
});

describe('groupByRoom', () => {
  const rooms = [room('c1', 'Каб. 305'), room('c2', 'Онлайн'), room('c3', 'Каб. 12')];

  const events = [
    lesson('e1', { classroomId: 'c1', classroomName: 'Каб. 305' }),
    lesson('e2', { location: 'каб 305' }),
    lesson('e3', { classroomId: 'c2', classroomName: 'Онлайн' }),
    lesson('e4', { location: 'Актовый зал' }),
    lesson('e5', {}),
  ];

  it('таблиц столько же, сколько кабинетов — пустые тоже на месте', () => {
    const sections = groupByRoom(events, rooms);
    const directory = sections.filter(s => s.kind === 'room');
    expect(directory.map(s => s.key)).toEqual(['c1', 'c2', 'c3']);
    expect(directory.find(s => s.key === 'c3')!.events).toEqual([]);
  });

  it('ни одно занятие не потеряно и не удвоено', () => {
    const sections = groupByRoom(events, rooms);
    const ids = sections.flatMap(s => s.events.map(e => e.id));
    expect(ids.sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('свободный текст лежит в секции своего кабинета', () => {
    const sections = groupByRoom(events, rooms);
    expect(sections.find(s => s.key === 'c1')!.events.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('«без кабинета» — последняя секция и только при наличии таких занятий', () => {
    const sections = groupByRoom(events, rooms);
    expect(sections[sections.length - 1].key).toBe(NO_ROOM);

    const withoutOrphans = groupByRoom(events.filter(e => e.id !== 'e5'), rooms);
    expect(withoutOrphans.some(s => s.key === NO_ROOM)).toBe(false);
  });

  it('секция вне справочника несёт исходную подпись', () => {
    const legacy = groupByRoom(events, rooms).find(s => s.kind === 'legacy')!;
    expect(legacy.title).toBe('Актовый зал');
    expect(legacy.events.map(e => e.id)).toEqual(['e4']);
  });

  it('без справочника всё сводится к одной секции «без кабинета»', () => {
    // Организация, ещё не заведшая кабинеты, должна видеть привычную одну таблицу.
    const sections = groupByRoom([lesson('x'), lesson('y')], []);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(NO_ROOM);
  });
});

describe('roomFieldsOf', () => {
  it('кабинет справочника: ссылка и подпись, location в синхроне', () => {
    const section = groupByRoom([], [room('c1', 'Каб. 305')])[0];
    expect(roomFieldsOf(section)).toEqual({
      classroomId: 'c1', classroomName: 'Каб. 305', location: 'Каб. 305',
    });
  });

  it('секция вне справочника остаётся свободным текстом', () => {
    const section = groupByRoom([lesson('e', { location: 'Актовый зал' })], [])
      .find(s => s.kind === 'legacy')!;
    expect(roomFieldsOf(section)).toEqual({
      classroomId: null, classroomName: 'Актовый зал', location: 'Актовый зал',
    });
  });

  it('«без кабинета» очищает поля, а не переносит подпись', () => {
    const section = groupByRoom([lesson('e')], [])[0];
    expect(roomFieldsOf(section)).toEqual({ classroomId: null, classroomName: '', location: '' });
  });
});
