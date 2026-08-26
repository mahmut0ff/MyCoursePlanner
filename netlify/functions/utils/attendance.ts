/**
 * Посещаемость — re-export общего модуля.
 *
 * Реализация и развёрнутое «почему» живут в `src/lib/attendance.ts`, чтобы у
 * SPA и функций было ОДНО определение «был на занятии»; здесь только точка
 * входа, в которой её ищет серверный читатель — ровно как у payment-plans.ts.
 */
export {
  attendanceMark,
  wasPresent,
  wasMissed,
  wasAbsent,
  countAttendance,
  attendanceRate,
} from '../../../src/lib/attendance';
export type { AttendanceMark, AttendanceCounts } from '../../../src/lib/attendance';
