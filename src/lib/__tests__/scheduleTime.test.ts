import { describe, it, expect } from 'vitest';
import {
  timeToMins, minsToTime, appDayOfWeek, slotSpan, slotsOverlap, freeGaps,
} from '../scheduleTime';

describe('timeToMins', () => {
  it('parses HH:MM', () => {
    expect(timeToMins('09:30')).toBe(570);
    expect(timeToMins('00:00')).toBe(0);
    expect(timeToMins('23:59')).toBe(1439);
  });

  it('returns null for missing or unparseable values', () => {
    expect(timeToMins('')).toBeNull();
    expect(timeToMins(null)).toBeNull();
    expect(timeToMins(undefined)).toBeNull();
    expect(timeToMins('abc')).toBeNull();
  });
});

describe('minsToTime', () => {
  it('formats and clamps to a single day', () => {
    expect(minsToTime(570)).toBe('09:30');
    expect(minsToTime(0)).toBe('00:00');
    expect(minsToTime(-30)).toBe('00:00');
    expect(minsToTime(99_999)).toBe('23:59');
  });
});

describe('appDayOfWeek', () => {
  it('maps a date to 0=Mon … 6=Sun', () => {
    expect(appDayOfWeek('2026-08-10')).toBe(0); // Monday
    expect(appDayOfWeek('2026-08-15')).toBe(5); // Saturday
    expect(appDayOfWeek('2026-08-16')).toBe(6); // Sunday
  });

  it('does not drift a day when parsing (the UTC-midnight trap)', () => {
    // new Date('2026-08-16') is UTC midnight; getDay() would read Saturday
    // in any timezone west of UTC. Field-by-field parsing must stay local.
    expect(appDayOfWeek('2026-08-16')).toBe(6);
    expect(appDayOfWeek('2026-01-01')).toBe(3); // Thursday
  });
});

describe('slotSpan', () => {
  it('uses the end time when present', () => {
    expect(slotSpan({ startTime: '09:00', endTime: '10:30' })).toEqual([540, 630]);
  });

  it('falls back to start + duration when the end time is empty', () => {
    expect(slotSpan({ startTime: '09:00', endTime: '', duration: 90 })).toEqual([540, 630]);
    expect(slotSpan({ startTime: '09:00' })).toEqual([540, 585]); // default 45m
  });

  it('returns null when the start is unusable', () => {
    expect(slotSpan({ startTime: '', endTime: '10:00' })).toBeNull();
  });

  it('never returns an end before the start', () => {
    expect(slotSpan({ startTime: '10:00', endTime: '09:00' })).toEqual([600, 600]);
  });
});

describe('slotsOverlap', () => {
  it('is false for back-to-back lessons', () => {
    expect(slotsOverlap(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' },
    )).toBe(false);
  });

  it('is false for two lessons on the same day at different hours', () => {
    // The regression this whole fix is about: a group may have 09:00 and 14:00.
    expect(slotsOverlap(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '14:00', endTime: '15:00' },
    )).toBe(false);
  });

  it('is true for a genuine intersection', () => {
    expect(slotsOverlap(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '09:30', endTime: '10:30' },
    )).toBe(true);
  });

  it('is true when a missing end time is filled in from duration', () => {
    expect(slotsOverlap(
      { startTime: '09:00', endTime: '', duration: 90 },
      { startTime: '10:00', endTime: '11:00' },
    )).toBe(true);
  });

  it('treats an unparseable event as non-colliding rather than blocking', () => {
    expect(slotsOverlap({ startTime: '' }, { startTime: '09:00', endTime: '10:00' })).toBe(false);
  });
});

describe('freeGaps', () => {
  const DAY_START = 8 * 60, DAY_END = 20 * 60;

  it('returns the whole day when nothing is booked', () => {
    expect(freeGaps([], DAY_START, DAY_END)).toEqual([[480, 1200]]);
  });

  it('carves out booked spans', () => {
    expect(freeGaps(
      [{ startTime: '09:00', endTime: '10:00' }, { startTime: '14:00', endTime: '15:00' }],
      DAY_START, DAY_END,
    )).toEqual([[480, 540], [600, 840], [900, 1200]]);
  });

  it('merges overlapping bookings instead of reopening a gap', () => {
    expect(freeGaps(
      [{ startTime: '09:00', endTime: '12:00' }, { startTime: '10:00', endTime: '11:00' }],
      DAY_START, DAY_END,
    )).toEqual([[480, 540], [720, 1200]]);
  });

  it('merges back-to-back bookings into one busy block', () => {
    expect(freeGaps(
      [{ startTime: '09:00', endTime: '10:00' }, { startTime: '10:00', endTime: '11:00' }],
      DAY_START, DAY_END,
    )).toEqual([[480, 540], [660, 1200]]);
  });

  it('drops gaps shorter than the requested minimum', () => {
    expect(freeGaps(
      [{ startTime: '08:00', endTime: '09:00' }, { startTime: '09:15', endTime: '20:00' }],
      DAY_START, DAY_END, 30,
    )).toEqual([]);
  });

  it('ignores bookings outside the window', () => {
    expect(freeGaps(
      [{ startTime: '06:00', endTime: '07:00' }, { startTime: '21:00', endTime: '22:00' }],
      DAY_START, DAY_END,
    )).toEqual([[480, 1200]]);
  });

  it('clips a booking that straddles the window edge', () => {
    expect(freeGaps([{ startTime: '07:00', endTime: '09:00' }], DAY_START, DAY_END))
      .toEqual([[540, 1200]]);
  });
});
