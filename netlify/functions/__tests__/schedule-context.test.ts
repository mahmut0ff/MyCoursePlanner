import { describe, it, expect, vi } from 'vitest';

// schedule-context тянет firebase-admin на загрузке модуля — глушим, чтобы
// чистые функции (развёртка дней и рендер) тестировались без Firestore.
vi.mock('../utils/firebase-admin', () => ({ adminDb: { collection: vi.fn(), getAll: vi.fn() } }));

import {
  expandSchedule, renderSchedule, scopeEvents, orgTodayISO,
  type ScheduleEventLite,
} from '../utils/schedule-context';

/** 2026-08-17 — понедельник (dayOfWeek = 0 в соглашении проекта). */
const MON_NOON_UTC = new Date('2026-08-17T06:00:00.000Z'); // полдень в Бишкеке

const weekly = (dayOfWeek: number, startTime: string, extra: Partial<ScheduleEventLite> = {}): ScheduleEventLite => ({
  recurring: true, dayOfWeek, date: null, startTime, title: 'Английский', ...extra,
});
const dated = (date: string, startTime: string, extra: Partial<ScheduleEventLite> = {}): ScheduleEventLite => ({
  recurring: false, dayOfWeek: null, date, startTime, title: 'Пробный урок', ...extra,
});

describe('expandSchedule — развёртка в календаре организации', () => {
  it('разворачивает еженедельное занятие в конкретные даты недели', () => {
    const occ = expandSchedule([weekly(2, '09:00')], { now: MON_NOON_UTC, days: 7 });
    expect(occ).toHaveLength(1);
    expect(occ[0].date).toBe('2026-08-19'); // среда
    expect(occ[0].weekday).toBe(2);
  });

  it('включает сегодняшний день целиком, даже если занятие уже прошло', () => {
    // 09:00 в понедельник — раньше «сейчас» (12:00), но на вопрос «что сегодня»
    // ответ должен содержать весь день, а не его остаток.
    const occ = expandSchedule([weekly(0, '09:00')], { now: MON_NOON_UTC, days: 7 });
    expect(occ.map(o => o.date)).toEqual(['2026-08-17']);
  });

  it('берёт разовые события по точной дате и отбрасывает прошедшие', () => {
    const occ = expandSchedule(
      [dated('2026-08-18', '15:00'), dated('2026-08-10', '15:00'), dated('2026-09-30', '15:00')],
      { now: MON_NOON_UTC, days: 7 },
    );
    expect(occ.map(o => o.date)).toEqual(['2026-08-18']);
  });

  it('сортирует занятия внутри дня по времени начала', () => {
    const occ = expandSchedule(
      [weekly(0, '18:00', { title: 'Вечер' }), dated('2026-08-17', '08:30', { title: 'Утро' }), weekly(0, '12:00', { title: 'День' })],
      { now: MON_NOON_UTC, days: 1 },
    );
    expect(occ.map(o => o.title)).toEqual(['Утро', 'День', 'Вечер']);
  });

  it('пропускает события без пригодного времени', () => {
    const occ = expandSchedule(
      [weekly(0, ''), weekly(0, '25:00'), weekly(0, 'утром' as any)],
      { now: MON_NOON_UTC, days: 7 },
    );
    expect(occ).toHaveLength(0);
  });

  it('переносит окно через границу месяца', () => {
    // Четверг 27.08 + 7 дней = окно 27.08–02.09; понедельник в нём — 31.08.
    const occ = expandSchedule([weekly(0, '10:00')], { now: new Date('2026-08-27T06:00:00.000Z'), days: 7 });
    expect(occ.map(o => o.date)).toEqual(['2026-08-31']);
  });
});

describe('день считается по календарю организации (UTC+6), а не по UTC', () => {
  it('после 18:00 UTC «сегодня» — уже следующий день в Бишкеке', () => {
    // 19:00 UTC понедельника = 01:00 вторника по Бишкеку.
    const lateUtcMonday = new Date('2026-08-17T19:00:00.000Z');
    expect(orgTodayISO(lateUtcMonday)).toBe('2026-08-18');

    // Занятие вторника должно попасть в «сегодня», а не в «завтра».
    const occ = expandSchedule([weekly(1, '09:00')], { now: lateUtcMonday, days: 2 });
    expect(occ[0].date).toBe('2026-08-18');
    const text = renderSchedule([weekly(1, '09:00')], { now: lateUtcMonday, days: 2 });
    expect(text).toContain('Вторник, 18.08 (сегодня)');
  });
});

describe('renderSchedule — факты без домысла', () => {
  const events = [
    weekly(0, '09:00', { endTime: '10:30', title: 'Английский A2', groupName: 'A2-1', teacherName: 'Иванова', classroomName: 'каб. 3' }),
    weekly(1, '18:00', { title: 'Математика', groupName: 'M-1' }),
  ];

  it('группирует по дням, помечает сегодня и завтра, показывает пустые дни', () => {
    const out = renderSchedule(events, { now: MON_NOON_UTC, days: 3 });
    expect(out).toContain('Понедельник, 17.08 (сегодня):');
    expect(out).toContain('• 09:00–10:30 — Английский A2 · A2-1 · Иванова · каб. 3');
    expect(out).toContain('Вторник, 18.08 (завтра):');
    expect(out).toContain('Среда, 19.08: занятий нет');
  });

  it('скрывает имя преподавателя, когда это расписание самого преподавателя', () => {
    const out = renderSchedule(events, { now: MON_NOON_UTC, days: 1, showTeacher: false });
    expect(out).toContain('Английский A2 · A2-1 · каб. 3');
    expect(out).not.toContain('Иванова');
  });

  it('на пустом расписании отдаёт честный текст, а не пустую строку', () => {
    expect(renderSchedule([], { now: MON_NOON_UTC, emptyText: 'Занятий нет.' })).toBe('Занятий нет.');
  });

  it('экранирует данные в html-режиме, чтобы Telegram не сломал разбор', () => {
    const out = renderSchedule([weekly(0, '09:00', { title: 'Мама & сын <тест>' })], {
      now: MON_NOON_UTC, days: 1, format: 'html',
    });
    expect(out).toContain('<b>Понедельник, 17.08 (сегодня)</b>');
    expect(out).toContain('Мама &amp; сын &lt;тест&gt;');
  });

  it('обрывает слишком длинный список по строкам, а не по дням', () => {
    const many = Array.from({ length: 30 }, (_, i) => weekly(0, `${String(8 + (i % 12)).padStart(2, '0')}:00`));
    const out = renderSchedule(many, { now: MON_NOON_UTC, days: 2, maxLines: 10 });
    // Перегруженный понедельник показан частично, а не выброшен целиком.
    expect(out.split('\n').filter(l => l.startsWith('•'))).toHaveLength(10);
    expect(out).toContain('…дальше не показано; всего занятий за 2 дн.: 30');
  });
});

describe('scopeEvents — копилот не показывает больше, чем экран', () => {
  const events: ScheduleEventLite[] = [
    { ...weekly(0, '09:00'), groupId: 'g1' },
    { ...weekly(0, '10:00'), groupId: 'g2' },
    { ...weekly(0, '11:00'), groupId: 'g3', teacherId: 'me' },
    { ...weekly(0, '12:00'), groupId: null }, // общеорганизационное
  ];

  it('оставляет свои группы, личные занятия и общеорганизационные события', () => {
    const out = scopeEvents(events, { groupIds: ['g1'], teacherId: 'me' });
    expect(out.map(e => e.startTime)).toEqual(['09:00', '11:00', '12:00']);
  });

  it('умеет прятать общеорганизационные события', () => {
    const out = scopeEvents(events, { groupIds: ['g1'], includeOrgWide: false });
    expect(out.map(e => e.startTime)).toEqual(['09:00']);
  });

  it('без групп и без личных занятий не показывает чужое', () => {
    expect(scopeEvents(events, { groupIds: [], includeOrgWide: false })).toEqual([]);
  });
});
