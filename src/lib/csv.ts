/**
 * Общий экспорт в CSV. До него поля склеивались через шаблонную строку без
 * кавычек, поэтому любое описание расхода с запятой разъезжалось по столбцам.
 */

const NEEDS_QUOTING = /[",;\n\r]/;
// Excel и Sheets исполняют ячейку, начинающуюся с этих символов, как формулу.
// Описания расходов вводят сотрудники руками, так что риск реальный.
const FORMULA_PREFIX = /^[=+\-@]/;

export const escapeCsvCell = (value: unknown): string => {
  if (value == null) return '';
  let s = String(value);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  if (NEEDS_QUOTING.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const buildCsv = (headers: string[], rows: unknown[][]): string =>
  [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');

export const downloadCsv = (filename: string, csv: string): void => {
  // BOM — иначе Excel читает кириллицу как кракозябры.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Ссылку нужно вставить в документ: часть браузеров игнорирует click() у
  // элемента вне DOM.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Синхронный revoke успевает отменить ещё не начавшуюся загрузку.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Дата для выгрузки — всегда YYYY-MM-DD, без зависимости от локали машины. */
export const formatCsvDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
