import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression suite for syncPaymentPlans (api-org.ts) — «этому студенту уже
 * выставлен счёт?».
 *
 * Множество «уже выставленных» строилось из ВСЕХ планов пары
 * (organizationId, courseId), без проверки статуса. Списанный план — тот, что
 * этот же файл помечает 'cancelled', когда студента убирают из группы с
 * нетронутым планом, — считался доказательством, что счёт есть. Отсюда тихая
 * потеря выручки: ушёл → списали → вернули в группу того же курса → счёт не
 * создаётся, студент учится бесплатно, и ни один отчёт об этом не скажет.
 *
 * Обратная сторона так же важна: списывать из множества можно РОВНО 'cancelled'.
 * Вернувшийся студент с оплаченным или частично оплаченным планом обязан этот
 * план сохранить — второй счёт за то же обучение это уже не потеря выручки, а
 * требование денег, которых академия не ждёт (ровно та жалоба, с которой всё
 * началось, только с другой стороны).
 */

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn(), batch: vi.fn(), getAll: vi.fn() },
  getDocsByIds: vi.fn(),
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
  notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
}));

import { syncPaymentPlans } from '../api-org';
import { adminDb } from '../utils/firebase-admin';

// ── Harness ──────────────────────────────────────────────────────
// Плоский двойник Firestore: курс по id, планы одним снапшотом, батч, который
// копит записи. Проверяем именно ЧТО записано — планы это деньги.

/** Записи, осевшие в batch.set() за прогон. */
let written: any[] = [];
/** Условия .where(), с которыми ушёл запрос планов — сторож equality-only. */
let planWhere: any[][] = [];

function wire(course: any | null, plans: any[]) {
  written = [];
  planWhere = [];

  const planQuery: any = {
    where: vi.fn((...args: any[]) => { planWhere.push(args); return planQuery; }),
    get: vi.fn().mockResolvedValue({
      docs: plans.map((p, i) => ({ id: p.__id || `p${i}`, data: () => p })),
    }),
  };

  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'courses') {
      return { doc: () => ({ get: async () => ({ exists: !!course, data: () => course }) }) };
    }
    if (name === 'studentPaymentPlans') {
      return { ...planQuery, doc: () => ({ __newDoc: true }) };
    }
    return planQuery;
  });

  (adminDb.batch as any).mockImplementation(() => ({
    set: (_ref: any, data: any) => { written.push(data); },
    commit: vi.fn().mockResolvedValue(undefined),
  }));
}

const COURSE = { title: 'Английский', price: 3000, paymentFormat: 'one-time', organizationId: 'org-1' };

/** План студента по курсу в заданном статусе. */
const plan = (studentId: string, status: string, paidAmount = 0) =>
  ({ studentId, status, totalAmount: 3000, paidAmount, organizationId: 'org-1', courseId: 'c1' });

beforeEach(() => vi.clearAllMocks());

// ═════════════════════════════════════════════════════════════════
// Возврат студента после списания
// ═════════════════════════════════════════════════════════════════

describe('re-enrolled student whose previous plan was written off', () => {
  it('gets a fresh plan — a cancelled plan is not proof of billing', async () => {
    wire(COURSE, [plan('s1', 'cancelled')]);
    await syncPaymentPlans('org-1', 'b1', 'c1', ['s1']);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      organizationId: 'org-1',
      branchId: 'b1',
      studentId: 's1',
      courseId: 'c1',
      totalAmount: 3000,
      paidAmount: 0,
      status: 'pending',
    });
  });

  it('is billed once, not once per cancelled plan it accumulated', async () => {
    // Ушёл и вернулся дважды — списанных планов два, счёт всё равно один.
    wire(COURSE, [plan('s1', 'cancelled'), plan('s1', 'cancelled')]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    expect(written).toHaveLength(1);
  });

  it('tags the fresh plan with a billing period on a monthly course', async () => {
    wire({ ...COURSE, paymentFormat: 'monthly' }, [plan('s1', 'cancelled')]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);

    expect(written).toHaveLength(1);
    expect(written[0].billingType).toBe('monthly');
    // Период нужен крону monthly-billing для дедупа — без него он выставит второй
    // счёт за тот же месяц.
    expect(written[0].period).toMatch(/^\d{4}-\d{2}$/);
    expect(written[0].deadline).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════
// Живой план — никогда не дублируется
// ═════════════════════════════════════════════════════════════════

describe('a returning student with a live plan is never double-billed', () => {
  it('does not duplicate a partially paid plan', async () => {
    wire(COURSE, [plan('s1', 'partial', 1500)]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    // Заплатил половину — второй счёт означал бы, что академия требует полную
    // сумму ещё раз поверх уже принятых денег.
    expect(written).toHaveLength(0);
  });

  it.each(['pending', 'paid', 'overdue'])('does not duplicate a %s plan', async (status) => {
    wire(COURSE, [plan('s1', status, status === 'paid' ? 3000 : 0)]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    expect(written).toHaveLength(0);
  });

  it('bills only the student who lacks a live plan', async () => {
    wire(COURSE, [plan('s1', 'paid', 3000), plan('s2', 'cancelled'), plan('s3', 'partial', 500)]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1', 's2', 's3', 's4']);

    // s2 — списан (счёт нужен), s4 — новичок. s1/s3 держат живые планы.
    expect(written.map((w) => w.studentId).sort()).toEqual(['s2', 's4']);
  });
});

// ═════════════════════════════════════════════════════════════════
// Границы, которые ломать нельзя
// ═════════════════════════════════════════════════════════════════

describe('syncPaymentPlans guards', () => {
  it('keeps the existing-plans query equality-only (no composite index deployed)', async () => {
    wire(COURSE, [plan('s1', 'cancelled')]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    // Статус фильтруется в JS. Появись здесь третий .where (или orderBy/limit) —
    // запрос потребует составного индекса, которого в проде нет.
    expect(planWhere).toEqual([
      ['organizationId', '==', 'org-1'],
      ['courseId', '==', 'c1'],
    ]);
  });

  it('creates nothing for a free course', async () => {
    wire({ ...COURSE, price: 0 }, [plan('s1', 'cancelled')]);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    expect(written).toHaveLength(0);
  });

  it('creates nothing when the course is gone or the roster is empty', async () => {
    wire(null, []);
    await syncPaymentPlans('org-1', null, 'c1', ['s1']);
    expect(written).toHaveLength(0);

    wire(COURSE, []);
    await syncPaymentPlans('org-1', null, 'c1', []);
    expect(written).toHaveLength(0);
  });
});
