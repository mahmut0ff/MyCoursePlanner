import { describe, it, expect } from 'vitest';
import { escapeCsvCell, buildCsv, formatCsvDate } from '../csv';

describe('escapeCsvCell', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCsvCell('Аренда')).toBe('Аренда');
    expect(escapeCsvCell(12500)).toBe('12500');
  });

  it('quotes a value with a comma or a semicolon', () => {
    expect(escapeCsvCell('Аренда, июль')).toBe('"Аренда, июль"');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvCell('Курс "Английский"')).toBe('"Курс ""Английский"""');
  });

  it('quotes a value with a newline', () => {
    expect(escapeCsvCell('строка1\nстрока2')).toBe('"строка1\nстрока2"');
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  // Описания расходов пишут сотрудники — формулу нельзя отдать Excel живой.
  it('neutralises a formula injection attempt', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
    expect(escapeCsvCell('+79001234567')).toBe("'+79001234567");
    expect(escapeCsvCell('-500')).toBe("'-500");
  });

  it('renders null and undefined as an empty cell', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('buildCsv', () => {
  it('joins with commas and CRLF', () => {
    const csv = buildCsv(['Дата', 'Описание'], [['2026-07-19', 'Аренда, июль']]);
    expect(csv).toBe('Дата,Описание\r\n2026-07-19,"Аренда, июль"');
  });
});

describe('formatCsvDate', () => {
  it('returns a stable YYYY-MM-DD', () => {
    expect(formatCsvDate('2026-07-19T10:30:00.000Z')).toBe('2026-07-19');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatCsvDate()).toBe('');
    expect(formatCsvDate('')).toBe('');
    expect(formatCsvDate('не дата')).toBe('');
  });
});
