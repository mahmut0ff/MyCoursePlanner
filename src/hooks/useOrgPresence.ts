import { useEffect, useState } from 'react';
import {
  computeIsOnline,
  subscribeToOrgPresence,
  type PresenceInfo,
} from '../services/presence.service';

/** How often the derived online/offline status is re-evaluated locally. */
const TICK_MS = 30_000;

export interface OrgPresence {
  /** Live `uid -> PresenceInfo` map for the organization. */
  map: Map<string, PresenceInfo>;
  /** True while a user's most recent heartbeat is still fresh. */
  isOnline: (uid: string) => boolean;
  /** Last-seen time in epoch ms, or null if unknown. */
  lastSeenMs: (uid: string) => number | null;
}

/**
 * Subscribe to real-time presence for everyone in `organizationId`.
 *
 * Combines a Firestore `onSnapshot` (fires when a heartbeat lands) with a
 * local clock tick, so a user who simply closes their tab — producing no new
 * snapshot — still transitions to offline once their heartbeat goes stale.
 */
export function useOrgPresence(organizationId: string | null | undefined): OrgPresence {
  const [map, setMap] = useState<Map<string, PresenceInfo>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!organizationId) return;
    const unsub = subscribeToOrgPresence(organizationId, setMap);
    // Reset on teardown so presence from a previous org can't linger after a switch.
    return () => {
      unsub();
      setMap(new Map());
    };
  }, [organizationId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return {
    map,
    isOnline: (uid: string) => computeIsOnline(map.get(uid), now),
    lastSeenMs: (uid: string) => map.get(uid)?.lastSeenMs ?? null,
  };
}
