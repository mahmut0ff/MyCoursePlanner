import { describe, it, expect, vi } from 'vitest';

// The service imports the Firebase `db`; stub it so importing doesn't init a real app.
vi.mock('../../lib/firebase', () => ({ db: {} }));

import { computeIsOnline, STALE_THRESHOLD_MS, type PresenceInfo } from '../presence.service';

const NOW = 1_700_000_000_000;
const info = (over: Partial<PresenceInfo> = {}): PresenceInfo => ({
  userId: 'u1',
  state: 'online',
  lastSeenMs: NOW,
  ...over,
});

describe('computeIsOnline', () => {
  it('is online for a fresh heartbeat', () => {
    expect(computeIsOnline(info({ lastSeenMs: NOW - 1_000 }), NOW)).toBe(true);
  });

  it('is offline once the heartbeat is older than the stale threshold', () => {
    expect(computeIsOnline(info({ lastSeenMs: NOW - (STALE_THRESHOLD_MS + 1) }), NOW)).toBe(false);
  });

  it('is online right at the edge of the threshold (exclusive upper bound)', () => {
    // now - lastSeen === threshold - 1  → still fresh
    expect(computeIsOnline(info({ lastSeenMs: NOW - (STALE_THRESHOLD_MS - 1) }), NOW)).toBe(true);
    // now - lastSeen === threshold      → stale
    expect(computeIsOnline(info({ lastSeenMs: NOW - STALE_THRESHOLD_MS }), NOW)).toBe(false);
  });

  it('is offline when the state is explicitly offline, even if recently seen', () => {
    expect(computeIsOnline(info({ state: 'offline', lastSeenMs: NOW }), NOW)).toBe(false);
  });

  it('is offline when there is no presence record', () => {
    expect(computeIsOnline(undefined, NOW)).toBe(false);
  });

  it('is offline when the server timestamp has not resolved yet (null lastSeen)', () => {
    expect(computeIsOnline(info({ lastSeenMs: null }), NOW)).toBe(false);
  });
});
