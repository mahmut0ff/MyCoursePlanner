import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ChevronDown,
  Minus,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import type { PayComponent, PayrollLine } from '../../../types';
import {
  describeComponents,
  formatMinor,
  formatMinorSigned,
  formatPercentBp,
  type Translate,
} from '../payrollFormat';

/** Один студент группы и сколько он заплатил в выбранном месяце. */
export interface OverviewStudent {
  studentId: string;
  studentName: string;
  paidMinor: number;
  /** Заплатил в этом месяце, но в группе уже не числится. */
  former: boolean;
}

export interface OverviewGroup {
  groupId: string;
  name: string;
  courseId: string | null;
  courseName: string;
  /** Филиал группы; null — группа его не несёт (данные старых групп). */
  branchId: string | null;
  branchName: string;
  studentCount: number;
  collectedMinor: number;
  students: OverviewStudent[];
}

/**
 * Доля филиала в начисленном преподавателю. Сумма amountMinor по всем записям
 * равна начисленному ему за месяц: это разложение уже посчитанной суммы, а не
 * отдельный расчёт.
 */
export interface OverviewBranchShare {
  branchId: string | null;
  branchName: string;
  amountMinor: number;
  groupIds: string[];
}

/** Преподаватель за месяц — ровно то, что отдаёт api-payroll?action=overview. */
export interface OverviewTeacher {
  teacherId: string;
  teacherName: string;
  rule: { id: string; components: PayComponent[] } | null;
  groups: OverviewGroup[];
  byBranch: OverviewBranchShare[];
  studentCount: number;
  collectedMinor: number;
  refundMinor: number;
  baseMinor: number;
  previewMinor: number | null;
  previewComponents: { kind: string; earnedMinor: number; basis?: Record<string, any> }[];
  line: PayrollLine | null;
  manualLines: PayrollLine[];
}

interface Props {
  teacher: OverviewTeacher;
  expanded: boolean;
  onToggle: () => void;
  canWrite: boolean;
  canDeleteLine: boolean;
  frozen: boolean;
  /** Премию и штраф некуда записать, пока ведомость месяца не рассчитана. */
  canAddManual: boolean;
  onEditRate: () => void;
  onAddManual: (source: 'manual_bonus' | 'manual_penalty') => void;
  onEditAmount: (line: PayrollLine) => void;
  onDeleteLine: (line: PayrollLine) => void;
}

/**
 * Как получилась сумма — одной строкой, из замороженных входов расчёта.
 *
 * Голое «30 000 с.» директор проверить не может; «20% от 150 000 с.» — может, и
 * спор с преподавателем заканчивается на этой строке, а не в пересчёте вручную.
 */
const describeBasis = (
  entry: { kind: string; earnedMinor: number; basis?: Record<string, any> },
  t: Translate,
): string => {
  const basis = entry.basis ?? {};
  if (entry.kind === 'percent_revenue') {
    const base = t('payroll.basisPercent', '{{percent}} от {{base}}', {
      percent: formatPercentBp(basis.percentBp),
      base: formatMinor(basis.revenueBaseMinor),
    });
    // Возвраты показываем, только если они были: иначе строка шумит нулём.
    return Number(basis.refundMinor || 0) > 0
      ? `${base} ${t('payroll.basisPercentRefund', '(оплачено {{gross}}, возвраты {{refund}})', {
          gross: formatMinor(basis.grossMinor),
          refund: formatMinor(basis.refundMinor),
        })}`
      : base;
  }
  if (entry.kind === 'salary') return t('payroll.basisSalary', 'Фиксированная сумма за месяц');
  return t('payroll.basisLegacy', 'Устаревший вид оплаты — не начислен');
};

/**
 * Преподаватель как строка ведомости и как раскрывающаяся карточка.
 *
 * Свёрнутый вид отвечает на «сколько ему»; раскрытый — на «почему столько»:
 * группы, студенты и то, кто из них сколько заплатил. Это и есть весь сценарий
 * раздела, поэтому разбивка живёт рядом с суммой, а не на отдельном экране.
 */
const TeacherRow: React.FC<Props> = ({
  teacher, expanded, onToggle, canWrite, canDeleteLine, frozen, canAddManual,
  onEditRate, onAddManual, onEditAmount, onDeleteLine,
}) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;

  const hasRule = Boolean(teacher.rule);
  const line = teacher.line;
  // Пока ведомость не рассчитана, показываем предпросмотр; после — то, что в ней
  // зафиксировано. Смешивать нельзя: это разные обещания.
  const salaryMinor = line ? line.finalMinor : (teacher.previewMinor ?? 0);
  const overridden = Boolean(line && line.overrideMinor !== null && line.overrideMinor !== undefined);
  const manualTotal = teacher.manualLines.reduce((sum, l) => sum + (l.finalMinor || 0), 0);

  const componentEntries = line
    ? ((line.ruleSnapshot as any)?.computed ?? [])
    : teacher.previewComponents;

  /**
   * Разбивку по филиалам показываем, только когда филиалов БОЛЬШЕ ОДНОГО.
   * У одного филиала строка повторила бы итог карточки слово в слово — это шум,
   * который учит пропускать блок и в тех карточках, где он что-то говорит.
   */
  const byBranch = teacher.byBranch ?? [];
  const showByBranch = byBranch.length > 1;

  return (
    <div className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      {/* Шапка строки — вся кликабельная: раскрытие это основное действие. */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 sm:px-5 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />

        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 dark:text-white leading-tight truncate">
            {teacher.teacherName || teacher.teacherId}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {t('payroll.groupsCount', '{{groups}} гр. · {{students}} студ.', {
                groups: teacher.groups.length,
                students: teacher.studentCount,
              })}
            </span>
            {hasRule ? (
              <span className="text-slate-600 dark:text-slate-400">
                {describeComponents(teacher.rule?.components, tr)}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {t('payroll.noRate', 'Ставка не задана')}
              </span>
            )}
          </div>
        </div>

        {/* Сколько заплатили его студенты — та самая связь «оплатили → зарплата». */}
        <div className="hidden sm:block text-right shrink-0">
          <p className="text-[11px] text-slate-400">{t('payroll.colCollected', 'Оплатили студенты')}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {formatMinor(teacher.collectedMinor)}
          </p>
        </div>

        <div className="text-right shrink-0 min-w-[6.5rem]">
          <p className="text-[11px] text-slate-400">
            {line ? t('payroll.colAccruedShort', 'Начислено') : t('payroll.colPreview', 'Выйдет')}
          </p>
          <p className={`text-sm font-bold whitespace-nowrap ${
            hasRule ? 'text-slate-900 dark:text-white' : 'text-slate-400'
          }`}>
            {hasRule ? formatMinor(salaryMinor) : '—'}
          </p>
          {manualTotal !== 0 && (
            <p className={`text-[11px] whitespace-nowrap ${manualTotal < 0 ? 'text-rose-600' : 'text-violet-600'}`}>
              {formatMinorSigned(manualTotal)}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 space-y-4">
          {/* ── Как получилась сумма ── */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('payroll.howCounted', 'Как считается')}
              </p>
              {canWrite && (
                <button
                  onClick={onEditRate}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {hasRule ? t('payroll.changeRate', 'Изменить ставку') : t('payroll.setRate', 'Задать ставку')}
                </button>
              )}
            </div>

            {!hasRule ? (
              <p className="text-sm text-slate-500">
                {t('payroll.noRateHint', 'Ставка не задана — начислений не будет. Задайте процент или фиксированную сумму.')}
              </p>
            ) : componentEntries.length === 0 ? (
              <p className="text-sm text-slate-500">{t('payroll.noBasisYet', 'Нечего начислять в этом месяце.')}</p>
            ) : (
              componentEntries.map((entry: any, i: number) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{describeBasis(entry, tr)}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white whitespace-nowrap">
                    {formatMinor(entry.earnedMinor)}
                  </span>
                </div>
              ))
            )}

            {overridden && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t('payroll.overriddenBy', 'Изменено вручную: {{reason}}', { reason: line?.overrideReason || '—' })}
              </p>
            )}
          </div>

          {/* ── Где заработано ── */}
          {showByBranch && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('payroll.byBranchTitle', 'Где заработано')}
              </p>
              {byBranch.map(share => (
                <div key={share.branchId ?? 'unassigned'} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {/* Пустое имя даёт и группа без филиала, и удалённый филиал —
                        в обоих случаях сказать честно можно только «без филиала». */}
                    <span className="truncate">
                      {share.branchName || t('payroll.branchUnassigned', 'Без филиала')}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white whitespace-nowrap">
                    {formatMinor(share.amountMinor)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Группы и студенты ── */}
          {teacher.groups.length === 0 ? (
            <p className="text-sm text-slate-500 px-1">
              {t('payroll.noGroups', 'Преподаватель не назначен ни в одну группу — оплаты студентов к нему не привязаны.')}
            </p>
          ) : (
            teacher.groups.map(group => {
              const studentsSum = group.students.reduce((sum, s) => sum + s.paidMinor, 0);
              const otherMinor = group.collectedMinor - studentsSum;
              return (
                <div key={group.groupId} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{group.name}</p>
                      {/* Курс и филиал одной строкой: у преподавателя, ведущего
                          в двух зданиях, только филиал и отличает две похоже
                          названные группы друг от друга. */}
                      {(group.courseName || group.branchName) && (
                        <p className="text-[11px] text-slate-500 truncate">
                          {[group.courseName, group.branchName].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-400">
                        {t('payroll.groupStudents', '{{count}} студ.', { count: group.studentCount })}
                      </p>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {formatMinor(group.collectedMinor)}
                      </p>
                    </div>
                  </div>

                  {group.students.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">
                      {t('payroll.groupEmpty', 'В группе нет студентов')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {group.students.map(student => (
                        <li
                          key={`${group.groupId}:${student.studentId}`}
                          className="px-4 py-2 flex items-center justify-between gap-3"
                        >
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate inline-flex items-center gap-1.5">
                            <UserRound className="w-3 h-3 text-slate-400 shrink-0" />
                            {student.studentName || student.studentId}
                            {student.former && (
                              <span className="text-[10px] text-slate-400">
                                {t('payroll.formerStudent', '(уже не в группе)')}
                              </span>
                            )}
                          </span>
                          <span className={`text-xs whitespace-nowrap ${
                            student.paidMinor > 0
                              ? 'text-slate-700 dark:text-slate-200 font-medium'
                              : 'text-slate-400'
                          }`}>
                            {student.paidMinor > 0 ? formatMinor(student.paidMinor) : t('payroll.notPaid', 'не платил')}
                          </span>
                        </li>
                      ))}
                      {/* Платёж на группу без студента: в итог группы он входит, в
                          строки — нет, и разницу надо назвать, иначе колонка не
                          сходится сама с собой. */}
                      {otherMinor !== 0 && (
                        <li className="px-4 py-2 flex items-center justify-between gap-3">
                          <span className="text-xs text-slate-400">
                            {t('payroll.paymentsWithoutStudent', 'Платежи без указания студента')}
                          </span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{formatMinor(otherMinor)}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })
          )}

          {/* ── Премии и штрафы ── */}
          {teacher.manualLines.length > 0 && (
            <ul className="space-y-1.5">
              {teacher.manualLines.map(manual => (
                <li
                  key={manual.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-violet-50/70 dark:bg-violet-900/10 px-4 py-2"
                >
                  <span className="text-xs text-slate-600 dark:text-slate-300 min-w-0 truncate">
                    <span className="font-medium">
                      {manual.source === 'manual_penalty'
                        ? t('payroll.penalty', 'Штраф')
                        : t('payroll.bonus', 'Премия')}
                    </span>
                    {manual.note ? ` — ${manual.note}` : ''}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold whitespace-nowrap ${
                      manual.finalMinor < 0 ? 'text-rose-600' : 'text-violet-700 dark:text-violet-300'
                    }`}>
                      {formatMinorSigned(manual.finalMinor)}
                    </span>
                    {canDeleteLine && !frozen && (
                      <button
                        onClick={() => onDeleteLine(manual)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        aria-label={t('payroll.deleteLine', 'Удалить строку')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canAddManual && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onAddManual('manual_bonus')}
                className="text-xs font-medium text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />{t('payroll.addBonus', 'Премия')}
              </button>
              <button
                onClick={() => onAddManual('manual_penalty')}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
              >
                <Minus className="w-3.5 h-3.5" />{t('payroll.addPenalty', 'Штраф')}
              </button>
              {line && (
                <button
                  onClick={() => onEditAmount(line)}
                  className="text-xs font-medium text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />{t('payroll.editAmount', 'Изменить сумму')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherRow;
