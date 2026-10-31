/**
 * Захват ученика через самоназначение (QA 31.10.2026).
 *
 * «Вести» на чужой группе делало преподавателя её преподавателем без участия
 * администратора, а «ученик своей группы» — достаточное основание сменить ему
 * пароль. Вместе это давало вход под любым учеником организации. Теперь:
 *  • вступить в группу сам может только ведущий контингент (выйти — любой);
 *  • ученику с личной почтой пароль меняет только ведущий контингент, а
 *    преподавателю остаются логины, выданные центром (`…@student.sabakhub.app`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const groupUpdate = vi.fn().mockResolvedValue(undefined);
const updateUser = vi.fn().mockResolvedValue(undefined);
let studentEmail = 'kid@gmail.com';

const ownGroup = { organizationId: 'org-1', teacherIds: ['teacher-1'], studentIds: ['stud-1'] };

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: { updateUser: (...a: any[]) => updateUser(...a) },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'groups') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ organizationId: 'org-1', teacherIds: [] }) }),
            update: groupUpdate,
          })),
          where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [{ id: 'g1', data: () => ownGroup }] }) })),
        };
      }
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ email: studentEmail, offlineStudent: false }) }),
          })),
        };
      }
      // orgMembers/{org}/members/{uid}
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: 'student' }) }) })),
          })),
        })),
      };
    }),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn(), getOrgFilter: vi.fn(() => 'org-1'), resolveBranchFilter: vi.fn(() => null) };
});

import { verifyAuth } from '../utils/auth';
import { handler as orgHandler } from '../api-org';

const post = (action: string, body: object) => ({
  httpMethod: 'POST', queryStringParameters: { action }, headers: {}, body: JSON.stringify(body),
}) as any;

const asUser = (role: string, grants: string[]) => {
  (verifyAuth as any).mockResolvedValue({
    uid: 'teacher-1', role, organizationId: 'org-1', branchIds: [], primaryBranchId: null,
    rbac: new Set(grants), permissions: {}, customRoleId: null,
  });
};

const TEACHER = ['students:read', 'groups:read', 'groups:write'];

describe('teacherJoinGroup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('преподаватель не может сам вступить в чужую группу', async () => {
    asUser('teacher', TEACHER);
    const res: any = await orgHandler(post('teacherJoinGroup', { groupId: 'g2' }), {} as any);
    expect(res.statusCode).toBe(403);
    expect(groupUpdate).not.toHaveBeenCalled();
  });

  it('выйти из группы преподаватель может', async () => {
    asUser('teacher', TEACHER);
    const res: any = await orgHandler(post('teacherLeaveGroup', { groupId: 'g1' }), {} as any);
    expect(res.statusCode).toBe(200);
    expect(groupUpdate).toHaveBeenCalled();
  });

  it('ведущий контингент вступает сам', async () => {
    asUser('teacher', [...TEACHER, 'roster_management:write']);
    const res: any = await orgHandler(post('teacherJoinGroup', { groupId: 'g2' }), {} as any);
    expect(res.statusCode).toBe(200);
  });
});

describe('resetStudentPassword', () => {
  beforeEach(() => { vi.clearAllMocks(); studentEmail = 'kid@gmail.com'; });

  it('преподаватель не меняет пароль ученику с личной почтой', async () => {
    asUser('teacher', TEACHER);
    const res: any = await orgHandler(post('resetStudentPassword', { uid: 'stud-1', password: 'secret12' }), {} as any);
    expect(res.statusCode).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('преподаватель меняет пароль логину, выданному центром', async () => {
    asUser('teacher', TEACHER);
    studentEmail = 'aibek_7@student.sabakhub.app';
    const res: any = await orgHandler(post('resetStudentPassword', { uid: 'stud-1', password: 'secret12' }), {} as any);
    expect(res.statusCode).toBe(200);
    expect(updateUser).toHaveBeenCalledWith('stud-1', { password: 'secret12' });
  });

  it('ведущий контингент меняет пароль и на личной почте', async () => {
    asUser('manager', ['students:read', 'students:write']);
    const res: any = await orgHandler(post('resetStudentPassword', { uid: 'stud-1', password: 'secret12' }), {} as any);
    expect(res.statusCode).toBe(200);
  });
});
