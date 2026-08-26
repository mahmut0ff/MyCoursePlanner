/**
 * Посещаемость — единственное определение «был на занятии», общее для SPA и
 * Netlify-функций.
 *
 * ── Почему модуль вообще появился ──
 * Одна и та же метрика считалась ЧЕТЫРЬМЯ разными способами:
 *   • дашборд и риск  — (все − absent) / все        → «уважительная» = присутствие;
 *   • журнал, аналитика, рейтинг — (present + late) / все → «уважительная» = пропуск;
 *   • копилот ученика — (present + excused) / все   → опоздание = пропуск;
 *   • api-rating — раскладка по четырём счётчикам.
 * Директор видел на главной 94 %, открывал журнал того же центра и читал 88 %.
 * Расхождение не случайное: у каждой поверхности была своя строка `filter`.
 *
 * ── Канон ──
 * Присутствие = `present` + `late`. Опоздавший на занятии БЫЛ; отсутствующий по
 * уважительной причине — НЕ был, и занятие он пропустил, как бы уважительно это
 * ни выглядело в отчёте. Так уже считают журнал (JournalPage), аналитика
 * (AdminGradebookAnalytics), рейтинг (student-rating.ts) и подсчёт пришедших на
 * занятие (api-gradebook → lessonSessions.headcount) — то есть большинство
 * контура; меньшинство приводится к нему, а не наоборот.
 *
 * `excused` при этом не исчезает: он виден отдельным счётчиком в
 * `countAttendance`, и «уважительные» можно показать рядом с процентом.
 *
 * Живёт в `src/lib`, а не в `netlify/functions/utils`, ровно по той же причине,
 * что и payment-plans.ts: `tsconfig.app.json` покрывает только `src`, поэтому
 * из React-страницы недостижимо всё, что лежит под функциями, — а дубль и есть
 * то, как эти формулы разъехались. Без импортов: модуль тянут «горячие»
 * функции (api-dashboard, api-risk).
 */

export type AttendanceMark = 'present' | 'late' | 'excused' | 'absent';

/**
 * Отметка записи журнала, нормализованная.
 *
 * Пустое значение = 'present'. Это не догадка: так пишет и читает сам журнал
 * (`attendance: attendance || 'present'` в api-gradebook, `j.attendance ||
 * 'present'` в api-rating), поэтому легаси-запись без отметки обязана считаться
 * одинаково во всех агрегатах.
 */
export function attendanceMark(entry: any): AttendanceMark {
  const raw = entry?.attendance;
  if (raw === 'absent' || raw === 'late' || raw === 'excused') return raw;
  return 'present';
}

/** Был ли ученик на занятии: present или late. */
export function wasPresent(entry: any): boolean {
  const mark = attendanceMark(entry);
  return mark === 'present' || mark === 'late';
}

/** Пропустил ли занятие — включая уважительную причину (см. канон в шапке). */
export function wasMissed(entry: any): boolean {
  return !wasPresent(entry);
}

/** Отсутствие БЕЗ уважительной причины — то, что показывают как «прогулы». */
export function wasAbsent(entry: any): boolean {
  return attendanceMark(entry) === 'absent';
}

export interface AttendanceCounts {
  total: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** present + late — сколько раз ученик реально был на занятии. */
  attended: number;
}

/** Раскладка записей журнала по отметкам. */
export function countAttendance(entries: any[]): AttendanceCounts {
  const counts: AttendanceCounts = { total: 0, present: 0, late: 0, excused: 0, absent: 0, attended: 0 };
  for (const e of entries || []) {
    const mark = attendanceMark(e);
    counts.total++;
    counts[mark]++;
    if (mark === 'present' || mark === 'late') counts.attended++;
  }
  return counts;
}

/**
 * Процент посещаемости, 0..100, округлённый.
 *
 * `null` — записей нет, то есть считать нечего. Именно null, а не 0 и не 100:
 * «нет данных» и «не ходил» — разные ответы, и подставлять за вызывающего
 * какой-то из них значит выдумывать за него. Кому нужен нейтральный дефолт (в
 * риске отсутствие журнала не должно выглядеть прогулом), пишет `?? 100` явно.
 */
export function attendanceRate(entries: any[]): number | null {
  const { total, attended } = countAttendance(entries);
  if (!total) return null;
  return Math.round((attended / total) * 100);
}
