/**
 * Рассылка при запуске комнаты экзамена (решение 31.10.2026): «всем ученикам
 * организации» — только администрация; преподаватель уведомляет лишь свои группы.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const roomAdd = vi.fn().mockResolvedValue({ id: 'room-1' });
const notifyOrgStudents = vi.fn().mockResolvedValue(undefined);

vi.mock('../utils/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'groups') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ organizationId: 'org-1', teacherIds: id === 'own' ? ['teacher-1'] : ['other'], studentIds: [] }),
            }),
          })),
        };
      }
      return { add: roomAdd };
    }),
  },
}));

vi.mock('../utils/notifications', () => ({
  notifyOrgStudents: (...a: any[]) => notifyOrgStudents(...a),
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn() };
});

import { verifyAuth } from '../utils/auth';
import { handler } from '../api-rooms';

const create = (extra: object) => ({
  httpMethod: 'POST', queryStringParameters: {}, headers: {},
  body: JSON.stringify({ examId: 'e1', examTitle: 'Контрольная', ...extra }),
}) as any;

const asUser = (role: string) => (verifyAuth as any).mockResolvedValue({
  uid: 'teacher-1', role, organizationId: 'org-1', displayName: 'T',
  rbac: new Set(['rooms:read', 'rooms:write']), permissions: {},
});

describe('api-rooms create — кого можно уведомить', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('преподаватель не уведомляет всю организацию и комнату не создаёт', async () => {
    asUser('teacher');
    const res: any = await handler(create({ notifyOption: 'all' }), {} as any);
    expect(res.statusCode).toBe(403);
    expect(roomAdd).not.toHaveBeenCalled();
    expect(notifyOrgStudents).not.toHaveBeenCalled();
  });

  it('преподаватель не уведомляет чужую группу', async () => {
    asUser('teacher');
    const res: any = await handler(create({ notifyOption: 'group', notifyGroupId: 'foreign' }), {} as any);
    expect(res.statusCode).toBe(403);
    expect(roomAdd).not.toHaveBeenCalled();
  });

  it('преподаватель уведомляет свою группу', async () => {
    asUser('teacher');
    const res: any = await handler(create({ notifyOption: 'group', notifyGroupId: 'own' }), {} as any);
    expect(res.statusCode).toBe(200);
  });

  it('администратор уведомляет всю организацию', async () => {
    asUser('admin');
    const res: any = await handler(create({ notifyOption: 'all' }), {} as any);
    expect(res.statusCode).toBe(200);
    expect(notifyOrgStudents).toHaveBeenCalled();
  });
});
