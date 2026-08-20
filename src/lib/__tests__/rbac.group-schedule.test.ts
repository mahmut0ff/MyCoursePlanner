/**
 * Кнопки расписания в карточке группы должны появляться ровно там, где запрос
 * пройдёт сервер: иначе преподаватель жмёт «Добавить» и получает 403.
 *
 * Правило одно на два ресурса: `schedule` — расписание всей организации,
 * `group_schedule` — только та группа, где пользователь сам преподаёт. Здесь
 * проверяется клиентская половина (canEditGroupSchedule); серверная —
 * netlify/functions/__tests__/group-schedule-permission.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { canEditGroupSchedule, resolvePermissionSet, TEACHER_DEFAULT, expandPermissions } from '../rbac';
import type { RbacAction } from '../rbac';

/** `can` поверх плоского набора грантов — как в PermissionsContext. */
const canFrom = (grants: string[]) =>
  (resource: string, action: RbacAction) => grants.includes(`${resource}:${action}`);

describe('canEditGroupSchedule', () => {
  it('право на всё расписание работает в любой группе', () => {
    const can = canFrom(['schedule:write', 'schedule:delete']);
    expect(canEditGroupSchedule(can, 'write', false)).toBe(true);
    expect(canEditGroupSchedule(can, 'delete', false)).toBe(true);
  });

  it('узкое право — только в своей группе', () => {
    const can = canFrom(['group_schedule:write', 'group_schedule:delete']);
    expect(canEditGroupSchedule(can, 'write', true)).toBe(true);
    expect(canEditGroupSchedule(can, 'delete', true)).toBe(true);
    expect(canEditGroupSchedule(can, 'write', false)).toBe(false);
    expect(canEditGroupSchedule(can, 'delete', false)).toBe(false);
  });

  it('без обоих прав — ничего, даже в своей группе', () => {
    const can = canFrom(['schedule:read', 'groups:write']);
    expect(canEditGroupSchedule(can, 'write', true)).toBe(false);
    expect(canEditGroupSchedule(can, 'delete', true)).toBe(false);
  });

  it('действия не смешиваются: правка есть, удаления нет', () => {
    const can = canFrom(['group_schedule:write']);
    expect(canEditGroupSchedule(can, 'write', true)).toBe(true);
    expect(canEditGroupSchedule(can, 'delete', true)).toBe(false);
  });
});

describe('роль «Преподаватель» по умолчанию', () => {
  const set = expandPermissions(TEACHER_DEFAULT);

  it('правит расписание своих групп, но не расписание организации', () => {
    expect(set.has('group_schedule:write')).toBe(true);
    expect(set.has('group_schedule:delete')).toBe(true);
    expect(set.has('schedule:write')).toBe(false);
    expect(set.has('schedule:delete')).toBe(false);
    // Общую страницу расписания он по-прежнему открывает — только смотрит.
    expect(set.has('schedule:read')).toBe(true);
  });

  it('право снимается и возвращается через персональные исключения', () => {
    const revoked = resolvePermissionSet({
      baseRole: 'teacher',
      overrides: { revokes: [{ resource: 'group_schedule', actions: ['write', 'delete'] }] },
    });
    expect(revoked.has('group_schedule:write')).toBe(false);

    const granted = resolvePermissionSet({
      baseRole: 'teacher',
      overrides: { grants: [{ resource: 'schedule', actions: ['write'] }] },
    });
    expect(granted.has('schedule:write')).toBe(true);
  });
});
