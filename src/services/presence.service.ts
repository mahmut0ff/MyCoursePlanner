import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================
// Real-time presence (online / last-seen)
// ------------------------------------------------------------
// Firestore-only heartbeat model (this app has no Realtime DB, so
// there is no `onDisconnect`). Each signed-in client writes its own
// `presence/{uid}` doc every HEARTBEAT_INTERVAL_MS. A viewer derives
// "online" from freshness: a heartbeat newer than STALE_THRESHOLD_MS
// means online. A closed tab simply stops heartbeating and goes stale,
// which is what marks it offline — no server component required.
// ============================================================

export const PRESENCE_COLLECTION = 'presence';

/** How often a live client refreshes its own presence heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 45_000;

/**
 * A heartbeat older than this counts as offline. Kept comfortably above
 * 2× the interval so a backgrounded tab (whose timers browsers throttle
 * to ~once/minute) still lands a heartbeat before it looks offline.
 */
export const STALE_THRESHOLD_MS = 120_000;

export type PresenceState = 'online' | 'offline';

/** Reader-facing presence snapshot for a single user. */
export interface PresenceInfo {
  userId: string;
  state: PresenceState;
  /** Last heartbeat in epoch ms, or null if the server value hasn't resolved yet. */
  lastSeenMs: number | null;
}

interface PresenceDoc {
  userId: string;
  organizationId: string;
  state: PresenceState;
  lastSeen: Timestamp | null;
  updatedAt: Timestamp | null;
}

/**
 * Derive live online status from a presence snapshot and the current time.
 * Offline if: no record, an explicit `offline` state (clean logout/close),
 * or a heartbeat older than the stale threshold.
 */
export function computeIsOnline(info: PresenceInfo | undefined, nowMs: number): boolean {
  if (!info || info.lastSeenMs == null) return false;
  if (info.state === 'offline') return false;
  return nowMs - info.lastSeenMs < STALE_THRESHOLD_MS;
}

/**
 * Start writing the current user's presence heartbeat.
 *
 * Writes an immediate `online` beat, then refreshes on an interval, on tab
 * re-focus, and marks `offline` best-effort on tab close and on teardown
 * (logout / unmount). Returns a cleanup function — call it to stop.
 */
export function startPresenceHeartbeat(uid: string, organizationId: string): () => void {
  const ref = doc(db, PRESENCE_COLLECTION, uid);
  let stopped = false;

  const writeOnline = () => {
    if (stopped) return;
    void setDoc(
      ref,
      {
        userId: uid,
        organizationId,
        state: 'online',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {
      /* transient network / permission errors are non-fatal for presence */
    });
  };

  const writeOffline = () => {
    void setDoc(
      ref,
      { state: 'offline', lastSeen: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {});
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') writeOnline();
  };

  writeOnline();
  const intervalId = setInterval(writeOnline, HEARTBEAT_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    stopped = true;
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibility);
    // Explicit `offline` is written ONLY on teardown (logout / org switch).
    // Firebase auth changes propagate to every tab this user has open, so all
    // their heartbeats tear down together — no tab is wrongly marked offline.
    //
    // We deliberately do NOT write offline on tab close (`pagehide`): with a
    // single shared presence/{uid} doc, closing one of several open tabs would
    // flip a still-online user offline until another tab's next heartbeat. A
    // fully-closed session instead just stops beating and goes stale on its own.
    writeOffline();
  };
}

/**
 * Subscribe to presence for every member of an organization in real time.
 * Calls `onChange` with a `uid -> PresenceInfo` map on each update.
 * Returns an unsubscribe function.
 */
export function subscribeToOrgPresence(
  organizationId: string,
  onChange: (map: Map<string, PresenceInfo>) => void,
): () => void {
  const q = query(
    collection(db, PRESENCE_COLLECTION),
    where('organizationId', '==', organizationId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, PresenceInfo>();
      snap.forEach((d) => {
        // 'estimate' resolves a still-pending serverTimestamp (the writer's own
        // in-flight heartbeat) to a local estimate rather than null, so a client
        // never briefly computes itself offline between a beat and its server ack.
        const data = d.data({ serverTimestamps: 'estimate' }) as Partial<PresenceDoc>;
        map.set(d.id, {
          userId: d.id,
          state: data.state === 'offline' ? 'offline' : 'online',
          lastSeenMs: data.lastSeen ? data.lastSeen.toMillis() : null,
        });
      });
      onChange(map);
    },
    () => {
      /* keep the last known map on a subscription error */
    },
  );
}
