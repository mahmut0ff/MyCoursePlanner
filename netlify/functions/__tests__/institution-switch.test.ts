/**
 * Переключатель типа заведения (Настройки → «Тип заведения»).
 *
 * Тип сохраняется сразу по клику, отдельным запросом `{ institutionType }`, —
 * значит сервер обязан принять частичное тело (раньше undefined-поля шли в
 * Firestore и роняли запрос уже после записи организации). И главное: курс без
 * своей схемы берёт шкалу из типа, поэтому смена типа не должна перешкалировать
 * уже выставленные оценки — такие курсы закрепляются на прежней шкале.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const org: Record<string, any> = {};
const orgUpdates: any[] = [];
const settingsWrites: any[] = [];
const courses: { id: string; organizationId: string }[] = [];
const schemas: { courseId: string; organizationId: string }[] = [];
const batchSets: any[] = [];

const query = (rows: () => any[]) => ({
  where: vi.fn(function self(this: any) { return this; }),
  get: vi.fn(async () => ({ docs: rows().map((r, i) => ({ id: r.id ?? `doc-${i}`, data: () => r })) })),
});

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'organizations') {
        return { doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => ({ ...org }) })),
          update: vi.fn(async (fields: any) => { orgUpdates.push(fields); Object.assign(org, fields); }),
        })) };
      }
      if (name === 'orgSettings') {
        return { doc: vi.fn(() => ({ set: vi.fn(async (data: any) => {
          // Firestore отвергает undefined — повторяем это поведение.
          if (Object.values(data).some((v) => v === undefined)) throw new Error('Cannot use "undefined" as a Firestore value');
          settingsWrites.push(data);
        }) })) };
      }
      if (name === 'courses') return query(() => courses);
      if (name === 'gradeSchemas') return { ...query(() => schemas), doc: vi.fn(() => ({ id: 'new-schema' })) };
      return query(() => []);
    }),
    batch: vi.fn(() => ({
      set: vi.fn((_ref: any, data: any) => { batchSets.push(data); }),
      commit: vi.fn(async () => {}),
    })),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn() };
});

import { verifyAuth } from '../utils/auth';
import { handler as orgHandler, institutionSwitchPlan } from '../api-org';

const saveSettings = (body: any) => orgHandler({
  httpMethod: 'POST',
  queryStringParameters: { action: 'updateOrgSettings' },
  headers: {},
  body: JSON.stringify(body),
} as any, {} as any) as any;

describe('смена типа заведения', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(org)) delete org[k];
    orgUpdates.length = 0; settingsWrites.length = 0; batchSets.length = 0;
    courses.length = 0; schemas.length = 0;
    (verifyAuth as any).mockResolvedValue({
      uid: 'admin-1', role: 'admin', organizationId: 'org-1',
      branchIds: [], primaryBranchId: null, rbac: new Set(), permissions: {}, customRoleId: null,
    });
  });

  it('частичное тело: сохраняет только тип, настройки не затирает undefined', async () => {
    org.institutionType = 'center';
    const res = await saveSettings({ institutionType: 'language' });

    expect(res.statusCode).toBe(200);
    expect(org.institutionType).toBe('language');
    expect(Object.keys(settingsWrites[0])).toEqual(['updatedAt']);
  });

  it('курсы без схемы закрепляются на прежней шкале, новым курсам — шкала нового типа', async () => {
    org.institutionType = 'center'; // старая орг. без defaultGradePresetId → 100 баллов
    courses.push({ id: 'math', organizationId: 'org-1' }, { id: 'eng', organizationId: 'org-1' });
    schemas.push({ courseId: 'eng', organizationId: 'org-1' });

    const res = await saveSettings({ institutionType: 'school' });

    expect(res.statusCode).toBe(200);
    expect(batchSets).toEqual([expect.objectContaining({
      courseId: 'math', organizationId: 'org-1', gradingType: 'points', scale: { min: 0, max: 100 }, passThreshold: 60,
    })]);
    expect(org).toMatchObject({ institutionType: 'school', defaultGradePresetId: 'five_point' });
  });

  it('тот же тип — ни схем, ни смены шкалы по умолчанию', async () => {
    org.institutionType = 'school';
    courses.push({ id: 'math', organizationId: 'org-1' });

    await saveSettings({ institutionType: 'school' });

    expect(batchSets).toHaveLength(0);
    expect(orgUpdates[0].defaultGradePresetId).toBeUndefined();
  });

  it('неизвестный тип — 400, ничего не записано', async () => {
    for (const bad of ['hacker', 'toString', '']) {
      const res = await saveSettings({ institutionType: bad });
      expect(res.statusCode).toBe(400);
    }
    expect(orgUpdates).toHaveLength(0);
    expect(settingsWrites).toHaveLength(0);
  });

  it('шкала совпадает — закреплять нечего', () => {
    // Новая орг. уже на 5 баллах: переход в «Школу» шкалу не меняет.
    expect(institutionSwitchPlan({ defaultGradePresetId: 'five_point' }, 'school'))
      .toEqual({ freezePresetId: null, nextPresetId: 'five_point' });
    // Устаревшее значение типа читается как «центр».
    expect(institutionSwitchPlan({ institutionType: 'language_school' }, 'center')).toBeNull();
  });
});
