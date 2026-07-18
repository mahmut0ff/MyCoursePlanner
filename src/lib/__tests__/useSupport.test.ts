import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { SupportThread } from '../../types';

/**
 * The inbox's status tabs are filtered in memory rather than by a Firestore
 * `where` clause (see the note on useSupportThreads), so that filtering is real
 * logic now and needs cover of its own.
 */

let snapshotCb: ((snap: any) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...p: any[]) => ({ __path: p.slice(1).join('/') }),
  query: (c: any) => c,
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  doc: (...p: any[]) => ({ __path: p.slice(1).join('/') }),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'ts',
  onSnapshot: (_q: any, cb: any) => { snapshotCb = cb; return unsubscribe; },
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(), uploadBytesResumable: vi.fn(), getDownloadURL: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {}, storage: {}, auth: { currentUser: { uid: 'super_root' } },
}));

const { useSupportThreads } = await import('../useSupport');

function thread(id: string, status: SupportThread['status'], at: string): SupportThread {
  return {
    id, userId: id, userName: id, userEmail: `${id}@t.test`, userRole: 'teacher',
    organizationId: 'org', organizationName: 'Org', status,
    lastMessageAt: at, lastMessagePreview: 'p', lastMessageFrom: 'user',
    unreadForSupport: 0, unreadForUser: 0, createdAt: at, updatedAt: at,
  };
}

const FIXTURES = [
  thread('a', 'new', '2026-07-18T10:00:00.000Z'),
  thread('b', 'open', '2026-07-18T09:00:00.000Z'),
  thread('c', 'closed', '2026-07-18T08:00:00.000Z'),
  thread('d', 'new', '2026-07-18T07:00:00.000Z'),
];

function emit(items: SupportThread[]) {
  act(() => {
    snapshotCb?.({ docs: items.map((t) => ({ id: t.id, data: () => t })) });
  });
}

beforeEach(() => { snapshotCb = null; vi.clearAllMocks(); });

describe('useSupportThreads', () => {
  it('returns everything for "all" in the order Firestore gave', async () => {
    const { result } = renderHook(() => useSupportThreads('all'));
    emit(FIXTURES);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.threads.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('narrows to a single status without dropping order', async () => {
    const { result } = renderHook(() => useSupportThreads('new'));
    emit(FIXTURES);

    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    expect(result.current.threads.map((t) => t.id)).toEqual(['a', 'd']);
  });

  it('re-filters on a tab change without re-subscribing', async () => {
    const { result, rerender } = renderHook(
      ({ s }) => useSupportThreads(s as any),
      { initialProps: { s: 'all' } },
    );
    emit(FIXTURES);
    await waitFor(() => expect(result.current.threads).toHaveLength(4));

    rerender({ s: 'closed' });
    // Switching tabs must not tear down the listener — that would blank the
    // list and refetch on every click.
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(result.current.threads.map((t) => t.id)).toEqual(['c']);

    rerender({ s: 'all' });
    expect(result.current.threads).toHaveLength(4);
  });

  it('treats an absent status as "all"', async () => {
    const { result } = renderHook(() => useSupportThreads());
    emit(FIXTURES);
    await waitFor(() => expect(result.current.threads).toHaveLength(4));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useSupportThreads('all'));
    emit(FIXTURES);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
