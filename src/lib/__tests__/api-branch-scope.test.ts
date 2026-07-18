import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Firebase is imported transitively by api.ts; stub it so no real SDK boots.
vi.mock('../firebase', () => ({
  auth: { currentUser: null },
}));

import {
  setActiveBranchId,
  getActiveBranchId,
  orgGetStudents,
  orgListBranches,
  apiGetLessons,
  apiUpdateUser,
  adminGetDemoRequests,
} from '../api';

/** Last URL the api client fetched. */
const lastUrl = () => (globalThis.fetch as any).mock.calls.at(-1)?.[0] as string;
const lastInit = () => (globalThis.fetch as any).mock.calls.at(-1)?.[1] as RequestInit;

describe('api client — active branch scoping', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;
    setActiveBranchId(null);
  });

  afterEach(() => {
    setActiveBranchId(null);
  });

  it('sends no branchId under «Все филиалы»', async () => {
    await orgGetStudents();
    expect(lastUrl()).not.toContain('branchId');
  });

  it('stamps the active branch onto a scopable GET', async () => {
    setActiveBranchId('b2');
    await orgGetStudents();

    const url = new URL(lastUrl(), 'http://localhost');
    expect(url.searchParams.get('branchId')).toBe('b2');
    // The endpoint's own params must survive alongside it.
    expect(url.searchParams.get('action')).toBe('students');
  });

  it('scopes endpoints that never took a branch argument', async () => {
    setActiveBranchId('b2');
    await apiGetLessons();

    expect(new URL(lastUrl(), 'http://localhost').searchParams.get('branchId')).toBe('b2');
  });

  it('never scopes the branch list itself', async () => {
    // Self-filtering would collapse the switcher to the branch already selected,
    // leaving no way to switch back.
    setActiveBranchId('b2');
    await orgListBranches();

    expect(lastUrl()).not.toContain('branchId');
  });

  it('leaves non-allowlisted endpoints alone', async () => {
    setActiveBranchId('b2');
    await adminGetDemoRequests();

    expect(lastUrl()).not.toContain('branchId');
  });

  it('never stamps a mutation', async () => {
    // Auto-stamping a PUT would silently re-home the record being edited.
    setActiveBranchId('b2');
    await apiUpdateUser({ uid: 'u1', displayName: 'X' });

    expect(lastInit().method).toBe('PUT');
    expect(lastUrl()).not.toContain('branchId');
  });

  it('lets an explicit branchId win over the active selection', async () => {
    setActiveBranchId('b2');
    await orgGetStudents('b9');

    expect(new URL(lastUrl(), 'http://localhost').searchParams.get('branchId')).toBe('b9');
  });

  it('round-trips the active branch through the getter', () => {
    setActiveBranchId('b7');
    expect(getActiveBranchId()).toBe('b7');
    setActiveBranchId(null);
    expect(getActiveBranchId()).toBeNull();
  });
});
