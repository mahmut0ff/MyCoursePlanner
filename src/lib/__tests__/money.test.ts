import { describe, it, expect } from 'vitest';
import { formatMoney, formatMoneySigned, formatNumber, formatPercent, CURRENCY_SUFFIX } from '../money';

// Неразрывный узкий пробел — именно его ставит ru-RU как разделитель разрядов.
const nbsp = (s: string) => s.replace(/ | /g, ' ');

describe('formatMoney', () => {
  it('formats zero', () => {
    expect(formatMoney(0)).toBe(`0 ${CURRENCY_SUFFIX}`);
  });

  it('treats null and undefined as zero', () => {
    expect(formatMoney(null)).toBe(`0 ${CURRENCY_SUFFIX}`);
    expect(formatMoney(undefined)).toBe(`0 ${CURRENCY_SUFFIX}`);
    expect(formatMoney()).toBe(`0 ${CURRENCY_SUFFIX}`);
  });

  it('separates thousands', () => {
    expect(nbsp(formatMoney(12500))).toBe('12 500 с.');
    expect(nbsp(formatMoney(1234567))).toBe('1 234 567 с.');
  });

  it('keeps the minus on negatives', () => {
    expect(nbsp(formatMoney(-500))).toBe('-500 с.');
  });
});

describe('formatMoneySigned', () => {
  it('prefixes a real minus for negatives', () => {
    expect(nbsp(formatMoneySigned(-12500))).toBe('−12 500 с.');
  });

  it('prefixes a plus for positives and zero', () => {
    expect(nbsp(formatMoneySigned(300))).toBe('+300 с.');
    expect(formatMoneySigned(0)).toBe(`+0 ${CURRENCY_SUFFIX}`);
  });
});

describe('formatNumber', () => {
  it('formats counts without a currency suffix', () => {
    expect(nbsp(formatNumber(4200))).toBe('4 200');
    expect(formatNumber(null)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('signs the value', () => {
    expect(formatPercent(12)).toBe('+12%');
    expect(formatPercent(-4)).toBe('−4%');
    expect(formatPercent(0)).toBe('+0%');
  });

  it('rounds', () => {
    expect(formatPercent(12.4)).toBe('+12%');
  });

  // Прошлый период был нулевым: процент не определён.
  it('returns a dash for a null or non-finite input', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Infinity)).toBe('—');
    expect(formatPercent(NaN)).toBe('—');
  });
});
