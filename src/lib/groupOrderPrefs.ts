import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user manual ordering of the groups list.
 *
 * This is **cosmetic only** — it reorders what one person sees, nothing else.
 * The order is not part of the group record, so dragging never writes to
 * Firestore and never changes what anyone else sees. Stored in localStorage
 * (per-device, like the sidebar's collapsed state) and scoped per user, so two
 * accounts on a shared machine don't inherit each other's arrangement.
 *
 * The stored value is a list of group ids. Groups it doesn't mention — ones
 * created since the last drag — sort to the top, matching both the server's
 * newest-first default and the create handler, which prepends.
 */

const KEY_PREFIX = 'planula_group_order';

const storageKey = (uid?: string | null) => (uid ? `${KEY_PREFIX}:${uid}` : KEY_PREFIX);

function read(uid?: string | null): string[] {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(uid: string | null | undefined, ids: string[]) {
  try {
    if (ids.length) {
      localStorage.setItem(storageKey(uid), JSON.stringify(ids));
    } else {
      localStorage.removeItem(storageKey(uid));
    }
  } catch {
    /* private mode / quota — the arrangement just won't persist */
  }
}

/** Fired on change so a second mounted list re-reads without a reload. `storage` only fires cross-tab. */
const CHANGE_EVENT = 'planula:group-order';

/**
 * Sort `items` by the stored order. Anything the order doesn't mention keeps its
 * incoming (server) order and leads, so a freshly created group stays visible at
 * the top instead of silently landing at the bottom of a long arrangement.
 */
export function applyGroupOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  const known: T[] = [];
  const fresh: T[] = [];
  for (const item of items) (rank.has(item.id) ? known : fresh).push(item);
  known.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...fresh, ...known];
}

/**
 * Rewrite `base` so that the ids in `moved` occupy their slots in the new
 * sequence, while every id NOT in `moved` keeps its absolute position.
 *
 * That invariant is what lets a drag stay correct when the list is filtered: the
 * rows hidden by a search — or by the branch switcher, or belonging to a branch
 * that isn't even loaded — hold their places instead of being shuffled or
 * dropped by a drag the user made somewhere else.
 */
function spliceOrder(base: string[], moved: string[]): string[] {
  const movedSet = new Set(moved);
  const result: string[] = [];
  let next = 0;
  for (const id of base) {
    if (movedSet.has(id)) {
      // A slot the moved subset owns — refill it from the new sequence.
      if (next < moved.length) result.push(moved[next++]);
    } else {
      result.push(id);
    }
  }
  // Ids the base didn't know about yet (newly created groups).
  while (next < moved.length) result.push(moved[next++]);
  return result;
}

/** Move `id` to where `overId` sits. Returns a new array. */
function moveTo(ids: string[], id: string, overId: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export interface GroupOrderPrefs {
  /** Sort a list of groups into this user's arrangement. */
  order: <T extends { id: string }>(items: T[]) => T[];
  /** True once the user has dragged anything — drives the "reset" affordance. */
  hasCustomOrder: boolean;
  /**
   * Record a drag.
   *
   * @param allIds   every loaded group, in the order currently on screen
   * @param movedIds the ids actually rendered (i.e. after search/filtering) — the
   *                 only ones the drag is allowed to reposition
   */
  reorder: (allIds: string[], movedIds: string[], activeId: string, overId: string) => void;
  /** Fall back to the server's newest-first order. */
  reset: () => void;
}

export function useGroupOrder(uid?: string | null): GroupOrderPrefs {
  const [stored, setStored] = useState<string[]>(() => read(uid));

  // Re-read when the account changes, so a switch never carries the previous
  // user's arrangement over.
  useEffect(() => { setStored(read(uid)); }, [uid]);

  useEffect(() => {
    const sync = () => setStored(read(uid));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);

  const commit = useCallback((next: string[]) => {
    write(uid, next);
    setStored(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [uid]);

  const reorder = useCallback((allIds: string[], movedIds: string[], activeId: string, overId: string) => {
    const moved = moveTo(movedIds, activeId, overId);
    if (moved === movedIds) return;
    // Fold the loaded groups into what's on disk first: that keeps ids from
    // branches which aren't loaded right now, and gives the never-dragged case a
    // full base to splice into rather than an arrangement of the search hits alone.
    const base = spliceOrder(read(uid), allIds);
    commit(spliceOrder(base, moved));
  }, [uid, commit]);

  return {
    order: useCallback(<T extends { id: string }>(items: T[]) => applyGroupOrder(items, stored), [stored]),
    hasCustomOrder: stored.length > 0,
    reorder,
    reset: useCallback(() => commit([]), [commit]),
  };
}
