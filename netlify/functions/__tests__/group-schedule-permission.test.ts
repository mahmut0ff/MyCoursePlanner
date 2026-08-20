/**
 * «Расписание своих групп» (`group_schedule`) — узкое право преподавателя.
 *
 * Раньше занятие можно было поставить или снять только с `schedule:write` /
 * `schedule:delete`, а это право на расписание ВСЕЙ организации: выдавая его
 * преподавателю ради его же группы, центр открывал ему и общую страницу
 * /schedule с чужими занятиями. Отдельный ресурс разделяет не действия, а
 * область: с ним преподаватель правит только те группы, где сам числится в
 * составе, — то есть ровно то, что доступно ему из карточки группы.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** groups/{id} → данные группы. */
const groups: Record<string, any> = {};
/** scheduleEvents/{id} → данные занятия. */
const events: Record<string, any> = {};
const added: any[] = [];
const updated: any[] = [];
const deleted: string[] = [];

const docSnap = (id: string, store: Record<string, any>) => ({
  id,
  exists: store[id] !== undefined,
  data: () => store[id],
});

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'groups') {
        return { doc: vi.fn((id: string) => ({ get: vi.fn().mockResolvedValue(docSnap(id, groups)) })) };
      }
      if (name === 'scheduleEvents') {
        return {
          add: vi.fn(async (data: any) => { added.push(data); return { id: 'new-event' }; }),
          doc: vi.fn((id: string) => ({
            get: vi.fn().mockResolvedValue(docSnap(id, events)),
            update: vi.fn(async (fields: any) => { updated.push({ id, fields }); }),
            delete: vi.fn(async () => { deleted.push(id); }),
          })),
          // Проверка накладок ходит запросами — отдаём пустой результат.
          where: vi.fn(function self(this: any) { return this; }),
          get: vi.fn().mockResolvedValue({ docs: [] }),
        };
      }
      return {
        where: vi.fn(function self(this: any) { return this; }),
        get: vi.fn().mockResolvedValue({ docs: [] }),
        doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: false, data: () => null }) })),
      };
    }),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn(),
  notifyOrgAdmins: vi.fn(),
  notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return {
    ...actual,
    verifyAuth: vi.fn(),
    getOrgFilter: vi.fn(() => 'org-1'),
    resolveBranchFilter: vi.fn(() => null),
  };
});

import { verifyAuth } from '../utils/auth';
import { handler as orgHandler } from '../api-org';

const asUser = (role: string, grants: string[]) => {
  (verifyAuth as any).mockResolvedValue({
    uid: 'teacher-1', role, organizationId: 'org-1',
    branchIds: [], primaryBranchId: null, rbac: new Set(grants),
    permissions: {}, customRoleId: null,
  });
};

const call = (action: string, body: any) => orgHandler({
  httpMethod: 'POST',
  queryStringParameters: { action },
  headers: {},
  body: JSON.stringify(body),
} as any, {} as any) as any;

const LESSON = { title: 'Английский A1', startTime: '09:00', endTime: '10:20', recurring: true, dayOfWeek: 1 };

describe('group_schedule — расписание только своих групп', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    added.length = 0; updated.length = 0; deleted.length = 0;
    for (const k of Object.keys(groups)) delete groups[k];
    for (const k of Object.keys(events)) delete events[k];

    groups['mine'] = { organizationId: 'org-1', teacherIds: ['teacher-1'] };
    groups['alien'] = { organizationId: 'org-1', teacherIds: ['teacher-2'] };
    groups['other-org'] = { organizationId: 'org-2', teacherIds: ['teacher-1'] };
    events['ev-mine'] = { organizationId: 'org-1', groupId: 'mine', startTime: '09:00', title: 'Урок' };
    events['ev-alien'] = { organizationId: 'org-1', groupId: 'alien', startTime: '09:00', title: 'Урок' };
    events['ev-orgwide'] = { organizationId: 'org-1', groupId: null, startTime: '09:00', title: 'Собрание' };
  });

  it('ставит занятие в своей группе', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('createEvent', { ...LESSON, groupId: 'mine' });

    expect(res.statusCode).toBe(200);
    expect(added).toHaveLength(1);
    expect(added[0].groupId).toBe('mine');
  });

  it('в чужую группу — отказ', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('createEvent', { ...LESSON, groupId: 'alien' });

    expect(res.statusCode).toBe(403);
    expect(added).toHaveLength(0);
  });

  it('группа чужой организации не считается своей', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('createEvent', { ...LESSON, groupId: 'other-org' });

    expect(res.statusCode).toBe(403);
  });

  it('общеорганизационное событие (без группы) узким правом не создать', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('createEvent', { ...LESSON, groupId: null });

    expect(res.statusCode).toBe(403);
  });

  it('правит занятие своей группы', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('updateEvent', { id: 'ev-mine', startTime: '10:00', force: true });

    expect(res.statusCode).toBe(200);
    expect(updated[0].fields.startTime).toBe('10:00');
  });

  it('чужое занятие не правит', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('updateEvent', { id: 'ev-alien', startTime: '10:00', force: true });

    expect(res.statusCode).toBe(403);
    expect(updated).toHaveLength(0);
  });

  it('не утаскивает своё занятие в чужую группу', async () => {
    asUser('teacher', ['group_schedule:write']);

    const res = await call('updateEvent', { id: 'ev-mine', groupId: 'alien', force: true });

    expect(res.statusCode).toBe(403);
    expect(updated).toHaveLength(0);
  });

  it('удаляет занятие своей группы — и только с `delete`', async () => {
    asUser('teacher', ['group_schedule:write']);
    expect((await call('deleteEvent', { id: 'ev-mine' })).statusCode).toBe(403);

    asUser('teacher', ['group_schedule:write', 'group_schedule:delete']);
    const res = await call('deleteEvent', { id: 'ev-mine' });

    expect(res.statusCode).toBe(200);
    expect(deleted).toEqual(['ev-mine']);
  });

  it('чужое занятие не удаляет', async () => {
    asUser('teacher', ['group_schedule:delete']);

    const res = await call('deleteEvent', { id: 'ev-alien' });

    expect(res.statusCode).toBe(403);
    expect(deleted).toHaveLength(0);
  });

  it('без права вообще — отказ даже в своей группе', async () => {
    asUser('teacher', ['schedule:read']);

    expect((await call('createEvent', { ...LESSON, groupId: 'mine' })).statusCode).toBe(403);
    expect((await call('updateEvent', { id: 'ev-mine', force: true })).statusCode).toBe(403);
    expect((await call('deleteEvent', { id: 'ev-mine' })).statusCode).toBe(403);
  });

  it('право на всё расписание работает как прежде: любая группа и события без группы', async () => {
    asUser('manager', ['schedule:write', 'schedule:delete']);

    expect((await call('createEvent', { ...LESSON, groupId: 'alien' })).statusCode).toBe(200);
    expect((await call('updateEvent', { id: 'ev-orgwide', startTime: '11:00', force: true })).statusCode).toBe(200);
    expect((await call('deleteEvent', { id: 'ev-alien' })).statusCode).toBe(200);
  });
});
