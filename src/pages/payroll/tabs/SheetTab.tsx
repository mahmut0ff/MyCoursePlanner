import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Building2,
  Calculator,
  CheckCircle2,
  Download,
  ExternalLink,
  Lock,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiApprovePayroll,
  apiCalculatePayroll,
  apiDeletePayrollLine,
  apiGetPayrollBalance,
  apiGetPayrollPeriod,
  apiGetPayrollPeriods,
  apiPayPayroll,
  apiSetPayrollLine,
  orgGetTeachers,
} from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import LazyListFooter from '../../../components/ui/LazyListFooter';
import { useLazyList } from '../../../hooks/useLazyList';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import { buildCsv, downloadCsv } from '../../../lib/csv';
import type { PayrollLine, PayrollPeriod, PayrollPeriodState } from '../../../types';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import type { PayrollDiagnostic } from '../components/DiagnosticsPanel';
import LineBreakdown from '../components/LineBreakdown';
import LineAmountModal from '../components/LineAmountModal';
import {
  currentPeriodKey,
  formatMinor,
  formatMinorSigned,
  formatPeriodLabel,
  PERIOD_STATE_STYLE,
  somInputToMinor,
} from '../payrollFormat';
import { allocatePayout } from '../payrollPayout';

/** Ведомость целиком: шапка периода + строки + диагностики. */
type Sheet = PayrollPeriod & { lines: PayrollLine[]; diagnostics: PayrollDiagnostic[] };

interface BalanceRow {
  teacherId: string;
  teacherName: string;
  accruedMinor: number;
  paidMinor: number;
  balanceMinor: number;
}


const collator = new Intl.Collator('ru');

/** Можно ли действие в этом состоянии и, если нет, почему — по-русски. */
interface Gate { enabled: boolean; reason: string }

/**
 * «Ведомость» — жизненный цикл зарплаты за месяц: Рассчитать → Утвердить →
 * Выплатить.
 *
 * Три вещи, ради которых экран выглядит именно так:
 *
 * 1. В КАЖДОМ СОСТОЯНИИ РОВНО ОДНО ОЧЕВИДНОЕ ДЕЙСТВИЕ. Остальные не прячутся, а
 *    блокируются с объяснением: серая кнопка без причины читается как поломка.
 * 2. ДИАГНОСТИКИ ВЫШЕ ТАБЛИЦЫ. Сумма, которой директор не доверяет, хуже
 *    отсутствующей — «Пропущенные записи» объясняют, почему число такое.
 * 3. УТВЕРЖДЕНИЕ — ЗАМОРОЗКА, ВЫПЛАТА — ДЕНЬГИ. Оба шага подтверждаются
 *    диалогом, который называет последствие буквально.
 */
const SheetTab: React.FC = () => {
  const { t } = useTranslation();
  const { activeBranchId, activeBranch } = useBranch();
  const { can } = usePermissions();

  const canWrite = can('payroll', 'write');
  const canDeleteLine = can('payroll', 'delete');

  const [period, setPeriod] = useState(currentPeriodKey());
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [editingLine, setEditingLine] = useState<PayrollLine | null>(null);
  const [pendingLineDelete, setPendingLineDelete] = useState<PayrollLine | null>(null);

  const [manual, setManual] = useState({ teacherId: '', source: 'manual_bonus', amount: '', note: '' });

  /**
   * Чья это ведомость — словами. Ведомость филиала и ведомость «Все филиалы» за
   * один месяц это РАЗНЫЕ документы с разными суммами; без подписи директор
   * утвердил бы не ту, будучи уверен, что смотрит на свою.
   */
  const scopeLabel = activeBranch
    ? t('payroll.scopeBranch', 'Филиал: {{name}}', { name: activeBranch.name })
    : t('payroll.scopeOrgWide', 'Вся организация');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [periodsData, balanceData, teacherData] = await Promise.all([
        apiGetPayrollPeriods({ period }),
        apiGetPayrollBalance(),
        orgGetTeachers(),
      ]);
      setBalance(Array.isArray(balanceData) ? balanceData : []);
      setTeachers(Array.isArray(teacherData) ? teacherData : []);
      // Личность ведомости — тройка (организация, месяц, филиал), поэтому берём не
      // первую попавшуюся, а ту, чей филиал совпадает с выбранным БУКВАЛЬНО. Под
      // «Все филиалы» сервер не фильтрует и возвращает заодно филиальные
      // ведомости за тот же месяц: взяв [0], экран показал бы чужую сумму под
      // видом общеорганизационной.
      const found = (Array.isArray(periodsData) ? periodsData : [])
        .find((p: any) => (p.branchId ?? null) === (activeBranchId ?? null)) || null;
      // Ведомости за месяц может ещё не быть — это нормальное состояние «до расчёта»,
      // а не ошибка: пустой экран здесь честнее выдуманного черновика.
      setSheet(found ? ((await apiGetPayrollPeriod(found.id)) as Sheet) : null);
    } catch (e: any) {
      setError(e?.message || t('payroll.loadFailed', 'Не удалось загрузить данные'));
    } finally {
      setLoading(false);
    }
  }, [period, t, activeBranchId]);

  useEffect(() => {
    load();
    // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  }, [load, activeBranchId]);

  const state: PayrollPeriodState = sheet?.state ?? 'draft';
  const stateStyle = PERIOD_STATE_STYLE[state];
  const frozen = state === 'approved' || state === 'paid';

  const teacherNameById = useMemo(
    () => new Map(teachers.map(m => [String(m.uid || m.id), String(m.displayName || '')])),
    [teachers],
  );

  const teacherName = useCallback(
    (id: string) => teacherNameById.get(id) || balance.find(b => b.teacherId === id)?.teacherName || id,
    [teacherNameById, balance],
  );

  const lines = useMemo(() => sheet?.lines ?? [], [sheet]);

  // Расчётные строки идут первыми, ручные — следом: премия читается как
  // добавка к начислению, а не как отдельный человек в списке.
  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) =>
      Number(a.isManual) - Number(b.isManual)
      || collator.compare(a.teacherName || a.teacherId, b.teacherName || b.teacherId));
  }, [lines]);

  /**
   * ДВА РАЗНЫХ ЧИСЛА, и путать их нельзя.
   *
   * netAccruedMinor — сумма всех finalMinor. Это то, что сервер замораживает на
   * периоде при утверждении.
   *
   * payableMinor — то, что реально уйдёт из кассы. Штраф гасится положительными
   * строками ТОГО ЖЕ преподавателя и упирается в ноль: отрицательного расхода в
   * кассе не бывает. Поэтому минус одного человека НЕ уменьшает выплату другим,
   * а простая сумма finalMinor занижала бы выплату.
   */
  const payout = useMemo(() => allocatePayout(lines), [lines]);
  const totalMinor = payout.netAccruedMinor;
  const payableMinor = payout.payableMinor;
  const unrecoveredMinor = payout.unrecoveredMinor;

  /** Перечисление «у кого штраф не погасился» — одной фразой для подвала и диалога. */
  const unrecoveredNames = useMemo(
    () => payout.unrecoveredTeachers
      .map(row => `${row.teacherName || teacherName(row.teacherId)} (${formatMinor(row.unrecoveredMinor)})`)
      .join(', '),
    [payout.unrecoveredTeachers, teacherName],
  );

  // Ленивый рендер как в «Ставках» и «Долгах». Итог в подвале по-прежнему
  // считается по ВСЕМ строкам, а не по отрисованным — «Итого» за видимый кусок
  // было бы ложью. Ключ сброса — месяц и филиал: это другая ведомость.
  const {
    visible: linePageRows,
    total: lineTotal,
    hasMore: lineHasMore,
    sentinelRef: lineSentinelRef,
    loadMore: loadMoreLines,
  } = useLazyList(sortedLines, { resetKey: `${period}|${activeBranchId || ''}` });

  const {
    visible: balancePageRows,
    total: balanceTotal,
    hasMore: balanceHasMore,
    sentinelRef: balanceSentinelRef,
    loadMore: loadMoreBalance,
  } = useLazyList(balance, { resetKey: `${period}|${activeBranchId || ''}` });

  // ── Гейты жизненного цикла ────────────────────────────────────────────────
  const calculateGate: Gate = frozen
    ? {
        enabled: false,
        reason: state === 'paid'
          ? t('payroll.gateCalcPaid', 'Ведомость выплачена — пересчитать её нельзя. Корректировки вносите в текущем открытом месяце.')
          : t('payroll.gateCalcApproved', 'Ведомость утверждена — пересчитать её нельзя. Корректировки вносите в текущем открытом месяце.'),
      }
    : { enabled: true, reason: '' };

  const approveGate: Gate = (() => {
    if (state === 'approved') return { enabled: false, reason: t('payroll.gateApproveDone', 'Ведомость уже утверждена.') };
    if (state === 'paid') return { enabled: false, reason: t('payroll.gateApprovePaid', 'Ведомость уже выплачена.') };
    if (!sheet || state === 'draft') {
      return { enabled: false, reason: t('payroll.gateApproveDraft', 'Сначала выполните расчёт — утверждать пока нечего.') };
    }
    return { enabled: true, reason: '' };
  })();

  const payGate: Gate = (() => {
    if (state === 'paid') return { enabled: false, reason: t('payroll.gatePayDone', 'Ведомость выплачена. Расходы уже в кассе.') };
    if (state !== 'approved') {
      return { enabled: false, reason: t('payroll.gatePayNotApproved', 'Выплатить можно только утверждённую ведомость.') };
    }
    return { enabled: true, reason: '' };
  })();

  // ── Действия ──────────────────────────────────────────────────────────────
  const runCalculate = async () => {
    setBusy(true);
    try {
      // Филиал уезжает ЯВНО: POST штампа не получает, а следующий за расчётом GET
      // — получает. Без него сервер записал бы ведомость как общеорганизационную,
      // перезагрузка искала бы ведомость филиала и не нашла бы ничего.
      await apiCalculatePayroll({ period, branchId: activeBranchId });
      toast.success(t('payroll.calculated', 'Ведомость рассчитана'));
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.calculateFailed', 'Не удалось рассчитать ведомость'));
    } finally {
      setBusy(false);
    }
  };

  const runApprove = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await apiApprovePayroll(sheet.id);
      toast.success(t('payroll.approved', 'Ведомость утверждена'));
      setConfirmApprove(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.approveFailed', 'Не удалось утвердить ведомость'));
    } finally {
      setBusy(false);
    }
  };

  const runPay = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const res: any = await apiPayPayroll({ periodId: sheet.id });
      // 207: часть строк не записалась. Сервер намеренно оставляет период
      // неутверждённым к выплате, чтобы повтор дописал остаток — говорим это вслух.
      if (Array.isArray(res?.failed) && res.failed.length) {
        // Обещание «не задвоится» здесь ЗАКОНННО: расход пишется под
        // детерминированным id payoutTxId(periodId, lineId) через t.create() —
        // Firestore физически не хранит два документа с одним id. Если сервер
        // когда-нибудь вернётся к случайным id, эту фразу надо смягчить обратно.
        toast.error(t('payroll.payPartial', 'Записано строк: {{ok}}, не прошло: {{bad}}. Повторите выплату — уже выплаченное не задвоится.', {
          ok: res.written ?? 0,
          bad: res.failed.length,
        }));
      } else {
        toast.success(t('payroll.paid', 'Зарплата выплачена и записана в расходы'));
      }
      for (const warning of res?.warnings ?? []) {
        toast(warning.message, { icon: '⚠️' });
      }
      setConfirmPay(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.payFailed', 'Не удалось провести выплату'));
    } finally {
      setBusy(false);
    }
  };

  const addManualLine = async () => {
    if (!sheet) return;
    const amountMinor = somInputToMinor(manual.amount);
    if (!manual.teacherId || amountMinor === null) {
      toast.error(t('payroll.manualNeedFields', 'Выберите преподавателя и укажите сумму больше нуля'));
      return;
    }
    setBusy(true);
    try {
      await apiSetPayrollLine({
        periodId: sheet.id,
        teacherId: manual.teacherId,
        source: manual.source as 'manual_bonus' | 'manual_penalty',
        amountMinor,
        note: manual.note,
      });
      toast.success(t('payroll.manualAdded', 'Строка добавлена'));
      setManual({ teacherId: '', source: 'manual_bonus', amount: '', note: '' });
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.manualFailed', 'Не удалось добавить строку'));
    } finally {
      setBusy(false);
    }
  };

  const runDeleteLine = async (line: PayrollLine) => {
    setBusy(true);
    try {
      await apiDeletePayrollLine(line.id);
      toast.success(t('payroll.lineDeleted', 'Строка удалена'));
      setPendingLineDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.lineDeleteFailed', 'Не удалось удалить строку'));
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (!sortedLines.length) return;
    const csv = buildCsv(
      [
        t('payroll.colTeacher', 'Преподаватель'),
        t('payroll.colSource', 'Тип строки'),
        t('payroll.colRule', 'Ставка'),
        t('payroll.colComputed', 'Расчётная сумма'),
        t('payroll.colOverride', 'Правка'),
        t('payroll.colReason', 'Причина правки'),
        t('payroll.colFinal', 'Начислено по строке'),
        // Отдельная колонка, потому что сумма колонки «Начислено» НЕ равна тому,
        // что уйдёт из кассы: штрафы гасятся строками того же преподавателя.
        // Сумма именно этой колонки сходится с итогом на экране и с расходами.
        t('payroll.colPayable', 'Уйдёт из кассы'),
      ],
      sortedLines.map(line => [
        line.teacherName || teacherName(line.teacherId),
        line.isManual
          ? (line.source === 'manual_penalty' ? t('payroll.penalty', 'Штраф') : t('payroll.bonus', 'Премия'))
          : t('payroll.computedLine', 'Расчёт по ставке'),
        String((line.ruleSnapshot as any)?.label || line.note || ''),
        // Числа выгружаем сырыми в сомах: formatMinor добавил бы «с.», и таблица
        // перестала бы считать колонку числовой.
        (line.computedMinor || 0) / 100,
        line.overrideMinor === null || line.overrideMinor === undefined ? '' : line.overrideMinor / 100,
        line.overrideReason || '',
        (line.finalMinor || 0) / 100,
        (payout.payableByLineId.get(line.id) ?? 0) / 100,
      ]),
    );
    // Филиал в имени файла: две выгрузки за один месяц — общеорганизационная и
    // филиальная — иначе перезаписали бы друг друга в «Загрузках».
    downloadCsv(`payroll-${period}${activeBranchId ? `-${activeBranchId}` : ''}.csv`, csv);
  };

  const sourceBadge = (line: PayrollLine) => {
    if (!line.isManual) return null;
    const penalty = line.source === 'manual_penalty';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        penalty
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
      }`}>
        {penalty ? t('payroll.penalty', 'Штраф') : t('payroll.bonus', 'Премия')}
      </span>
    );
  };

  const StepButton: React.FC<{
    gate: Gate;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    primary: boolean;
    onClick: () => void;
  }> = ({ gate, icon: Icon, label, primary, onClick }) => (
    <div className="flex-1 min-w-[12rem]">
      <button
        onClick={onClick}
        disabled={!gate.enabled || busy || !canWrite}
        className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
          primary && gate.enabled
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
        } disabled:opacity-50`}
      >
        <Icon className="w-4 h-4" />{label}
      </button>
      {/* Причину пишем словами: серая кнопка молчит, и директор решает, что сломалось. */}
      {!gate.enabled && gate.reason && (
        <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{gate.reason}</p>
      )}
      {gate.enabled && !canWrite && (
        <p className="text-[11px] text-slate-500 mt-1.5">{t('payroll.noWriteRight', 'Нет прав на изменение зарплаты.')}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Шапка периода */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value || currentPeriodKey())}
              aria-label={t('payroll.periodField', 'Месяц ведомости')}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
            />
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${stateStyle.badge}`}>
              {sheet ? t(stateStyle.key, stateStyle.fallback) : t('payroll.stateNone', 'Не рассчитана')}
            </span>
            <span className="text-sm text-slate-400">{formatPeriodLabel(period)}</span>
            {/* Чья ведомость — рядом с месяцем и статусом: за один месяц их может
                быть несколько (общеорганизационная и по одной на филиал), и они
                считаются по разным данным. */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
              <Building2 className="w-3 h-3" />{scopeLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">{t('payroll.totalLabel', 'Итого к выплате')}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMinor(payableMinor)}</p>
              {/* Начисленное показываем ТОЛЬКО когда оно разошлось с кассой: иначе
                  два одинаковых числа рядом читаются как ошибка. */}
              {unrecoveredMinor > 0 && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('payroll.totalAccruedAside', 'начислено нетто {{net}}', { net: formatMinor(totalMinor) })}
                </p>
              )}
            </div>
            {sortedLines.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />CSV
              </button>
            )}
          </div>
        </div>

        {/* Лестница состояний: три шага, стрелки между ними — прогресс должен читаться. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
          <StepButton
            gate={calculateGate}
            icon={Calculator}
            label={sheet && state !== 'draft' ? t('payroll.recalculate', 'Пересчитать') : t('payroll.calculate', 'Рассчитать')}
            primary={!frozen}
            onClick={runCalculate}
          />
          <ArrowRight className="hidden sm:block w-4 h-4 text-slate-300 mt-3 shrink-0" />
          <StepButton
            gate={approveGate}
            icon={Lock}
            label={t('payroll.approve', 'Утвердить')}
            primary={state === 'calculated'}
            onClick={() => setConfirmApprove(true)}
          />
          <ArrowRight className="hidden sm:block w-4 h-4 text-slate-300 mt-3 shrink-0" />
          <StepButton
            gate={payGate}
            icon={Banknote}
            label={t('payroll.pay', 'Выплатить')}
            primary={state === 'approved'}
            onClick={() => setConfirmPay(true)}
          />
        </div>

        {state === 'paid' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {t('payroll.paidLinkHint', 'Выплаты записаны расходами в категории «Зарплата» и привязаны к этой ведомости.')}{' '}
              <Link to="/finances?tab=expenses" className="inline-flex items-center gap-1 font-semibold underline">
                {t('payroll.openExpenses', 'Открыть Финансы → Расходы')}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-medium underline shrink-0">
            {t('payroll.retry', 'Повторить')}
          </button>
        </div>
      ) : !sheet ? (
        <EmptyState
          icon={Calculator}
          title={t('payroll.noSheet', 'Ведомость за этот месяц ещё не рассчитана')}
          description={t('payroll.noSheetHint', 'Нажмите «Рассчитать» — система соберёт начисления по действующим ставкам и покажет, что не удалось учесть.')}
        />
      ) : (
        <>
          <DiagnosticsPanel diagnostics={sheet.diagnostics ?? []} teacherName={teacherName} />

          {/* Строки */}
          {sortedLines.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={t('payroll.noLines', 'В ведомости нет строк')}
              description={t('payroll.noLinesHint', 'Ни у одного преподавателя нет действующей ставки на этот месяц. Заведите ставки на вкладке «Ставки» и пересчитайте.')}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colTeacher', 'Преподаватель')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colBreakdown', 'Расшифровка')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('payroll.colComputed', 'Расчётная сумма')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('payroll.colFinal', 'Начислено по строке')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('payroll.colActions', 'Действия')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {linePageRows.map(line => {
                      const overridden = line.overrideMinor !== null && line.overrideMinor !== undefined;
                      return (
                        <tr
                          key={line.id}
                          className={`transition-colors ${
                            // Ручные строки визуально отделены: их ввёл человек, и
                            // спутать премию с расчётом системы нельзя.
                            line.isManual
                              ? 'bg-violet-50/60 dark:bg-violet-900/10 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                          }`}
                        >
                          <td className="px-5 py-3.5 align-top">
                            <p className="font-medium text-slate-900 dark:text-white leading-tight">
                              {line.teacherName || teacherName(line.teacherId)}
                            </p>
                            <div className="mt-1">{sourceBadge(line)}</div>
                          </td>
                          <td className="px-5 py-3.5 align-top">
                            {line.isManual ? (
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                {line.note || t('payroll.manualNoNote', 'Без комментария')}
                              </span>
                            ) : (
                              <LineBreakdown ruleSnapshot={line.ruleSnapshot} />
                            )}
                          </td>
                          <td className="px-5 py-3.5 align-top text-right whitespace-nowrap text-slate-500">
                            {formatMinorSigned(line.computedMinor)}
                          </td>
                          <td className="px-5 py-3.5 align-top text-right whitespace-nowrap">
                            <p className={`font-bold ${line.finalMinor < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                              {formatMinorSigned(line.finalMinor)}
                            </p>
                            {overridden && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 max-w-[14rem] ml-auto">
                                {t('payroll.overriddenBy', 'Изменено вручную: {{reason}}', { reason: line.overrideReason || '—' })}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 align-top text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {canWrite && !frozen && (
                                <button
                                  onClick={() => setEditingLine(line)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                  aria-label={t('payroll.editAmount', 'Изменить сумму')}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {canDeleteLine && !frozen && line.isManual && (
                                <button
                                  onClick={() => setPendingLineDelete(line)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                                  aria-label={t('payroll.deleteLine', 'Удалить строку')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                    {/* Когда штрафы у кого-то не погасились, подвал показывает ТРИ
                        строки, а не одну: сумма колонки, сколько из неё не
                        удержалось и сколько на самом деле уйдёт из кассы. Иначе
                        колонка «К выплате» не сходится с итогом, и директор
                        решает, что экран врёт. */}
                    {unrecoveredMinor > 0 && (
                      <>
                        <tr>
                          <td className="px-5 py-2.5 text-slate-500" colSpan={3}>
                            {t('payroll.totalAccruedRow', 'Начислено нетто (сумма колонки)')}
                          </td>
                          <td className="px-5 py-2.5 text-right text-slate-500 whitespace-nowrap">
                            {formatMinor(totalMinor)}
                          </td>
                          <td />
                        </tr>
                        <tr>
                          <td className="px-5 py-2.5 text-rose-700 dark:text-rose-300" colSpan={3}>
                            {t('payroll.unrecoveredRow', 'Штрафы, которые не из чего удержать: {{names}}', { names: unrecoveredNames })}
                            <span className="block text-[11px] text-slate-500 mt-0.5 font-normal">
                              {t(
                                'payroll.unrecoveredHint',
                                'Выплата такому преподавателю равна нулю — отрицательный расход в кассе невозможен. Остаток НЕ переносится в следующий месяц и не удерживается из уже выданного: чтобы его вернуть, заведите штраф в открытом периоде вручную.',
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right text-rose-700 dark:text-rose-300 whitespace-nowrap">
                            +{formatMinor(unrecoveredMinor)}
                          </td>
                          <td />
                        </tr>
                      </>
                    )}
                    <tr>
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white" colSpan={3}>
                        {t('payroll.totalPayableLabel', 'Уйдёт из кассы')}
                        {/* Пока ведомость дорисована не до конца, оговорка обязательна:
                            без неё итог читается как сумма видимых строк. */}
                        {lineHasMore && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500">
                            {t('payroll.totalAllPages', 'по всем строкам ведомости, а не по странице')}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatMinor(payableMinor)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <LazyListFooter
            visibleCount={linePageRows.length}
            total={lineTotal}
            hasMore={lineHasMore}
            sentinelRef={lineSentinelRef}
            onLoadMore={loadMoreLines}
          />

          {/* Ручные премии и штрафы */}
          {canWrite && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('payroll.manualTitle', 'Премия или штраф')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t(
                  'payroll.manualHint',
                  'Такие строки вводит человек, и пересчёт их не стирает: расчётные строки пересобираются, премии и штрафы остаются.',
                )}
              </p>

              {frozen ? (
                <p className="text-xs text-slate-500 mt-3">
                  {t('payroll.manualFrozen', 'Ведомость заморожена — добавить строку нельзя. Проведите корректировку в текущем открытом месяце.')}
                </p>
              ) : (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('payroll.teacher', 'Преподаватель')}</label>
                    <select
                      value={manual.teacherId}
                      onChange={e => setManual(m => ({ ...m, teacherId: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                    >
                      <option value="">{t('payroll.selectTeacher', 'Выберите преподавателя...')}</option>
                      {teachers.map(m => (
                        <option key={String(m.uid || m.id)} value={String(m.uid || m.id)}>
                          {m.displayName || String(m.uid || m.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('payroll.manualType', 'Тип')}</label>
                    <select
                      value={manual.source}
                      onChange={e => setManual(m => ({ ...m, source: e.target.value }))}
                      className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                    >
                      <option value="manual_bonus">{t('payroll.bonus', 'Премия')}</option>
                      <option value="manual_penalty">{t('payroll.penalty', 'Штраф')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('payroll.amountField', 'Сумма')}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manual.amount}
                        onChange={e => setManual(m => ({ ...m, amount: e.target.value }))}
                        placeholder="5000"
                        className="w-28 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                      />
                      <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('payroll.noteField', 'Комментарий')}</label>
                    <input
                      type="text"
                      value={manual.note}
                      onChange={e => setManual(m => ({ ...m, note: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                    />
                  </div>
                  <button
                    onClick={addManualLine}
                    disabled={busy}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4" />{t('payroll.add', 'Добавить')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Зарплатный баланс */}
      {!loading && balance.length > 0 && (
        <>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('payroll.balanceTitle', 'Зарплатный баланс')}
            </h3>
            {/* Таблица считает НАЧИСЛЕНИЕ минус КАССУ по всем утверждённым
                месяцам сразу, поэтому её колонки намеренно не сходятся с
                итогом ведомости выше — и об этом надо сказать, иначе расхождение
                читается как ошибка. Минус здесь бывает двух родов: переплата и
                непогашенный штраф. */}
            <p className="text-xs text-slate-500">
              {t(
                'payroll.balanceHint',
                'Начислено по утверждённым ведомостям минус фактически выданное — по всем месяцам сразу, а не за выбранный. Минус означает либо переплату, либо штраф, который не из чего было удержать.',
              )}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3 font-medium text-slate-500">{t('payroll.colTeacher', 'Преподаватель')}</th>
                  <th className="px-5 py-3 font-medium text-slate-500 text-right">{t('payroll.colAccrued', 'Начислено')}</th>
                  <th className="px-5 py-3 font-medium text-slate-500 text-right">{t('payroll.colPaid', 'Выдано')}</th>
                  <th className="px-5 py-3 font-medium text-slate-500 text-right">{t('payroll.colBalance', 'Баланс')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {balancePageRows.map(row => (
                  <tr key={row.teacherId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3 text-slate-900 dark:text-white whitespace-nowrap">
                      {row.teacherName || teacherName(row.teacherId)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500 whitespace-nowrap">{formatMinor(row.accruedMinor)}</td>
                    <td className="px-5 py-3 text-right text-slate-500 whitespace-nowrap">{formatMinor(row.paidMinor)}</td>
                    <td className={`px-5 py-3 text-right font-bold whitespace-nowrap ${
                      row.balanceMinor > 0 ? 'text-amber-600' : row.balanceMinor < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {formatMinor(row.balanceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <LazyListFooter
          visibleCount={balancePageRows.length}
          total={balanceTotal}
          hasMore={balanceHasMore}
          sentinelRef={balanceSentinelRef}
          onLoadMore={loadMoreBalance}
        />
        </>
      )}

      <ConfirmDialog
        open={confirmApprove}
        busy={busy}
        title={t('payroll.approve', 'Утвердить')}
        message={(
          <div className="space-y-2">
            {/* Здесь {{total}} — именно НЕТТО-начисление: сервер замораживает на
                периоде totalMinor, то есть сумму строк, а не выплату. */}
            <p>
              {t(
                'payroll.approveConfirmScoped',
                'Ведомость за {{period}} ({{scope}}) будет запечатана: пересчёт, правки сумм, премии и штрафы после этого станут невозможны. Итог {{total}} зафиксируется окончательно. Поздние корректировки нужно будет вносить в следующем открытом месяце.',
                { period: formatPeriodLabel(period), scope: scopeLabel, total: formatMinor(totalMinor) },
              )}
            </p>
            {unrecoveredMinor > 0 && (
              <p className="text-slate-500">
                {t(
                  'payroll.approveConfirmPayoutNote',
                  'Из кассы при выплате уйдёт {{payable}}: у {{names}} штрафы превысили начисленное, и выплата им обнуляется — отрицательный расход невозможен.',
                  { payable: formatMinor(payableMinor), names: unrecoveredNames },
                )}
              </p>
            )}
          </div>
        )}
        confirmLabel={t('payroll.approveConfirmLabel', 'Утвердить и заморозить')}
        onConfirm={runApprove}
        onClose={() => setConfirmApprove(false)}
      />

      <ConfirmDialog
        open={confirmPay}
        danger
        busy={busy}
        title={t('payroll.pay', 'Выплатить')}
        message={(
          <div className="space-y-2">
            {/* {{total}} — ДЕНЬГИ ИЗ КАССЫ, а не сумма колонки: подтверждают
                именно перевод, и число в диалоге обязано совпасть с расходами. */}
            <p>
              {t(
                'payroll.payConfirm',
                'По каждой строке будет создан расход в Финансы → Расходы, категория «Зарплата», на общую сумму {{total}}. Отменить это отсюда нельзя — ошибочные записи придётся править в разделе Финансы вручную.',
                { total: formatMinor(payableMinor) },
              )}
            </p>
            {unrecoveredMinor > 0 && (
              <p className="text-rose-700 dark:text-rose-300">
                {t(
                  'payroll.payConfirmUnrecovered',
                  'Начислено нетто {{net}}, но выплата составит {{payable}}: у {{names}} штрафы превысили начисленное, выплата им равна нулю. Непогашенный остаток {{unrecovered}} никуда не переносится и из уже выданного не удерживается — если его нужно вернуть, заведите штраф в открытом периоде.',
                  {
                    net: formatMinor(totalMinor),
                    payable: formatMinor(payableMinor),
                    unrecovered: formatMinor(unrecoveredMinor),
                    names: unrecoveredNames,
                  },
                )}
              </p>
            )}
          </div>
        )}
        confirmLabel={t('payroll.payConfirmLabel', 'Выплатить и записать в расходы')}
        onConfirm={runPay}
        onClose={() => setConfirmPay(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingLineDelete)}
        danger
        busy={busy}
        title={t('payroll.deleteLine', 'Удалить строку')}
        message={t('payroll.deleteLineConfirm', 'Строка будет удалена из ведомости без возможности восстановления.')}
        confirmLabel={t('payroll.delete', 'Удалить')}
        onConfirm={() => pendingLineDelete && runDeleteLine(pendingLineDelete)}
        onClose={() => setPendingLineDelete(null)}
      />

      {editingLine && sheet && (
        <LineAmountModal
          periodId={sheet.id}
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={load}
        />
      )}
    </div>
  );
};

export default SheetTab;
