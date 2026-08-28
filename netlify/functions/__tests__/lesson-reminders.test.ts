/**
 * Вечернее напоминание «завтра у вас N занятий».
 *
 * Главная проверка — что одно занятие попадает в письмо ОДИН раз. Преподаватель
 * почти всегда указан дважды: он состоит в group.teacherIds и записан в
 * ev.teacherId, — и в проде это давало третью строку в напоминании на два урока.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const events: any[] = [];
const groups: Record<string, any> = {};
const sent: any[] = [];

/** Мини-заглушка Firestore: цепочка .where().where().get() с настоящими равенствами. */
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
  adminDb: { collection: vi.fn(() => makeQuery(() => events)) },
  getDocsByIds: vi.fn(async (_c: string, ids: string[]) =>
    Object.fromEntries(ids.filter(id => groups[id]).map(id => [id, groups[id]]))),
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn(async (n: any) => { sent.push(n); }),
}));

import { handler } from '../lesson-reminders';

const ORG = 'org-1';
const TEACHER = 'teacher-1';

/** Завтрашний день в том же виде, в каком его считает сама функция. */
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
const tomorrowIso = tomorrow.toISOString().slice(0, 10);
const tomorrowDow = (tomorrow.getDay() + 6) % 7;

const run = () => handler({ httpMethod: 'POST' } as any, {} as any, () => {}) as Promise<any>;
const forTeacher = () => sent.find(n => n.recipientId === TEACHER);

beforeEach(() => {
  events.length = 0;
  sent.length = 0;
  for (const k of Object.keys(groups)) delete groups[k];
});

describe('напоминание о завтрашних занятиях', () => {
  it('не дублирует занятие, когда преподаватель и в группе, и в самом событии', async () => {
    groups['g1'] = { name: 'Prompt Engineering', teacherIds: [TEACHER], studentIds: ['s1'] };
    events.push({
      id: 'e1', organizationId: ORG, recurring: true, dayOfWeek: tomorrowDow,
      startTime: '16:00', title: 'Prompt Engineering', groupId: 'g1', teacherId: TEACHER,
    });

    await run();

    const note = forTeacher();
    expect(note.title).toBe('Завтра у вас 1 занятие');
    expect(note.message.match(/16:00/g)).toHaveLength(1);
  });

  it('не дублирует занятие, если один и тот же uid дважды лежит в teacherIds', async () => {
    groups['g1'] = { name: 'Группа', teacherIds: [TEACHER, TEACHER], studentIds: [] };
    events.push({
      id: 'e1', organizationId: ORG, recurring: true, dayOfWeek: tomorrowDow,
      startTime: '09:00', title: 'Урок', groupId: 'g1',
    });

    await run();

    expect(forTeacher().title).toBe('Завтра у вас 1 занятие');
  });

  it('не дублирует занятие, попавшее и в выборку повторяющихся, и в выборку по дате', async () => {
    groups['g1'] = { name: 'Группа', teacherIds: [TEACHER], studentIds: [] };
    // Порченые данные: у события проставлены оба поля, поэтому его вернут оба запроса.
    events.push({
      id: 'e1', organizationId: ORG, recurring: true, dayOfWeek: tomorrowDow, date: tomorrowIso,
      startTime: '11:00', title: 'Урок', groupId: 'g1',
    });

    await run();

    expect(forTeacher().title).toBe('Завтра у вас 1 занятие');
  });

  it('оставляет разные занятия отдельными строками и ведёт преподавателя в /schedule', async () => {
    groups['g1'] = { name: 'Группа A', teacherIds: [TEACHER], studentIds: ['s1'] };
    groups['g2'] = { name: 'Группа Б', teacherIds: [TEACHER], studentIds: [] };
    events.push(
      { id: 'e1', organizationId: ORG, recurring: true, dayOfWeek: tomorrowDow, startTime: '16:00', title: 'Группа A', groupId: 'g1', teacherId: TEACHER },
      { id: 'e2', organizationId: ORG, recurring: true, dayOfWeek: tomorrowDow, startTime: '10:00', title: 'Группа Б', groupId: 'g2', teacherId: TEACHER },
    );

    await run();

    const note = forTeacher();
    expect(note.title).toBe('Завтра у вас 2 занятия');
    expect(note.link).toBe('/schedule');
    // Отсортировано по времени и без повтора названия группы в скобках.
    expect(note.message.split('\n').slice(1)).toEqual(['• 10:00 — Группа Б', '• 16:00 — Группа A']);
    // Ученик своей группы получает своё напоминание — на одно занятие.
    const student = sent.find(n => n.recipientId === 's1');
    expect(student.title).toBe('Завтра у вас 1 занятие');
    expect(student.link).toBe('/student/schedule');
  });
});
