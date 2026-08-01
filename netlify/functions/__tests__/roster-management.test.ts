/**
 * Право «ведение контингента»: кто может заводить студентов и распоряжаться
 * любыми группами, а не только своими.
 *
 * Здесь проверяется ровно граница привилегии: что она НЕ появилась у обычного
 * преподавателя сама собой (иначе выкатка молча сделала бы каждого учителя
 * менеджером групп) и что она НЕ подменяет собой гранулярность разделов
 * «Студенты» и «Группы» — объём действий по-прежнему задают их галочки.
 */
import { describe, it, expect, vi } from 'vitest';
import type { AuthUser, ManagerPermissions } from '../utils/auth';

// utils/auth тянет firebase-admin, который на импорте требует сервисный аккаунт.
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn() },
  getDocsByIds: vi.fn(),
}));

import { isRosterManager, can } from '../utils/auth';
import { resolvePermissionSet, expandPermissions, TEACHER_DEFAULT, MANAGER_DEFAULT } from '../utils/rbac';

const NO_PERMS: ManagerPermissions = { finances: false, settings: false, managers: false, branches: false };

function makeUser(role: AuthUser['role'], rbac: Set<string>): AuthUser {
  return {
    uid: 'caller-uid',
    email: 'user@example.com',
    role,
    displayName: 'User',
    organizationId: 'org-1',
    planId: 'pro',
    aiEnabled: false,
    branchIds: [],
    primaryBranchId: null,
    permissions: { ...NO_PERMS },
    customRoleId: null,
    rbac,
  };
}

const teacherWithDefaults = () => makeUser('teacher', resolvePermissionSet({ baseRole: 'teacher' }));

describe('roster_management в каталоге прав', () => {
  it('преподаватель по умолчанию его НЕ получает', () => {
    const set = expandPermissions(TEACHER_DEFAULT);
    expect(set.has('roster_management:write')).toBe(false);
    // и по-прежнему видит студентов, но не правит их
    expect(set.has('students:read')).toBe(true);
    expect(set.has('students:write')).toBe(false);
  });

  it('менеджер получает его по умолчанию — матрица не должна врать про его роль', () => {
    expect(expandPermissions(MANAGER_DEFAULT).has('roster_management:write')).toBe(true);
  });

  it('выдаётся преподавателю точечным override, вместе с CRUD по студентам и группам', () => {
    const set = resolvePermissionSet({
      baseRole: 'teacher',
      overrides: {
        grants: [
          { resource: 'roster_management', actions: ['write'] },
          { resource: 'students', actions: ['write', 'delete'] },
          { resource: 'groups', actions: ['delete'] },
        ],
      },
    });
    expect(set.has('roster_management:write')).toBe(true);
    expect(set.has('students:write')).toBe(true);
    expect(set.has('students:delete')).toBe(true);
    expect(set.has('groups:write')).toBe(true);  // из базы преподавателя
    expect(set.has('groups:delete')).toBe(true);
  });
});

describe('isRosterManager', () => {
  it('обычный преподаватель — нет (поведение существующих учителей не меняется)', () => {
    expect(isRosterManager(teacherWithDefaults())).toBe(false);
  });

  it('админ и менеджер — да, по роли', () => {
    expect(isRosterManager(makeUser('admin', new Set()))).toBe(true);
    expect(isRosterManager(makeUser('manager', new Set()))).toBe(true);
    expect(isRosterManager(makeUser('super_admin', new Set()))).toBe(true);
  });

  it('преподаватель с roster_management:write — да', () => {
    const u = makeUser('teacher', new Set(['groups:read', 'groups:write', 'roster_management:write']));
    expect(isRosterManager(u)).toBe(true);
  });

  it('привилегия не подменяет гранулярность: без students:write заводить студентов всё равно нельзя', () => {
    const u = makeUser('teacher', new Set(['students:read', 'roster_management:write']));
    expect(isRosterManager(u)).toBe(true);
    expect(can(u, 'students', 'write')).toBe(false);
  });

  it('и наоборот: students:write без привилегии не открывает контингент всей организации', () => {
    const u = makeUser('teacher', new Set(['students:read', 'students:write']));
    expect(isRosterManager(u)).toBe(false);
  });
});
