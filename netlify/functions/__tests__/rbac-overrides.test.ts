import { describe, it, expect } from 'vitest';
import {
  applyOverrides,
  sanitizeOverrides,
  resolvePermissionSet,
  expandPermissions,
  MANAGER_DEFAULT,
} from '../utils/rbac';

describe('applyOverrides', () => {
  it('returns the base set unchanged when there are no overrides', () => {
    const base = new Set(['students:read', 'students:write']);
    expect(applyOverrides(base, null)).toEqual(base);
    expect(applyOverrides(base, { grants: [], revokes: [] })).toEqual(base);
  });

  it('adds granted resource:action pairs', () => {
    const base = new Set(['students:read']);
    const out = applyOverrides(base, { grants: [{ resource: 'finances', actions: ['read', 'write'] }] });
    expect(out.has('finances:read')).toBe(true);
    expect(out.has('finances:write')).toBe(true);
    expect(out.has('students:read')).toBe(true);
  });

  it('removes revoked resource:action pairs', () => {
    const base = new Set(['students:read', 'students:write', 'students:delete']);
    const out = applyOverrides(base, { revokes: [{ resource: 'students', actions: ['write', 'delete'] }] });
    expect(out.has('students:read')).toBe(true);
    expect(out.has('students:write')).toBe(false);
    expect(out.has('students:delete')).toBe(false);
  });

  it('does not mutate the original base set', () => {
    const base = new Set(['students:read']);
    applyOverrides(base, { grants: [{ resource: 'finances', actions: ['read'] }] });
    expect(base.has('finances:read')).toBe(false);
  });
});

describe('resolvePermissionSet with overrides', () => {
  it('layers grants and revokes on top of the manager default', () => {
    const set = resolvePermissionSet({
      baseRole: 'manager',
      overrides: {
        grants: [{ resource: 'finances', actions: ['read'] }],
        revokes: [{ resource: 'students', actions: ['delete'] }],
      },
    });
    // granted beyond the manager default
    expect(set.has('finances:read')).toBe(true);
    // revoked from the manager default (managers get students:delete by default)
    expect(expandPermissions(MANAGER_DEFAULT).has('students:delete')).toBe(true);
    expect(set.has('students:delete')).toBe(false);
    // untouched default grant survives
    expect(set.has('students:read')).toBe(true);
  });

  it('never lets an override restrict a full-access role', () => {
    const set = resolvePermissionSet({
      baseRole: 'admin',
      overrides: { revokes: [{ resource: 'finances', actions: ['read', 'write', 'delete'] }] },
    });
    expect(set.has('finances:read')).toBe(true);
    expect(set.has('finances:delete')).toBe(true);
  });
});

describe('sanitizeOverrides', () => {
  it('drops unknown resources and invalid actions', () => {
    const out = sanitizeOverrides({
      grants: [
        { resource: 'finances', actions: ['read', 'launch-missiles'] },
        { resource: 'not-a-real-resource', actions: ['read'] },
      ],
      revokes: [{ resource: 'students', actions: ['delete'] }],
    });
    expect(out.grants).toEqual([{ resource: 'finances', actions: ['read'] }]);
    expect(out.revokes).toEqual([{ resource: 'students', actions: ['delete'] }]);
  });

  it('returns empty arrays for garbage input', () => {
    expect(sanitizeOverrides(null)).toEqual({ grants: [], revokes: [] });
    expect(sanitizeOverrides({ grants: 'nope' })).toEqual({ grants: [], revokes: [] });
  });
});

describe('finance_overview — payments CRUD without the high-level view', () => {
  it('a payments-only custom role gets finances rwd but NOT the overview', () => {
    const set = resolvePermissionSet({
      baseRole: 'manager',
      customRole: { name: 'Кассир', permissions: [{ resource: 'finances', actions: ['read', 'write', 'delete'] }] },
    });
    // Operational payments CRUD is fully granted…
    expect(set.has('finances:read')).toBe(true);
    expect(set.has('finances:write')).toBe(true);
    expect(set.has('finances:delete')).toBe(true);
    // …while the aggregate income/profit view stays hidden — the whole point.
    expect(set.has('finance_overview:read')).toBe(false);
  });

  it('keeps the overview for a legacy manager whose finances toggle was on', () => {
    const set = resolvePermissionSet({ baseRole: 'manager', legacyManagerPerms: { finances: true } });
    expect(set.has('finances:read')).toBe(true);
    // Legacy finances was full access — enabling granular RBAC must not strip it.
    expect(set.has('finance_overview:read')).toBe(true);
  });

  it('gives full-access roles the overview automatically', () => {
    expect(resolvePermissionSet({ baseRole: 'admin' }).has('finance_overview:read')).toBe(true);
  });
});

/**
 * `expenses` — расходы академии отдельно от кассы.
 *
 * Раньше галочка «Финансы» разрешала и приём оплат, и трату денег организации, а
 * ленту расходов (включая зарплаты пофамильно) открывал finance_overview. Теперь
 * это своё право: кассиру его не выдают, а бухгалтеру можно выдать, не открывая
 * прибыль.
 */
describe('expenses — расходы академии отдельно от кассы', () => {
  it('кассир с полными правами «Финансы» расходы не получает', () => {
    const set = resolvePermissionSet({
      baseRole: 'manager',
      customRole: { name: 'Кассир', permissions: [{ resource: 'finances', actions: ['read', 'write', 'delete'] }] },
    });
    expect(set.has('finances:write')).toBe(true);
    expect(set.has('expenses:read')).toBe(false);
    expect(set.has('expenses:write')).toBe(false);
    expect(set.has('expenses:delete')).toBe(false);
  });

  it('расходы можно выдать без прибыли — это разные права', () => {
    const set = resolvePermissionSet({
      baseRole: 'manager',
      customRole: {
        name: 'Бухгалтер',
        permissions: [
          { resource: 'finances', actions: ['read'] },
          { resource: 'expenses', actions: ['read', 'write'] },
        ],
      },
    });
    expect(set.has('expenses:write')).toBe(true);
    expect(set.has('expenses:delete')).toBe(false);
    expect(set.has('finance_overview:read')).toBe(false);
  });

  it('менеджер со старой галочкой «финансы» расходы сохраняет', () => {
    // Legacy-тумблер означал полный доступ к финансам, включая расходы, — переход
    // на гранулярный RBAC не должен молча отнимать то, что уже работало.
    const set = resolvePermissionSet({ baseRole: 'manager', legacyManagerPerms: { finances: true } });
    expect(set.has('expenses:read')).toBe(true);
    expect(set.has('expenses:write')).toBe(true);
    expect(set.has('expenses:delete')).toBe(true);
  });

  it('менеджер по умолчанию (без галочки финансов) расходов не имеет', () => {
    const set = resolvePermissionSet({ baseRole: 'manager' });
    expect(set.has('expenses:read')).toBe(false);
  });

  it('полный доступ включает расходы автоматически', () => {
    expect(resolvePermissionSet({ baseRole: 'admin' }).has('expenses:delete')).toBe(true);
  });
});
