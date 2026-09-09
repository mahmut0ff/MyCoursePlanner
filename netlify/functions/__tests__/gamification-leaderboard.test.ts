/**
 * Таблица лидеров не должна читать коллекцию `gamification` целиком.
 *
 * Раньше читала — по всем организациям, без лимита, на каждый запрос. При 70
 * открытиях за полсуток это выедало суточную квоту чтений Firestore и валило
 * весь кабинет. Тест сторожит не только ответ, но и ФОРМУ чтения: стоимость
 * запроса обязана зависеть от размера организации, а не всей базы.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Коллекции, у которых вызвали .get() без единого where — то есть целиком. */
const fullScans: string[] = [];
/** Аргументы getDocsByIds: во что и по каким id ходили точечно. */
const batchGets: Array<{ collection: string; ids: string[] }> = [];

/** users/{id} организации. */
let students: Array<{ id: string; displayName: string }> = [];
/** gamification/{id} — игровые профили. */
let profiles: Record<string, any> = {};

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) => {
      let wheres = 0;
      const chain: any = {
        where: vi.fn(() => { wheres++; return chain; }),
        get: vi.fn(async () => {
          if (wheres === 0) fullScans.push(name);
          if (name !== 'users') return { docs: [], empty: true };
          return {
            empty: students.length === 0,
            docs: students.map((s) => ({ id: s.id, data: () => ({ displayName: s.displayName }) })),
          };
        }),
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false, data: () => null })),
          set: vi.fn(), update: vi.fn(),
        })),
        add: vi.fn(),
      };
      return chain;
    }),
  },
  getDocsByIds: vi.fn(async (collection: string, ids: string[]) => {
    batchGets.push({ collection, ids });
    const out: Record<string, any> = {};
    for (const id of ids) if (profiles[id]) out[id] = profiles[id];
    return out;
  }),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn() };
});

import { verifyAuth } from '../utils/auth';
import { handler as gamiHandler } from '../api-gamification';

const leaderboard = () => gamiHandler({
  httpMethod: 'GET',
  queryStringParameters: { action: 'leaderboard' },
  headers: {},
  body: null,
} as any, {} as any) as any;

describe('таблица лидеров', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fullScans.length = 0;
    batchGets.length = 0;
    (verifyAuth as any).mockResolvedValue({
      uid: 'me', role: 'student', organizationId: 'org-1',
      branchIds: [], primaryBranchId: null, rbac: new Set(), permissions: {}, customRoleId: null,
    });
    students = [
      { id: 's1', displayName: 'Первый' },
      { id: 's2', displayName: 'Второй' },
      { id: 's3', displayName: 'Третий' },
    ];
    profiles = {
      s1: { xp: 10, orgXpBreakdown: { 'org-1': 10 }, streak: 1 },
      s2: { xp: 90, orgXpBreakdown: { 'org-1': 90 }, streak: 4 },
      // s3 без профиля — обязан попасть в таблицу с нулём, а не исчезнуть.
    };
  });

  it('не читает коллекцию gamification целиком', async () => {
    await leaderboard();
    expect(fullScans).toEqual([]);
  });

  it('дочитывает профили точечно — только по студентам своей организации', async () => {
    await leaderboard();
    expect(batchGets).toEqual([{ collection: 'gamification', ids: ['s1', 's2', 's3'] }]);
  });

  it('сортирует по XP и не теряет студента без игрового профиля', async () => {
    const res = await leaderboard();
    const rows = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(rows.map((r: any) => [r.displayName, r.xp])).toEqual([
      ['Второй', 90],
      ['Первый', 10],
      ['Третий', 0],
    ]);
  });

  it('в организации без студентов — пустой список и ни одного лишнего чтения', async () => {
    students = [];

    const res = await leaderboard();

    expect(JSON.parse(res.body)).toEqual([]);
    expect(batchGets).toEqual([]);
    expect(fullScans).toEqual([]);
  });
});
