/**
 * Ростер обязан отдавать ученика даже без поля `userId` в документе участника.
 *
 * Часть документов orgMembers ключуется самим uid и поля userId не несёт — это
 * не гипотеза, а установленный факт кодовой базы: `data.userId || d.id` стоит в
 * api-risk, debt-reminders, monthly-billing, payroll-accrual, risk-alerts,
 * director-copilot и ещё нескольких местах. В api-org запасного варианта не
 * было, и такой ученик получал uid: undefined.
 *
 * Последствия шли далеко за список: getDocsByIds отбрасывает пустые id
 * (`ids.filter(Boolean)`), поэтому профиль к нему не подтягивался, а на вкладке
 * «Оплаты за месяц» его начисление — у которого studentId на месте — рисовалось
 * строкой без имени. Именно эти строки выглядели как «неизвестный студент».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memberDocs: Array<{ id: string; data: () => any }> = [];

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          where: vi.fn(function self(this: any) { return this; }),
          get: vi.fn().mockResolvedValue({ docs: memberDocs }),
        })),
      })),
    })),
  },
  // Профили не нужны: проверяем только резолв uid.
  getDocsByIds: vi.fn().mockResolvedValue({}),
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

const event = (params: Record<string, string>) => ({
  httpMethod: 'GET',
  queryStringParameters: params,
  headers: {},
  body: null,
}) as any;

describe('api-org ?action=students — uid участника', () => {
  beforeEach(() => {
    memberDocs.length = 0;
    (verifyAuth as any).mockResolvedValue({
      uid: 'staff-1', role: 'admin', organizationId: 'org-1',
      branchIds: [], primaryBranchId: null, rbac: new Set(['students:read']),
      permissions: {}, customRoleId: null,
    });
  });

  it('ученик БЕЗ поля userId попадает в ростер под id своего документа', async () => {
    memberDocs.push({
      id: 'student-uid-1',
      data: () => ({ userName: 'Айгуль', role: 'student', status: 'active', branchIds: [] }),
    });

    const res: any = await orgHandler(event({ action: 'students' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].uid).toBe('student-uid-1');
    expect(rows[0].displayName).toBe('Айгуль');
  });

  it('поле userId, когда оно есть, по-прежнему выигрывает у id документа', async () => {
    memberDocs.push({
      id: 'membership-doc-id',
      data: () => ({ userId: 'real-uid', userName: 'Бакыт', role: 'student', status: 'active', branchIds: [] }),
    });

    const res: any = await orgHandler(event({ action: 'students' }), {} as any, () => {});
    const rows = JSON.parse(res.body);
    expect(rows[0].uid).toBe('real-uid');
  });
});
