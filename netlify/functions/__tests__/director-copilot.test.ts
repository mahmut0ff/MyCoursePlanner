import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI layer (not exercised by buildDirectorSnapshot, but imported at module load).
vi.mock('../utils/ai', () => ({
  getModel: vi.fn(),
  hasGeminiKey: vi.fn().mockReturnValue(true),
  recordAiUsage: vi.fn(),
}));

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { adminDb } from '../utils/firebase-admin';
import { createNotification } from '../utils/notifications';
import { buildDirectorSnapshot, renderSnapshotText, remindOrgDebtors, sendDebtorDraft, toTelegramHtml } from '../utils/director-copilot';

/** Wrap plain objects as a Firestore-like query result (chainable .where, resolvable .get). */
function coll(docs: any[]) {
  const wrapped = docs.map((d: any, i: number) => ({ id: d.__id || `d${i}`, data: () => d }));
  const obj: any = {
    where: vi.fn(() => obj),
    get: vi.fn().mockResolvedValue({ docs: wrapped, size: wrapped.length, empty: wrapped.length === 0 }),
  };
  return obj;
}

describe('buildDirectorSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  const now = new Date();
  const dayISO = (offsetDays: number) => new Date(now.getTime() - offsetDays * 86400000).toISOString();
  const thisMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const lastMonthDate = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-15`;
  const joinedThisMonth = new Date(now.getFullYear(), now.getMonth(), 2).toISOString();

  function wire() {
    const txDocs = [
      { type: 'income', amount: 800, date: thisMonthDate },
      { type: 'income', amount: 500, date: lastMonthDate },
      { type: 'expense', amount: 200, date: thisMonthDate },
    ];
    const planDocs = [
      { studentId: 's1', studentName: 'Иван', totalAmount: 300, paidAmount: 0, status: 'overdue', deadline: dayISO(10) },
      { studentId: 's2', studentName: 'Пётр', totalAmount: 100, paidAmount: 100, status: 'paid' }, // excluded (paid)
      { studentId: 's3', studentName: 'Ноль', totalAmount: 0, paidAmount: 0, status: 'pending' },   // excluded (no debt)
    ];
    const memberDocs = [
      { userId: 's1', role: 'student', status: 'active', userName: 'Иван', joinedAt: joinedThisMonth },
      { userId: 's4', role: 'student', status: 'active', userName: 'Азиз' },
      { userId: 't1', role: 'teacher', status: 'active', userName: 'Учитель' },
    ];
    const journalDocs = [
      { studentId: 's4', attendance: 'absent', date: dayISO(5).slice(0, 10) },
      { studentId: 's4', attendance: 'absent', date: dayISO(6).slice(0, 10) },
      { studentId: 's4', attendance: 'absent', date: dayISO(7).slice(0, 10) },
    ];
    const groupDocs = [{ name: 'A' }, { name: 'B' }];
    const leadDocs = [
      { name: 'Мария', phone: '0555', status: 'new', createdAt: dayISO(2) },
      { name: 'Старая', status: 'handled', createdAt: dayISO(40) },
    ];

    (adminDb.collection as any).mockImplementation((name: string) => {
      if (name === 'financeTransactions') return coll(txDocs);
      if (name === 'studentPaymentPlans') return coll(planDocs);
      if (name === 'journal') return coll(journalDocs);
      if (name === 'groups') return coll(groupDocs);
      if (name === 'orgMembers') return { doc: () => ({ collection: () => coll(memberDocs) }) };
      if (name === 'organizations') return { doc: () => ({ collection: () => coll(leadDocs) }) };
      return coll([]);
    });
  }

  it('aggregates finances by month with a delta vs last month', async () => {
    wire();
    const snap = await buildDirectorSnapshot('org1');
    expect(snap.incomeThis).toBe(800);
    expect(snap.incomeDelta).toBe(60); // 800 vs 500
    const s = renderSnapshotText(snap);
    expect(s).toContain('Доход за этот месяц: 800 с.');
    expect(s).toContain('+60%');
    expect(s).toContain('Расходы за этот месяц: 200 с.');
    expect(s).toContain('Чистая прибыль за этот месяц: 600 с.');
  });

  it('sums debt, lists debtors and excludes paid / zero-debt plans', async () => {
    wire();
    const snap = await buildDirectorSnapshot('org1');
    expect(snap.debtTotal).toBe(300);
    expect(snap.debtors).toHaveLength(1);
    const s = renderSnapshotText(snap);
    expect(s).toContain('должников всего: 1');
    expect(s).toContain('Иван: 300 с.');
    expect(s).not.toContain('Пётр');
    expect(s).not.toContain('Ноль');
  });

  it('counts active students / new-this-month / teachers / groups', async () => {
    wire();
    const s = renderSnapshotText(await buildDirectorSnapshot('org1'));
    expect(s).toContain('Активных учеников: 2');
    expect(s).toContain('Новых учеников в этом месяце: 1');
    expect(s).toContain('Преподавателей: 1');
    expect(s).toContain('Групп: 2');
  });

  it('flags at-risk students by absences and overdue payment', async () => {
    wire();
    const snap = await buildDirectorSnapshot('org1');
    expect(snap.atRisk).toHaveLength(2);
    const s = renderSnapshotText(snap);
    expect(s).toContain('В ЗОНЕ РИСКА (отток): всего 2');
    expect(s).toContain('Азиз — 3 пропусков');
    expect(s).toContain('Иван — просрочена оплата');
  });

  it('reports leads: new in 7 days, unhandled list', async () => {
    wire();
    const s = renderSnapshotText(await buildDirectorSnapshot('org1'));
    expect(s).toContain('Новых за 7 дней: 1');
    expect(s).toContain('Не обработано (статус «новая»): 1');
    expect(s).toContain('Мария (0555)');
  });
});

describe('toTelegramHtml — markdown bold in, safe HTML out, no double-escaping', () => {
  it('converts **bold** to <b>', () => {
    expect(toTelegramHtml('Доход **800** с.')).toBe('Доход <b>800</b> с.');
  });

  it('passes real <b>…</b> through untouched (idempotent — fixes the &lt;b&gt; bug)', () => {
    // The model (or a prior history turn) emitting real tags must NOT become &lt;b&gt;.
    expect(toTelegramHtml('В зоне риска <b>0</b> учеников.')).toBe('В зоне риска <b>0</b> учеников.');
    // Running the output back through is a no-op.
    expect(toTelegramHtml(toTelegramHtml('Заявок **2**'))).toBe('Заявок <b>2</b>');
  });

  it('escapes stray angle brackets and ampersands so Telegram HTML never breaks', () => {
    expect(toTelegramHtml('доход < расхода')).toBe('доход &lt; расхода');
    expect(toTelegramHtml('Иванов & Со')).toBe('Иванов &amp; Со');
  });

  it('escapes disallowed tags (only b/i/u/s/strong/em survive)', () => {
    expect(toTelegramHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('remindOrgDebtors', () => {
  beforeEach(() => vi.clearAllMocks());
  const today = new Date().toISOString().split('T')[0];

  it('notifies unpaid debtors, skips paid/zero-debt and those already reminded today', async () => {
    const planDocs = [
      { __id: 'p1', studentId: 's1', status: 'overdue', totalAmount: 300, paidAmount: 0, courseName: 'Англ' },
      { __id: 'p2', studentId: 's2', status: 'pending', totalAmount: 200, paidAmount: 50, lastDebtReminderDate: today }, // already today
      { __id: 'p3', studentId: 's3', status: 'paid', totalAmount: 100, paidAmount: 100 },                                 // paid
      { __id: 'p4', studentId: 's4', status: 'partial', totalAmount: 100, paidAmount: 100 },                              // zero debt
      { __id: 'p5', studentId: 's5', status: 'overdue', totalAmount: 500, paidAmount: 0 },
    ];
    const updates: Record<string, any> = {};
    const wrapped = planDocs.map(d => ({
      id: d.__id, data: () => d,
      ref: { update: vi.fn((u: any) => { updates[d.__id] = u; return Promise.resolve(); }) },
    }));
    const queryObj: any = { where: vi.fn(() => queryObj), get: vi.fn().mockResolvedValue({ docs: wrapped }) };
    (adminDb.collection as any).mockImplementation((name: string) => (name === 'studentPaymentPlans' ? queryObj : { where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })) }));

    const res = await remindOrgDebtors('org1');

    expect(res).toEqual({ sent: 2, skipped: 1 });
    expect(createNotification).toHaveBeenCalledTimes(2);
    const recipients = (createNotification as any).mock.calls.map((c: any[]) => c[0].recipientId).sort();
    expect(recipients).toEqual(['s1', 's5']);
    // Reminded plans get stamped so the daily cron / a double-tap won't re-nudge today.
    expect(updates['p1']).toEqual({ lastDebtReminderDate: today });
    expect(updates['p5']).toEqual({ lastDebtReminderDate: today });
    expect(updates['p2']).toBeUndefined();
  });
});

describe('sendDebtorDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the custom draft + each student\'s personal balance to every unpaid debtor', async () => {
    const planDocs = [
      { __id: 'p1', studentId: 's1', status: 'overdue', totalAmount: 300, paidAmount: 0 },
      { __id: 'p2', studentId: 's2', status: 'pending', totalAmount: 200, paidAmount: 50 }, // debt 150
      { __id: 'p3', studentId: 's3', status: 'paid', totalAmount: 100, paidAmount: 100 },    // excluded
      { __id: 'p4', studentId: 's4', status: 'partial', totalAmount: 100, paidAmount: 100 }, // zero debt
    ];
    const wrapped = planDocs.map(d => ({ id: d.__id, data: () => d, ref: { update: vi.fn() } }));
    const queryObj: any = { where: vi.fn(() => queryObj), get: vi.fn().mockResolvedValue({ docs: wrapped }) };
    (adminDb.collection as any).mockImplementation(() => queryObj);

    const res = await sendDebtorDraft('org1', 'Дорогие родители, напоминаем об оплате.');

    expect(res).toEqual({ sent: 2 });
    expect(createNotification).toHaveBeenCalledTimes(2);
    const calls = (createNotification as any).mock.calls.map((c: any[]) => c[0]);
    const s1 = calls.find((c: any) => c.recipientId === 's1');
    expect(s1.message).toContain('Дорогие родители, напоминаем об оплате.');
    expect(s1.message).toContain('300 с.');
    const s2 = calls.find((c: any) => c.recipientId === 's2');
    expect(s2.message).toContain('150 с.');
  });
});
