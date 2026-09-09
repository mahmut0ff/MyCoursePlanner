/**
 * Расписание под выбранным филиалом не должно ходить в Firestore за
 * композитным индексом, которого нет.
 *
 * Равенство по `branchId` вместе с диапазоном по `date` требует индекса
 * `branchId + organizationId + date`. В этом проекте индексы не деплоятся
 * (скрипты и CI везут только rules и storage), а для `scheduleEvents` объявлен
 * ровно один композит — `organizationId + date`. Пока branchId стоял в запросе,
 * выбор филиала в сайдбаре ронял страницу целиком: `9 FAILED_PRECONDITION`.
 *
 * Тест сторожит не результат, а форму запроса: филиал обязан сужаться в памяти.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Все where(), которые дошли до коллекции scheduleEvents. */
const whereCalls: Array<[string, string, any]> = [];
/** Что «лежит» в базе — отдаётся на любой запрос, сужение проверяем после. */
let stored: any[] = [];

const snapshot = () => ({
  docs: stored.map((e) => ({ id: e.id, data: () => e })),
});

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'scheduleEvents') {
        const chain: any = {
          where: vi.fn((field: string, op: string, value: any) => {
            whereCalls.push([field, op, value]);
            return chain;
          }),
          get: vi.fn(async () => snapshot()),
        };
        return chain;
      }
      const other: any = {
        where: vi.fn(() => other),
        get: vi.fn(async () => ({ docs: [] })),
        doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false, data: () => null })) })),
      };
      return other;
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

import { verifyAuth, resolveBranchFilter } from '../utils/auth';
import { handler as orgHandler } from '../api-org';

const asAdmin = () => {
  (verifyAuth as any).mockResolvedValue({
    uid: 'admin-1', role: 'admin', organizationId: 'org-1',
    branchIds: [], primaryBranchId: null, rbac: new Set(['schedule:read']),
    permissions: {}, customRoleId: null,
  });
};

const getSchedule = (params: Record<string, string>) => orgHandler({
  httpMethod: 'GET',
  queryStringParameters: { action: 'schedule', ...params },
  headers: {},
  body: null,
} as any, {} as any) as any;

const titles = (res: any) => JSON.parse(res.body).map((e: any) => e.title);
const fields = () => whereCalls.map(([f]) => f);

describe('расписание: филиал не попадает в запрос', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereCalls.length = 0;
    (resolveBranchFilter as any).mockReturnValue(null);
    stored = [
      { id: 'a', organizationId: 'org-1', branchId: 'br-1', date: '2026-09-10', title: 'Первый филиал' },
      { id: 'b', organizationId: 'org-1', branchId: 'br-2', date: '2026-09-11', title: 'Второй филиал' },
      { id: 'c', organizationId: 'org-1', branchId: null, date: '2026-09-12', title: 'Без филиала' },
    ];
  });

  it('под конкретным филиалом запрос остаётся в пределах organizationId + date', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue('br-1');

    const res = await getSchedule({ from: '2026-09-07', to: '2026-09-13', branchId: 'br-1' });

    expect(res.statusCode).toBe(200);
    // Ровно та комбинация, ради которой существует единственный объявленный
    // композит. branchId здесь означал бы индекс, которого нет.
    expect(fields()).toEqual(['organizationId', 'date', 'date']);
    expect(fields()).not.toContain('branchId');
  });

  it('сужение по филиалу всё равно происходит — строго, без записей без филиала', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue('br-1');

    const res = await getSchedule({ from: '2026-09-07', to: '2026-09-13', branchId: 'br-1' });

    expect(titles(res)).toEqual(['Первый филиал']);
  });

  it('мультифилиальному сотруднику видны его филиалы и занятия без филиала', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue(['br-2']);

    const res = await getSchedule({ from: '2026-09-07', to: '2026-09-13' });

    expect(fields()).not.toContain('branchId');
    expect(titles(res)).toEqual(['Второй филиал', 'Без филиала']);
  });

  it('«Все филиалы» отдаёт всё и тоже не трогает branchId', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue(null);

    const res = await getSchedule({ from: '2026-09-07', to: '2026-09-13' });

    expect(fields()).not.toContain('branchId');
    expect(titles(res)).toEqual(['Первый филиал', 'Второй филиал', 'Без филиала']);
  });

  it('в режиме сетки запрос — одни равенства, композит не нужен', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue('br-1');

    await getSchedule({ mode: 'timetable', branchId: 'br-1' });

    expect(fields()).toEqual(['organizationId', 'recurring']);
  });

  it('отказ по филиалу не доходит до базы', async () => {
    asAdmin();
    (resolveBranchFilter as any).mockReturnValue('__DENIED__');

    const res = await getSchedule({ from: '2026-09-07', to: '2026-09-13', branchId: 'чужой' });

    expect(JSON.parse(res.body)).toEqual([]);
    expect(whereCalls).toHaveLength(0);
  });
});
