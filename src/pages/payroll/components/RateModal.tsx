import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Percent, Plus, Trash2, UserRound, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiDeleteCompensationRule, apiSaveCompensationRule } from '../../../lib/api';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import type { CompensationRule, PayComponent } from '../../../types';
import {
  bpToPercentInput,
  componentKindLabel,
  formatMinor,
  minorToSomInput,
  percentInputToBp,
  somInputToMinor,
  type Translate,
} from '../payrollFormat';

/** Ученик его групп: кого можно выбрать в именную ставку и что он уже заплатил. */
export interface RateStudent {
  studentId: string;
  studentName: string;
  /** Оплачено за выбранный месяц, нетто (минорные единицы). */
  paidMinor: number;
  /** Выставлено за выбранный месяц — вход потолка «если оплатят все». */
  invoicedMinor: number;
}

interface Props {
  teacherId: string;
  teacherName: string;
  /** Действующая ставка или null, если её ещё нет. */
  rule: CompensationRule | null;
  /** Сколько собрано по его группам за выбранный месяц — для живого примера. */
  baseMinor: number;
  /** Сколько его студентов уже заплатило в этом месяце — множитель «за ученика». */
  payingStudents: number;
  /** Сумма счетов месяца по его группам — база потолка «если оплатят все». */
  expectedMinor: number;
  /** Сколько студентов в этих счетах — множитель потолка у оплаты «за ученика». */
  expectedStudents: number;
  /** Сколько счетов вошло: 0 — счетов за месяц нет, и потолок считать не по чему. */
  expectedPlanCount: number;
  /** Ученики его групп — из них выбираются индивидуальные. */
  students: RateStudent[];
  onClose: () => void;
  onSaved: () => void;
}

type RateKind = PayComponent['kind'];

/**
 * Ставка преподавателя: ОДИН вид оплаты и одно число.
 *
 * Прежний редактор спрашивал название ставки, месяц начала, месяц конца, список
 * компонентов и по галочке на каждый курс и каждую группу — восемь решений там,
 * где у директора в голове одно: «Азизе — двадцать процентов». Всё, кроме этого
 * одного, удалено:
 *
 * — НАЗВАНИЕ: ставку опознают по человеку, а не по подписи «Оклад + 20%».
 * — СРОК ДЕЙСТВИЯ: ставка действует сейчас. Прошлые месяцы защищает не дата, а
 *   замороженная ведомость, которая не пересчитывается после утверждения.
 * — ОБЛАСТЬ ДЕЙСТВИЯ: процент считается по группам, где преподаватель числится.
 *   Забытая галочка больше не может дать честный ноль.
 * — ФИЛИАЛ: ставка одна на человека. Один преподаватель ведёт группы в разных
 *   филиалах, и филиальная ставка означала лишь одно — часть его групп молча не
 *   начислялась. Где именно заработаны деньги, показывает разбивка в карточке,
 *   а не вторая ставка.
 */
const RateModal: React.FC<Props> = ({
  teacherId, teacherName, rule, baseMinor,
  payingStudents, expectedMinor, expectedStudents, expectedPlanCount,
  students, onClose, onSaved,
}) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;

  // Основная ставка — первый компонент, КОТОРЫЙ НЕ ИМЕННОЙ. Брать components[0]
  // больше нельзя: рядом с процентом теперь лежат индивидуальные ученики, и у
  // преподавателя, который ведёт только индивидуальные, они стоят первыми.
  const existing = rule?.components?.find(c => c.kind !== 'individual_students');
  const [kind, setKind] = useState<RateKind>(
    existing?.kind === 'salary' || existing?.kind === 'per_paying_student'
      ? existing.kind
      : 'percent_revenue',
  );
  const [percent, setPercent] = useState(
    existing?.kind === 'percent_revenue' ? bpToPercentInput(existing.percentBp) : '',
  );
  const [amount, setAmount] = useState(
    existing?.kind === 'salary' ? minorToSomInput(existing.amountMinor) : '',
  );
  // Отдельное поле, а не общее с окладом: «30 000 в месяц» и «250 с ученика» —
  // разные порядки чисел, и подставить одно вместо другого значит выписать
  // человеку ставку, которую никто не задавал.
  const [perStudent, setPerStudent] = useState(
    existing?.kind === 'per_paying_student' ? minorToSomInput(existing.amountMinor) : '',
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  /**
   * Именные ставки — индивидуальные занятия. Строки живут в состоянии как ТЕКСТ
   * (как и остальные суммы в этой форме): пользователь печатает «1 500», и
   * превращать это в число надо один раз, на сохранении.
   */
  const existingIndividual = rule?.components?.find(c => c.kind === 'individual_students');
  const [individual, setIndividual] = useState<{ studentId: string; amount: string }[]>(
    existingIndividual?.kind === 'individual_students'
      ? existingIndividual.rates.map(r => ({ studentId: r.studentId, amount: minorToSomInput(r.amountMinor) }))
      : [],
  );

  const studentById = useMemo(
    () => new Map(students.map(s => [s.studentId, s])),
    [students],
  );

  /**
   * Именные ставки, приведённые к числам, и их влияние на ОСНОВНУЮ ставку.
   *
   * Считается ровно то же, что сервер (payroll-engine): ученик с именной ставкой
   * уходит из базы процента и из числа заплативших, а его сумма начисляется
   * отдельно. Иначе окно обещало бы одно, а ведомость показывала другое —
   * повторять серверную арифметику здесь приходится именно для этого.
   */
  const individualMath = useMemo(() => {
    let earnedMinor = 0;      // на оплатах месяца
    let potentialMinor = 0;   // если оплатят все счета
    let paidBaseMinor = 0;    // деньги этих учеников — их вычитаем из базы
    let paidCount = 0;        // головы этих учеников — их вычитаем из множителя
    let invoicedBaseMinor = 0;
    let invoicedCount = 0;
    const seen = new Set<string>();
    for (const row of individual) {
      if (!row.studentId || seen.has(row.studentId)) continue;
      seen.add(row.studentId);
      const rateMinor = somInputToMinor(row.amount);
      const student = studentById.get(row.studentId);
      const paid = student?.paidMinor ?? 0;
      const invoiced = student?.invoicedMinor ?? 0;
      paidBaseMinor += paid;
      if (paid > 0) {
        paidCount += 1;
        earnedMinor += rateMinor ?? 0;
      }
      if (invoiced > 0) {
        invoicedBaseMinor += invoiced;
        invoicedCount += 1;
        potentialMinor += rateMinor ?? 0;
      }
    }
    return { earnedMinor, potentialMinor, paidBaseMinor, paidCount, invoicedBaseMinor, invoicedCount, count: seen.size };
  }, [individual, studentById]);

  /**
   * Кого можно выбрать в этой строке: ученики его групп, кроме уже занятых
   * другими строками.
   *
   * Ученик, которого в группах больше НЕТ (перевели, отчислили), остаётся в
   * списке своей строки с пометкой: убрать его из опций значило бы либо
   * заблокировать сохранение, либо молча стереть чью-то ставку.
   */
  const studentOptions = (currentId: string): { studentId: string; label: string }[] => {
    const taken = new Set(individual.map(r => r.studentId).filter(id => id && id !== currentId));
    const options = students
      .filter(s => !taken.has(s.studentId))
      .map(s => ({ studentId: s.studentId, label: s.studentName || s.studentId }));
    if (currentId && !studentById.has(currentId)) {
      options.unshift({
        studentId: currentId,
        label: t('payroll.individualStudentGone', '{{id}} — нет в его группах', { id: currentId }),
      });
    }
    return options;
  };

  /** База основной ставки за вычетом индивидуальных учеников. */
  const ownBaseMinor = Math.max(0, baseMinor - individualMath.paidBaseMinor);
  const ownPayingStudents = Math.max(0, payingStudents - individualMath.paidCount);
  const ownExpectedMinor = Math.max(0, expectedMinor - individualMath.invoicedBaseMinor);
  const ownExpectedStudents = Math.max(0, expectedStudents - individualMath.invoicedCount);

  /** Живой пример: сколько вышло бы на деньгах ВЫБРАННОГО месяца. */
  const preview = useMemo(() => {
    if (kind === 'salary') return somInputToMinor(amount);
    if (kind === 'per_paying_student') {
      const perMinor = somInputToMinor(perStudent);
      return perMinor === null ? null : perMinor * ownPayingStudents;
    }
    const bp = percentInputToBp(percent);
    if (bp === null) return null;
    // Та же арифметика, что на сервере: целый числитель, одно деление.
    return Math.round((ownBaseMinor * bp) / 10000);
  }, [kind, amount, perStudent, percent, ownBaseMinor, ownPayingStudents]);

  /**
   * Потолок месяца: то же число, что считает сервер (computePotentialMinor), но
   * на ещё не сохранённой ставке — иначе «а если все заплатят?» пришлось бы
   * проверять сохранением.
   *
   * null = считать не по чему: счетов за месяц нет. Ноль в этом месте директор
   * прочитал бы как «по такой ставке он не заработает ничего».
   */
  const potential = useMemo(() => {
    if (kind === 'salary') return somInputToMinor(amount);
    if (!expectedPlanCount) return null;
    if (kind === 'per_paying_student') {
      const perMinor = somInputToMinor(perStudent);
      return perMinor === null ? null : perMinor * ownExpectedStudents;
    }
    const bp = percentInputToBp(percent);
    if (bp === null) return null;
    return Math.round((ownExpectedMinor * bp) / 10000);
  }, [kind, amount, perStudent, percent, ownExpectedMinor, ownExpectedStudents, expectedPlanCount]);

  /** Поле основной ставки пустое: значит её нет — «только индивидуальные». */
  const baseFieldEmpty =
    kind === 'percent_revenue' ? percentInputToBp(percent) === null
      : kind === 'per_paying_student' ? somInputToMinor(perStudent) === null
        : somInputToMinor(amount) === null;
  const onlyIndividual = baseFieldEmpty && individualMath.count > 0;

  // ── Что показать в блоке примера ──
  // Условия вынесены из разметки: их четыре штуки на три строки, и в JSX они
  // читались бы хуже, чем сама арифметика.
  /** Заработок ОСНОВНОЙ ставки на деньгах месяца; null — ставки нет. */
  const baseEarnedMinor = onlyIndividual ? null : preview;
  const showBaseLine = !onlyIndividual && kind !== 'salary' && preview !== null;
  const ceilingMinor = onlyIndividual
    ? (expectedPlanCount ? individualMath.potentialMinor : null)
    : potential === null ? null : potential + individualMath.potentialMinor;
  const showPreviewBox = showBaseLine || individualMath.count > 0;

  const buildComponents = (): { components?: PayComponent[]; error?: string } => {
    // ── Именные ставки ──
    // Собираются первыми, потому что от них зависит, обязательна ли основная
    // ставка: преподаватель, который ведёт ТОЛЬКО индивидуальные занятия, имеет
    // право на ставку без общей части.
    const rates: { studentId: string; amountMinor: number }[] = [];
    const seen = new Set<string>();
    for (const row of individual) {
      if (!row.studentId) {
        return { error: t('payroll.badIndividualStudent', 'Выберите ученика в именной ставке или удалите строку') };
      }
      if (seen.has(row.studentId)) {
        const name = studentById.get(row.studentId)?.studentName || row.studentId;
        return {
          error: t('payroll.badIndividualDuplicate', 'Ученик «{{name}}» указан дважды', { name }),
        };
      }
      const amountMinor = somInputToMinor(row.amount);
      if (amountMinor === null) {
        const name = studentById.get(row.studentId)?.studentName || row.studentId;
        return {
          error: t('payroll.badIndividualAmount', 'Укажите сумму больше нуля для «{{name}}»', { name }),
        };
      }
      seen.add(row.studentId);
      rates.push({ studentId: row.studentId, amountMinor });
    }
    const individualComponents: PayComponent[] = rates.length
      ? [{ kind: 'individual_students', rates, base: 'collected' }]
      : [];

    if (kind === 'percent_revenue') {
      const percentBp = percentInputToBp(percent);
      if (percentBp === null) {
        return individualComponents.length
          ? { components: individualComponents }
          : { error: t('payroll.badPercent', 'Укажите процент от 0,01 до 100') };
      }
      return { components: [{ kind: 'percent_revenue', percentBp, base: 'collected' }, ...individualComponents] };
    }
    if (kind === 'per_paying_student') {
      const amountMinor = somInputToMinor(perStudent);
      if (amountMinor === null) {
        return individualComponents.length
          ? { components: individualComponents }
          : { error: t('payroll.badAmount', 'Укажите сумму больше нуля') };
      }
      return { components: [{ kind: 'per_paying_student', amountMinor, base: 'collected' }, ...individualComponents] };
    }
    const amountMinor = somInputToMinor(amount);
    if (amountMinor === null) {
      return individualComponents.length
        ? { components: individualComponents }
        : { error: t('payroll.badAmount', 'Укажите сумму больше нуля') };
    }
    return { components: [{ kind: 'salary', amountMinor }, ...individualComponents] };
  };

  const handleSave = async () => {
    setError('');
    const { components, error: componentsError } = buildComponents();
    if (componentsError || !components) {
      setError(componentsError || '');
      return;
    }
    setSaving(true);
    try {
      await apiSaveCompensationRule({ teacherId, components });
      toast.success(t('payroll.ruleSaved', 'Ставка сохранена'));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      await apiDeleteCompensationRule(rule.id);
      toast.success(t('payroll.ruleDeleted', 'Ставка убрана'));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || t('payroll.deleteFailed', 'Не удалось убрать ставку'));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('payroll.rateTitle', 'Ставка преподавателя')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{teacherName || teacherId}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label={t('payroll.close', 'Закрыть')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
          )}

          {/* Виды оплаты — переключателем, а не списком: выбор ровно один. */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('payroll.rateKindLabel', 'Как платим')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['percent_revenue', 'per_paying_student', 'salary'] as RateKind[]).map(option => {
                const active = kind === option;
                const Icon = option === 'percent_revenue'
                  ? Percent
                  : option === 'per_paying_student' ? UserRound : Wallet;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {componentKindLabel(option, tr)}
                  </button>
                );
              })}
            </div>
          </div>

          {kind === 'percent_revenue' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.percentField', 'Процент')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={percent}
                  onChange={e => setPercent(e.target.value)}
                  placeholder="20"
                  className="w-32 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
              {/* База названа буквально: «от полученных», не «от выставленных».
                  Это разные числа, и путаница здесь стоит денег. */}
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {t(
                  'payroll.percentBaseHint',
                  'Считается от денег, которые студенты его групп РЕАЛЬНО заплатили в выбранном месяце, а не от выставленных счетов. Возвраты уменьшают базу.',
                )}
              </p>
            </div>
          ) : kind === 'per_paying_student' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.perStudentField', 'Сумма за одного ученика')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={perStudent}
                  onChange={e => setPerStudent(e.target.value)}
                  placeholder="250"
                  className="w-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                />
                <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
              </div>
              {/* Кого считаем — сказано буквально: «заплативших», а не «учеников».
                  Разница между этими словами и есть вся разница в сумме. */}
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {t(
                  'payroll.perStudentHint',
                  'Умножается на число студентов его групп, которые заплатили в выбранном месяце — неважно, полностью или частью. Кто не платил, в расчёт не входит; возвраты студента отменяют его оплату.',
                )}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.amountField', 'Сумма за месяц')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="30000"
                  className="w-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                />
                <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {t(
                  'payroll.salaryHint',
                  'Начисляется целиком за месяц и не зависит от оплат студентов.',
                )}
              </p>
            </div>
          )}

          {/* ── Именные ставки: индивидуальные занятия ──
              Отдельный блок, а не четвёртый вид оплаты в переключателе: это
              исключение ПОВЕРХ ставки, и выбирать между «20% с групп» и «1500 с
              Тимура» не нужно — почти всегда есть и то, и другое. */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('payroll.individualTitle', 'Индивидуальные ученики')}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              {t(
                'payroll.individualHint',
                'Своя сумма за конкретного ученика — для индивидуальных занятий. Такой ученик из общей ставки исключается (и из процента, и из числа заплативших), поэтому за него платится только эта сумма.',
              )}
            </p>

            {individual.length > 0 && (
              <div className="mt-3 space-y-2">
                {individual.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={row.studentId}
                      onChange={e => setIndividual(rows => rows.map((r, i) => (
                        i === index ? { ...r, studentId: e.target.value } : r
                      )))}
                      aria-label={t('payroll.individualPickStudent', 'Выберите ученика')}
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                    >
                      <option value="">{t('payroll.individualPickStudent', 'Выберите ученика')}</option>
                      {studentOptions(row.studentId).map(option => (
                        <option key={option.studentId} value={option.studentId}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={e => setIndividual(rows => rows.map((r, i) => (
                        i === index ? { ...r, amount: e.target.value } : r
                      )))}
                      placeholder="1500"
                      aria-label={t('payroll.individualAmountField', 'Сумма за этого ученика')}
                      className="w-24 shrink-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                    />
                    <span className="text-xs text-slate-500 shrink-0">{CURRENCY_SUFFIX}</span>
                    <button
                      type="button"
                      onClick={() => setIndividual(rows => rows.filter((_, i) => i !== index))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 shrink-0"
                      aria-label={t('payroll.individualRemove', 'Убрать ученика')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Ученик виден расчёту только через ГРУППУ преподавателя, поэтому
                пустой список — это не «нет данных», а инструкция. */}
            {!students.length ? (
              <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                {t(
                  'payroll.individualNoStudents',
                  'Учеников пока нет: они появляются из групп преподавателя. Индивидуальному ученику нужна своя группа — хотя бы из одного человека, иначе его оплаты не попадут в расчёт.',
                )}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setIndividual(rows => [...rows, { studentId: '', amount: '' }])}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <Plus className="w-4 h-4" />
                {t('payroll.individualAdd', 'Добавить ученика')}
              </button>
            )}
          </div>

          {/* Живой пример на деньгах выбранного месяца: процент в вакууме ничего
              не говорит, а «20% с 150 000 = 30 000» проверяется взглядом.

              Второй строкой — потолок. Ставка, привязанная к оплатам, без него
              читается как приговор ставке: директор видит маленькое число и не
              знает, дело в проценте или в том, что половина ещё не заплатила. */}
          {showPreviewBox && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
              {/* Общей ставки нет — это законный случай (человек ведёт только
                  индивидуальные), но он обязан быть сказан вслух: иначе забытое
                  поле процента прочитается как «ставка задана». */}
              {onlyIndividual && (
                <p className="text-amber-700 dark:text-amber-400">
                  {t('payroll.rateOnlyIndividual', 'Общая ставка не задана — начисляются только именные суммы.')}
                </p>
              )}
              {showBaseLine && (
                <p>
                  {kind === 'percent_revenue'
                    ? t('payroll.ratePreview', 'На деньгах этого месяца: {{percent}} от {{base}} = {{result}}', {
                        percent: `${percent}%`,
                        base: formatMinor(ownBaseMinor),
                        result: formatMinor(preview ?? 0),
                      })
                    : t('payroll.ratePreviewPerStudent', 'На оплатах этого месяца: {{amount}} × {{count}} заплативших = {{result}}', {
                        amount: formatMinor(somInputToMinor(perStudent) ?? 0),
                        count: ownPayingStudents,
                        result: formatMinor(preview ?? 0),
                      })}
                </p>
              )}
              {/* Именная часть — отдельной строкой: она считается по другому
                  правилу, и растворить её в одном числе значило бы спрятать
                  половину объяснения. */}
              {individualMath.count > 0 && (
                <p>
                  {t('payroll.ratePreviewIndividual', 'Индивидуальные: {{result}} — заплатили {{paid}} из {{count}} учеников', {
                    result: formatMinor(individualMath.earnedMinor),
                    paid: individualMath.paidCount,
                    count: individualMath.count,
                  })}
                </p>
              )}
              {/* Итог показывается только когда есть ЧТО складывать: иначе он
                  дословно повторял бы строку выше. */}
              {individualMath.count > 0 && !onlyIndividual && baseEarnedMinor !== null && (
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {t('payroll.ratePreviewTotal', 'Итого за этот месяц: {{result}}', {
                    result: formatMinor(baseEarnedMinor + individualMath.earnedMinor),
                  })}
                </p>
              )}
              {ceilingMinor !== null && (
                <p className="text-slate-500 dark:text-slate-400">
                  {individualMath.count > 0
                    // С именными ставками формулу в одну строку не уложить —
                    // показываем сумму, а разложение уже дано выше.
                    ? t('payroll.ratePotentialTotal', 'Если оплатят все счета месяца: {{result}}', {
                        result: formatMinor(ceilingMinor),
                      })
                    : kind === 'percent_revenue'
                      ? t('payroll.ratePotentialPercent', 'Если оплатят все счета месяца: {{percent}} от {{base}} = {{result}}', {
                          percent: `${percent}%`,
                          base: formatMinor(ownExpectedMinor),
                          result: formatMinor(ceilingMinor),
                        })
                      : t('payroll.ratePotentialPerStudent', 'Если оплатят все счета месяца: {{amount}} × {{count}} учеников = {{result}}', {
                          amount: formatMinor(somInputToMinor(perStudent) ?? 0),
                          count: ownExpectedStudents,
                          result: formatMinor(ceilingMinor),
                        })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0">
          {rule ? (
            confirmDelete ? (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-sm font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />{t('payroll.rateDeleteConfirm', 'Точно убрать?')}
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="text-sm font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />{t('payroll.rateDelete', 'Убрать ставку')}
              </button>
            )
          ) : <span />}

          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
              {t('payroll.cancel', 'Отмена')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.save', 'Сохранить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateModal;
