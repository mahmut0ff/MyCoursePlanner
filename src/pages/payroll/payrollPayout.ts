/**
 * Сколько денег РЕАЛЬНО уйдёт из кассы по ведомости.
 *
 * Это зеркало функции allocatePayable из netlify/functions/api-payroll.ts, и
 * существует оно ровно потому, что «сумма finalMinor по всем строкам» — не та
 * цифра, которую увидит касса.
 *
 * Штраф лежит в ведомости отрицательной строкой, а расход в кассе строго
 * положителен. Сервер поэтому гасит штрафы учителя его же положительными
 * строками (от большей к меньшей, детерминированно) и никогда не пишет
 * отрицательный расход. Если штрафов больше, чем начислено, выплата по этому
 * учителю равна НУЛЮ, а остаток НЕ переносится никуда: удержания из уже
 * выданного продукт не делает.
 *
 * Из-за этого простая сумма всех finalMinor ЗАНИЖАЕТ выплату: минус одного
 * учителя, который на нём же и упирается в ноль, всё равно тянет общий итог
 * вниз. Директор увидел бы «к выплате 120 000», а касса отдала бы больше.
 *
 * Правило порядка гашения (по убыванию суммы, при равенстве — по id) повторено
 * буквально: от него зависит, какая строка попадёт в CSV с каким остатком.
 */

/** Минимум от PayrollLine, нужный для распределения. */
export interface PayoutLineInput {
  id: string;
  teacherId: string;
  teacherName?: string | null;
  finalMinor?: number | null;
}

/** Итог по одному преподавателю — в тех же терминах, что и расход в кассе. */
export interface TeacherPayout {
  teacherId: string;
  teacherName: string;
  /** Сумма положительных строк. */
  earnedMinor: number;
  /** Сумма штрафов, положительным числом. */
  penaltyMinor: number;
  /** Начислено нетто = earned − penalty. Может быть отрицательным. */
  netMinor: number;
  /** Что уйдёт из кассы: max(0, netMinor). */
  payableMinor: number;
  /** Штраф, который не из чего было удержать: max(0, −netMinor). */
  unrecoveredMinor: number;
}

export interface PayoutAllocation {
  /** Деньги, которые действительно покинут кассу. */
  payableMinor: number;
  /** Начислено нетто по всем строкам — то, что сервер замораживает как totalMinor. */
  netAccruedMinor: number;
  /** Сумма непогашенных штрафов. payableMinor − unrecoveredMinor = netAccruedMinor. */
  unrecoveredMinor: number;
  /** Сколько уйдёт по каждой строке — ровно то, что станет расходом. */
  payableByLineId: Map<string, number>;
  /** Только преподаватели с непогашенным штрафом, по убыванию остатка. */
  unrecoveredTeachers: TeacherPayout[];
}

export function allocatePayout(lines: PayoutLineInput[]): PayoutAllocation {
  const payableByLineId = new Map<string, number>();
  const byTeacher = new Map<string, PayoutLineInput[]>();
  for (const line of lines) {
    const list = byTeacher.get(line.teacherId) ?? [];
    list.push(line);
    byTeacher.set(line.teacherId, list);
  }

  let payableMinor = 0;
  let netAccruedMinor = 0;
  let unrecoveredMinor = 0;
  const unrecoveredTeachers: TeacherPayout[] = [];

  for (const [teacherId, list] of byTeacher) {
    const positives = list
      .filter(l => Number(l.finalMinor || 0) > 0)
      .sort((a, b) =>
        Number(b.finalMinor || 0) - Number(a.finalMinor || 0)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const earnedMinor = positives.reduce((sum, l) => sum + Number(l.finalMinor || 0), 0);
    const penaltyMinor = list.reduce(
      (sum, l) => sum + (Number(l.finalMinor || 0) < 0 ? -Number(l.finalMinor || 0) : 0),
      0,
    );

    let deficit = penaltyMinor;
    for (const line of positives) {
      const take = Math.min(deficit, Number(line.finalMinor || 0));
      payableByLineId.set(line.id, Number(line.finalMinor || 0) - take);
      deficit -= take;
    }
    // Отрицательные и нулевые строки расхода не порождают — ноль, а не пропуск,
    // чтобы CSV не оставлял пустую клетку там, где ответ известен.
    for (const line of list) {
      if (!payableByLineId.has(line.id)) payableByLineId.set(line.id, 0);
    }

    const netMinor = earnedMinor - penaltyMinor;
    const teacherPayable = Math.max(0, netMinor);
    const teacherUnrecovered = Math.max(0, -netMinor);

    payableMinor += teacherPayable;
    netAccruedMinor += netMinor;
    unrecoveredMinor += teacherUnrecovered;

    if (teacherUnrecovered > 0) {
      unrecoveredTeachers.push({
        teacherId,
        teacherName: String(list.find(l => l.teacherName)?.teacherName || ''),
        earnedMinor,
        penaltyMinor,
        netMinor,
        payableMinor: teacherPayable,
        unrecoveredMinor: teacherUnrecovered,
      });
    }
  }

  unrecoveredTeachers.sort((a, b) => b.unrecoveredMinor - a.unrecoveredMinor);

  return { payableMinor, netAccruedMinor, unrecoveredMinor, payableByLineId, unrecoveredTeachers };
}
