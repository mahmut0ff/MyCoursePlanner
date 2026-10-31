import { describe, it, expect } from 'vitest';
import { isPlausiblePhone } from '../phone';

describe('isPlausiblePhone', () => {
  it('accepts empty and real numbers', () => {
    for (const p of ['', '  ', '+996 555 123 456', '0555 44-55-66', '(0312) 61 00 00']) expect(isPlausiblePhone(p)).toBe(true);
  });
  it('rejects junk and too short/long numbers', () => {
    for (const p of ['abc!!', 'zzz', '12345', '+1234567890123456']) expect(isPlausiblePhone(p)).toBe(false);
  });
});
