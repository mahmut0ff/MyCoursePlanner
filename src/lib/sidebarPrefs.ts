import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user sidebar personalisation: which nav items this person has hidden.
 *
 * This is **cosmetic only** — hiding an item removes it from the menu, nothing
 * more. The page stays reachable by URL and the API is untouched. Access is owned
 * entirely by RBAC grants on /team, which are enforced server-side; nothing here
 * may be relied on to keep anyone out of anything.
 *
 * Stored in localStorage (so it is per-device, like the sidebar's collapsed state
 * in AppLayout) and scoped per user, so two accounts on a shared machine don't
 * inherit each other's menu.
 */

const KEY_PREFIX = 'planula_sidebar_hidden';

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
    /* private mode / quota — the preference just won't persist */
  }
}

/** Fired on change so the sidebar re-reads without a reload. `storage` only fires cross-tab. */
const CHANGE_EVENT = 'planula:sidebar-prefs';

export interface SidebarPrefs {
  /** Nav item ids the user has hidden. */
  hidden: string[];
  isHidden: (id: string) => boolean;
  toggle: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  /** Restore every item. */
  reset: () => void;
}

export function useSidebarPrefs(uid?: string | null): SidebarPrefs {
  const [hidden, setHiddenState] = useState<string[]>(() => read(uid));

  // Re-read when the account changes, so a switch never carries the previous
  // user's menu over.
  useEffect(() => { setHiddenState(read(uid)); }, [uid]);

  useEffect(() => {
    const sync = () => setHiddenState(read(uid));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);

  const commit = useCallback((next: string[]) => {
    write(uid, next);
    setHiddenState(next);
    // Keeps the settings card and the live sidebar in step within the same tab.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [uid]);

  const setHidden = useCallback((id: string, hide: boolean) => {
    const current = read(uid);
    const next = hide
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((x) => x !== id);
    commit(next);
  }, [uid, commit]);

  const toggle = useCallback((id: string) => {
    const current = read(uid);
    setHidden(id, !current.includes(id));
  }, [uid, setHidden]);

  const reset = useCallback(() => commit([]), [commit]);

  return {
    hidden,
    isHidden: useCallback((id: string) => hidden.includes(id), [hidden]),
    toggle,
    setHidden,
    reset,
  };
}
