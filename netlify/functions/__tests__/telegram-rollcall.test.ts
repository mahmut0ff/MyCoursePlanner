/**
 * Перекличка кнопками: права на группу, переключение «не был», сохранение —
 * журнал, запись «урок состоялся» (с дедупом по дню), уведомление отсутствующим.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db: Record<string, Map<string, any>> = {};
const col = (name: string) => (db[name] ||= new Map());
let autoId = 0;

function makeQuery(name: string, filters: Array<[string, any]> = []) {
  const q: any = {
    where: (f: string, _op: string, v: any) => makeQuery(name, [...filters, [f, v]]),
    limit: () => q,
    get: async () => {
      const docs = [...col(name)].filter(([, r]) => filters.every(([f, v]) => r[f] === v))
        .map(([id, r]) => ({ id, data: () => r, ref: docRef(name, id) }));
      return { docs, empty: docs.length === 0 };
    },
  };
  return q;
}
function docRef(name: string, id: string) {
  return {
    id,
    get: async () => ({ id, exists: col(name).has(id), data: () => col(name).get(id) }),
    set: async (v: any) => { col(name).set(id, v); },
    update: async (v: any) => { col(name).set(id, { ...col(name).get(id), ...v }); },
    delete: async () => { col(name).delete(id); },
  };
}

vi.mock('../utils/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      ...makeQuery(name),
      doc: (id: string) => docRef(name, id),
      add: async (v: any) => { const id = `auto-${++autoId}`; col(name).set(id, v); return docRef(name, id); },
    }),
    getAll: async (...refs: any[]) => Promise.all(refs.map(r => r.get())),
  },
}));
const notes: any[] = [];
vi.mock('../utils/notifications', () => ({ createNotification: vi.fn(async (n: any) => { notes.push(n); }) }));
const journalCalls: any[] = [];
vi.mock('../utils/copilot-actions', () => ({
  can: (s: any, r: string, a: string) => s.rbac.has(`${r}:${a}`),
  applyJournalUpserts: vi.fn(async (_s: any, date: string, items: any[]) => {
    journalCalls.push({ date, items });
    return { okIds: new Set(items.map((i: any) => i.entry.studentId)), failed: [] };
  }),
  logJournalActivity: vi.fn(async () => {}),
}));
vi.mock('../utils/schedule-context', async (orig) => ({
  ...(await orig<typeof import('../utils/schedule-context')>()),
  loadScheduleEvents: vi.fn(async () => [...col('scheduleEvents').values()]),
}));

import { startRollcall, toggleRollcall, saveRollcall, rollcallKeyboard, listRollcallGroups } from '../utils/telegram-rollcall';
import { orgTodayISO } from '../utils/schedule-context';

const ORG = 'org-1';
const teacher = (uid = 't1') => ({ uid, orgId: ORG, isDirector: false, rbac: new Set(['gradebook:write']) } as any);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  notes.length = 0;
  journalCalls.length = 0;
  col('groups').set('g1', { organizationId: ORG, name: 'English A', courseId: 'c1', courseName: 'English', teacherIds: ['t1'], studentIds: ['s1', 's2'], branchId: 'b1' });
  col('users').set('s1', { displayName: 'Айбек' });
  col('users').set('s2', { displayName: 'Данияр' });
});

describe('перекличка кнопками', () => {
  it('не пускает к чужой группе и без права на журнал', async () => {
    expect(await startRollcall(teacher('t2'), 'chat', 'g1')).toBe('Это не ваша группа.');
    expect(await startRollcall({ ...teacher(), rbac: new Set() }, 'chat', 'g1')).toMatch(/нет прав/);
  });

  it('по умолчанию все были; нажатие отмечает «не был»; сохранение пишет журнал, сессию и уведомление', async () => {
    const d = await startRollcall(teacher(), 'chat', 'g1');
    if (typeof d === 'string') throw new Error(d);
    expect(rollcallKeyboard(d).inline_keyboard[0].map(b => b.text)).toEqual(['✅ Айбек', '✅ Данияр']);

    const toggled = await toggleRollcall('chat', 't1', 1);
    expect(rollcallKeyboard(toggled!).inline_keyboard[0][1].text).toBe('❌ Данияр');

    const out = await saveRollcall(teacher(), 'chat');
    expect(out).toContain('Пришли: 1 из 2');
    expect(journalCalls[0].items.map((i: any) => [i.entry.studentId, i.patch.attendance]))
      .toEqual([['s1', 'present'], ['s2', 'absent']]);
    const sessions = [...col('lessonSessions').values()];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ organizationId: ORG, groupId: 'g1', date: orgTodayISO(), teacherId: 't1', headcount: 1, branchId: 'b1' });
    expect(notes).toEqual([expect.objectContaining({ recipientId: 's2', type: 'attendance_absent' })]);
    expect(col('rollcallDrafts').has('chat')).toBe(false);
  });

  it('повторная перекличка за день обновляет сессию, а не плодит вторую', async () => {
    await startRollcall(teacher(), 'chat', 'g1');
    await saveRollcall(teacher(), 'chat');
    await startRollcall(teacher(), 'chat', 'g1');
    await toggleRollcall('chat', 't1', 0);
    await saveRollcall(teacher(), 'chat');
    const sessions = [...col('lessonSessions').values()];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].headcount).toBe(1);
  });

  it('чужой черновик не сохраняется', async () => {
    await startRollcall(teacher(), 'chat', 'g1');
    expect(await saveRollcall(teacher('t9'), 'chat')).toMatch(/устарела/);
  });

  it('группы с занятием сегодня — первыми', async () => {
    col('groups').set('g0', { organizationId: ORG, name: 'Aaa', courseId: 'c2', teacherIds: ['t1'], studentIds: ['s1'] });
    col('scheduleEvents').set('e1', { groupId: 'g1', date: orgTodayISO(), startTime: '15:00' });
    const list = await listRollcallGroups(teacher());
    expect(list.map(g => g.label)).toEqual(['🟢 15:00 English A', 'Aaa']);
  });
});
