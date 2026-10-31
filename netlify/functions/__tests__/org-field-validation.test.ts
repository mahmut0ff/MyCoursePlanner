import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn(), batch: vi.fn(), getAll: vi.fn() },
  getDocsByIds: vi.fn(),
}));

import { normalizeChatLink, courseFieldsError, endsBeforeStart } from '../api-org';

describe('api-org field validation (QA 31.10.2026)', () => {
  it('normalizeChatLink: adds https, keeps http(s), rejects other schemes', () => {
    expect(normalizeChatLink('')).toBe('');
    expect(normalizeChatLink(undefined)).toBe('');
    expect(normalizeChatLink(' t.me/qa ')).toBe('https://t.me/qa');
    expect(normalizeChatLink('https://wa.me/1')).toBe('https://wa.me/1');
    expect(normalizeChatLink('javascript:alert(1)')).toBeNull();
    expect(normalizeChatLink('data:text/html,x')).toBeNull();
  });

  it('courseFieldsError: negative price and blank title are refused', () => {
    expect(courseFieldsError({ title: 'Математика', price: 3000 })).toBeNull();
    expect(courseFieldsError({ price: 0 })).toBeNull();
    expect(courseFieldsError({ price: -500 })).not.toBeNull();
    expect(courseFieldsError({ title: '   ' })).not.toBeNull();
  });

  it('endsBeforeStart: end must be after start', () => {
    expect(endsBeforeStart('12:00', '10:00')).toBe(true);
    expect(endsBeforeStart('10:00', '10:00')).toBe(true);
    expect(endsBeforeStart('10:00', '11:30')).toBe(false);
    expect(endsBeforeStart('10:00', undefined)).toBe(false);
  });
});
