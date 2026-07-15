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
