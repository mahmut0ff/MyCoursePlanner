import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Calculator,
  CalendarRange,
  CheckCircle2,
  Download,
  ExternalLink,
  Lock,
  Scale,
  Search,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiApprovePayroll,
  apiCalculatePayroll,
  apiDeletePayrollLine,
  apiGetPayrollBalance,
  apiGetPayrollOverview,
  apiPayPayroll,
} from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LazyListFooter from '../../components/ui/LazyListFooter';
import { useLazyList } from '../../hooks/useLazyList';
import { buildCsv, downloadCsv } from '../../lib/csv';
import { formatDayKey } from '../../lib/money';
import { orgDayKey } from '../../lib/payment-plans';
import type { PayrollLine, PayrollPeriod, PayrollPeriodState } from '../../types';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import type { PayrollDiagnostic } from './components/DiagnosticsPanel';
import LineAmountModal from './components/LineAmountModal';
import ManualLineModal from './components/ManualLineModal';
import RateModal from './components/RateModal';
import TeacherRow from './components/TeacherRow';
import type { OverviewTeacher } from './components/TeacherRow';
import {
  currentPeriodKey,
  describeComponents,
  formatMinor,
  formatPeriodLabel,
  PERIOD_STATE_STYLE,
  type Translate,
} from './payrollFormat';
import { allocatePayout } from './payrollPayout';

/** Ответ api-payroll?action=overview — всё, что нужно экрану за один запрос. */
interface Overview {
  period: string;
  windowStart: string;
  windowEnd: string;
  sheet: PayrollPeriod | null;
  lines: PayrollLine[];
  diagnostics: PayrollDiagnostic[];
  teachers: OverviewTeacher[];
}

interface BalanceRow {
  teacherId: string;
  teacherName: string;
  accruedMinor: number;
  paidMinor: number;
  balanceMinor: number;
}

/** Можно ли действие в этом состоянии и, если нет, почему — по-русски. */
interface Gate { enabled: boolean; reason: string }

/**
 * Граница окна расчёта человеческим днём.
 *
 * День берём в календаре ОРГАНИЗАЦИИ (UTC+6), в котором сервер и строит окно:
 * начало августовской ведомости лежит в ISO как '2026-07-31T18:00:00Z', и
 * прямое чтение даты из строки назвало бы началом августа 31 июля.
 */
const formatWindowBound = (iso?: string): string => {
  const ms = new Date(String(iso || '')).getTime();
  return Number.isFinite(ms) ? formatDayKey(orgDayKey(new Date(ms))) : '—';
};

/**
 * «Зарплата» — один экран, и он идёт ОТ ПРЕПОДАВАТЕЛЯ.
 *
 * Раньше раздел состоял из двух вкладок: «Ставки» (где заводились карточки с
 * названием, сроком действия и галочками по курсам) и «Ведомость» (где
 * появлялись суммы). Связь между ними — «столько заплатили его студенты, значит
 * столько зарплата» — не была видна нигде, и проверить число можно было только
 * пересчитав вручную.
 *
 * Теперь порядок один: выбрал месяц → видишь список преподавателей → раскрыл
 * человека → видишь его группы, его студентов, кто сколько заплатил, и как из
 * этого вышла сумма. Ставка правится тут же, в его строке.
 *
 * Жизненный цикл месяца (Рассчитать → Утвердить → Выплатить) остался: пока
 * ведомость не рассчитана, суммы — предпросмотр «что выйдет»; после расчёта —
 * то, что зафиксировано; после утверждения ничего не пересчитывается.
 */
const PayrollPage: React.FC = () => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const { can } = usePermissions();

  const canWrite = can('payroll', 'write');
  const canDeleteLine = can('payroll', 'delete');

  const [period, setPeriod] = useState(currentPeriodKey());
  const [data, setData] = useState<Overview | null>(null);
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [rateFor, setRateFor] = useState<OverviewTeacher | null>(null);
  const [manualFor, setManualFor] = useState<{ teacher: OverviewTeacher; source: 'manual_bonus' | 'manual_penalty' } | null>(null);
  const [editingLine, setEditingLine] = useState<PayrollLine | null>(null);
  const [pendingLineDelete, setPendingLineDelete] = useState<PayrollLine | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // Сбрасываем данные СРАЗУ, а не только при успехе: пока на экране висит
    // чужой месяц, кнопки «Утвердить» и «Выплатить» действуют именно на него —
    // runApprove/runPay берут id из этого же состояния.
    setData(null);
    setBalance([]);
    try {
      const [overview, balanceData] = await Promise.all([
        apiGetPayrollOverview({ period }),
        apiGetPayrollBalance(),
      ]);
      setData(overview as Overview);
      setBalance(Array.isArray(balanceData) ? balanceData : []);
    } catch (e: any) {
      setError(e?.message || t('payroll.loadFailed', 'Не удалось загрузить данные'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => {
    load();
  }, [load]);

  const sheet = data?.sheet ?? null;
  const state: PayrollPeriodState = sheet?.state ?? 'draft';
  const stateStyle = PERIOD_STATE_STYLE[state];
  const frozen = state === 'approved' || state === 'paid';
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const teachers = useMemo(() => data?.teachers ?? [], [data]);

  /**
   * Какие дни попали в расчёт. Название месяца этого не отвечает: в ведомости
   * окно ЗАМОРОЖЕНО при расчёте, и пересчитанный позже месяц может охватывать
   * не то же, что ждёт директор. Показываем границы, чтобы «почему платёж не
   * учтён» проверялось взглядом, а не поддержкой.
   */
  const windowLabel = data
    ? t('payroll.windowChip', 'Расчёт с {{from}} по {{to}}', {
        from: formatWindowBound(data.windowStart),
        to: formatWindowBound(data.windowEnd),
      })
    : '';

  const teacherName = useCallback(
    (id: string) => teachers.find(x => x.teacherId === id)?.teacherName
      || balance.find(b => b.teacherId === id)?.teacherName
      || id,
    [teachers, balance],
  );

  /**
   * ДВА РАЗНЫХ ЧИСЛА, и путать их нельзя.
   *
   * netAccruedMinor — сумма всех строк; именно её сервер замораживает при
   * утверждении. payableMinor — то, что реально уйдёт из кассы: штраф гасится
   * положительными строками ТОГО ЖЕ преподавателя и упирается в ноль,
   * отрицательного расхода не бывает.
   */
  const payout = useMemo(() => allocatePayout(lines), [lines]);

  /**
   * Пока ведомости нет, итог — сумма предпросмотров: директор должен видеть
   * порядок суммы ДО расчёта, иначе первый шаг делается вслепую.
   */
  const previewTotalMinor = useMemo(
    () => teachers.reduce((sum, x) => sum + (x.previewMinor ?? 0), 0),
    [teachers],
  );
  const totalMinor = sheet ? payout.netAccruedMinor : previewTotalMinor;
  const payableMinor = sheet ? payout.payableMinor : previewTotalMinor;
  const unrecoveredMinor = payout.unrecoveredMinor;

  const unrecoveredNames = useMemo(
    () => payout.unrecoveredTeachers
      .map(row => `${row.teacherName || teacherName(row.teacherId)} (${formatMinor(row.unrecoveredMinor)})`)
      .join(', '),
    [payout.unrecoveredTeachers, teacherName],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(x => (x.teacherName || x.teacherId).toLowerCase().includes(q));
  }, [teachers, search]);

  // Ленивый рендер как в остальных списках; итог в шапке по-прежнему считается
  // по ВСЕМ преподавателям, а не по отрисованным.
  const { visible: pageRows, total, hasMore, sentinelRef, loadMore } = useLazyList(filtered, {
    resetKey: `${period}|${search}`,
  });

  // ── Гейты жизненного цикла ────────────────────────────────────────────────
  const calculateGate: Gate = frozen
    ? {
        enabled: false,
        reason: state === 'paid'
          ? t('payroll.gateCalcPaid', 'Зарплата за месяц выплачена — пересчитать нельзя. Корректировки вносите в текущем открытом месяце.')
          : t('payroll.gateCalcApproved', 'Месяц утверждён — пересчитать нельзя. Корректировки вносите в текущем открытом месяце.'),
      }
    : { enabled: true, reason: '' };

  const approveGate: Gate = (() => {
    if (state === 'approved') return { enabled: false, reason: t('payroll.gateApproveDone', 'Уже утверждено.') };
    if (state === 'paid') return { enabled: false, reason: t('payroll.gateApprovePaid', 'Уже выплачено.') };
    if (!sheet) return { enabled: false, reason: t('payroll.gateApproveDraft', 'Сначала рассчитайте — утверждать пока нечего.') };
    return { enabled: true, reason: '' };
  })();

  const payGate: Gate = (() => {
    if (state === 'paid') return { enabled: false, reason: t('payroll.gatePayDone', 'Выплачено. Расходы уже в кассе.') };
    if (state !== 'approved') return { enabled: false, reason: t('payroll.gatePayNotApproved', 'Выплатить можно только утверждённое.') };
    return { enabled: true, reason: '' };
  })();

  /**
   * Совпадает ли ведомость на экране с тем, что выбрано СЕЙЧАС. Последняя линия
   * обороны перед необратимым действием: утверждать и выплачивать документ
   * чужого месяца нельзя даже при разъехавшемся состоянии.
   */
  const sheetMatchesSelection = (): boolean => !!sheet && sheet.period === period;

  // ── Действия ──────────────────────────────────────────────────────────────
  const runCalculate = async () => {
    setBusy(true);
    try {
      // Месяц — единственное измерение расчёта: ведомость одна на организацию,
      // а филиалы появляются только в разбивке уже начисленной суммы.
      await apiCalculatePayroll({ period });
      toast.success(t('payroll.calculated', 'Зарплата рассчитана'));
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.calculateFailed', 'Не удалось рассчитать'));
    } finally {
      setBusy(false);
    }
  };

  const runApprove = async () => {
    if (!sheet) return;
    if (!sheetMatchesSelection()) {
      toast.error(t('payroll.staleSheet', 'Данные на экране не совпадают с выбранным месяцем. Обновите страницу.'));
      setConfirmApprove(false);
      await load();
      return;
    }
    setBusy(true);
    try {
      await apiApprovePayroll(sheet.id);
      toast.success(t('payroll.approved', 'Утверждено'));
      setConfirmApprove(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.approveFailed', 'Не удалось утвердить'));
    } finally {
      setBusy(false);
    }
  };

  const runPay = async () => {
    if (!sheet) return;
    if (!sheetMatchesSelection()) {
      toast.error(t('payroll.staleSheet', 'Данные на экране не совпадают с выбранным месяцем. Обновите страницу.'));
      setConfirmPay(false);
      await load();
      return;
    }
    setBusy(true);
    try {
      const res: any = await apiPayPayroll({ periodId: sheet.id });
      // 207: часть строк не записалась. Сервер намеренно оставляет период
      // неоплаченным, чтобы повтор дописал остаток — говорим это вслух.
      if (Array.isArray(res?.failed) && res.failed.length) {
        toast.error(t('payroll.payPartial', 'Записано строк: {{ok}}, не прошло: {{bad}}. Повторите выплату — уже выплаченное не задвоится.', {
          ok: res.written ?? 0,
          bad: res.failed.length,
        }));
      } else {
        toast.success(t('payroll.paid', 'Зарплата выплачена и записана в расходы'));
      }
      for (const warning of res?.warnings ?? []) toast(warning.message, { icon: '⚠️' });
      setConfirmPay(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.payFailed', 'Не удалось провести выплату'));
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
    if (!teachers.length) return;
    const csv = buildCsv(
      [
        t('payroll.colTeacher', 'Преподаватель'),
        t('payroll.colRate', 'Ставка'),
        t('payroll.colGroups', 'Групп'),
        t('payroll.colStudents', 'Студентов'),
        t('payroll.colCollected', 'Оплатили студенты'),
        t('payroll.colAccruedShort', 'Начислено'),
        t('payroll.colBonusPenalty', 'Премии и штрафы'),
        // Отдельная колонка, потому что «Начислено» НЕ равно тому, что уйдёт из
        // кассы: штрафы гасятся строками того же преподавателя.
        t('payroll.colPayable', 'Уйдёт из кассы'),
      ],
      teachers.map(x => {
        const manualMinor = x.manualLines.reduce((sum, l) => sum + (l.finalMinor || 0), 0);
        const accrued = x.line ? x.line.finalMinor : (x.previewMinor ?? 0);
        const payable = [x.line, ...x.manualLines]
          .filter(Boolean)
          .reduce((sum, l) => sum + (payout.payableByLineId.get((l as PayrollLine).id) ?? 0), 0);
        return [
          x.teacherName || x.teacherId,
          x.rule ? describeComponents(x.rule.components, tr) : '',
          x.groups.length,
          x.studentCount,
          // Числа выгружаем сырыми в сомах: formatMinor добавил бы «с.», и
          // таблица перестала бы считать колонку числовой.
          x.collectedMinor / 100,
          accrued / 100,
          manualMinor / 100,
          sheet ? payable / 100 : accrued / 100,
        ];
      }),
    );
    downloadCsv(`payroll-${period}.csv`, csv);
  };

  const StepButton: React.FC<{
    gate: Gate;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    primary: boolean;
    onClick: () => void;
  }> = ({ gate, icon: Icon, label, primary, onClick }) => (
    <div className="flex-1 min-w-[11rem]">
      <button
        onClick={onClick}
        // `loading || error` — часть условия, а не украшение: пока идёт загрузка,
        // на экране ещё нет данных выбранного месяца, а после ошибки нет
        // достоверных данных вообще.
        disabled={!gate.enabled || busy || !canWrite || loading || !!error}
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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-500" />
            {t('nav.payroll', 'Зарплата')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('payroll.subtitle', 'Выберите месяц и преподавателя: видно его группы, оплаты студентов и сумму к выдаче')}
          </p>
        </div>
      </div>

      {/* Шапка месяца */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value || currentPeriodKey())}
              aria-label={t('payroll.periodField', 'Месяц')}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
            />
            <span className="text-sm text-slate-400">{formatPeriodLabel(period)}</span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${stateStyle.badge}`}>
              {sheet ? t(stateStyle.key, stateStyle.fallback) : t('payroll.stateNone', 'Не рассчитано')}
            </span>
            {/* Границы окна — рядом со статусом: месяц называет период, а даты
                говорят, какие именно оплаты в него вошли. */}
            {windowLabel && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                <CalendarRange className="w-3 h-3" />{windowLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              {/* После выплаты «к выплате» — уже неправда: деньги ушли. */}
              <p className="text-xs text-slate-500">
                {state === 'paid'
                  ? t('payroll.totalLabelPaid', 'Выплачено')
                  : sheet
                    ? t('payroll.totalLabel', 'Итого к выплате')
                    : t('payroll.totalLabelPreview', 'Выйдет по ставкам')}
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMinor(payableMinor)}</p>
              {unrecoveredMinor > 0 && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('payroll.totalAccruedAside', 'начислено нетто {{net}}', { net: formatMinor(totalMinor) })}
                </p>
              )}
            </div>
            {teachers.length > 0 && (
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
            label={sheet ? t('payroll.recalculate', 'Пересчитать') : t('payroll.calculate', 'Рассчитать')}
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

        {!sheet && !loading && !error && (
          <p className="text-xs text-slate-500">
            {t(
              'payroll.previewHint',
              'Суммы ниже — предварительные: так выйдет по действующим ставкам на сегодняшних оплатах. Нажмите «Рассчитать», чтобы зафиксировать месяц.',
            )}
          </p>
        )}

        {state === 'paid' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {t('payroll.paidLinkHint', 'Выплаты записаны расходами в категории «Зарплата» и привязаны к этому месяцу.')}{' '}
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
      ) : (
        <>
          <DiagnosticsPanel diagnostics={data?.diagnostics ?? []} teacherName={teacherName} />

          {teachers.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={t('payroll.noTeachers', 'Преподавателей нет')}
              description={t('payroll.noTeachersHint', 'Добавьте преподавателей в команду и назначьте их в группы — тогда здесь появится расчёт зарплаты.')}
            />
          ) : (
            <>
              {teachers.length > 6 && (
                <div className="relative sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('payroll.searchTeachers', 'Поиск преподавателя...')}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
                  />
                </div>
              )}

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={t('payroll.nothingFound', 'Ничего не найдено')}
                  description={t('payroll.tryOtherSearch', 'Попробуйте другое имя')}
                />
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  {pageRows.map(teacher => (
                    <TeacherRow
                      key={teacher.teacherId}
                      teacher={teacher}
                      expanded={expandedId === teacher.teacherId}
                      onToggle={() => setExpandedId(id => (id === teacher.teacherId ? null : teacher.teacherId))}
                      canWrite={canWrite}
                      canDeleteLine={canDeleteLine}
                      frozen={frozen}
                      canAddManual={canWrite && !frozen && Boolean(sheet)}
                      onEditRate={() => setRateFor(teacher)}
                      onAddManual={source => setManualFor({ teacher, source })}
                      onEditAmount={line => setEditingLine(line)}
                      onDeleteLine={line => setPendingLineDelete(line)}
                    />
                  ))}
                </div>
              )}

              <LazyListFooter
                visibleCount={pageRows.length}
                total={total}
                hasMore={hasMore}
                sentinelRef={sentinelRef}
                onLoadMore={loadMore}
              />

              {canWrite && !sheet && (
                <p className="text-xs text-slate-500 px-1">
                  {t('payroll.manualNeedsSheet', 'Премии и штрафы можно добавить после расчёта месяца — им нужна ведомость, в которой они сохранятся.')}
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* Зарплатный баланс */}
      {!loading && balance.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <Scale className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('payroll.balanceTitle', 'Зарплатный баланс')}
            </h3>
            {/* Таблица считает НАЧИСЛЕНИЕ минус КАССУ по всем утверждённым
                месяцам сразу, поэтому её колонки намеренно не сходятся с итогом
                выше — и об этом надо сказать, иначе расхождение читается как
                ошибка. */}
            <p className="text-xs text-slate-500">
              {t(
                'payroll.balanceHint',
                'Начислено по утверждённым месяцам минус фактически выданное — по всем месяцам сразу, а не за выбранный. Минус означает либо переплату, либо штраф, который не из чего было удержать.',
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
                {balance.map(row => (
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
      )}

      <ConfirmDialog
        open={confirmApprove}
        busy={busy}
        title={t('payroll.approve', 'Утвердить')}
        message={(
          <div className="space-y-2">
            <p>
              {t(
                'payroll.approveConfirmScoped',
                'Зарплата за {{period}} будет запечатана: пересчёт, правки сумм, премии и штрафы после этого станут невозможны. Итог {{total}} зафиксируется окончательно. Поздние корректировки нужно будет вносить в следующем открытом месяце.',
                { period: formatPeriodLabel(period), total: formatMinor(totalMinor) },
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
            <p>
              {t(
                'payroll.payConfirm',
                'По каждому преподавателю будет создан расход в Финансы → Расходы, категория «Зарплата», на общую сумму {{total}}. Отменить это отсюда нельзя — ошибочные записи придётся править в разделе Финансы вручную.',
                { total: formatMinor(payableMinor) },
              )}
            </p>
            {unrecoveredMinor > 0 && (
              <p className="text-rose-700 dark:text-rose-300">
                {t(
                  'payroll.payConfirmUnrecovered',
                  'Начислено нетто {{net}}, но выплата составит {{payable}}: у {{names}} штрафы превысили начисленное, выплата им равна нулю. Непогашенный остаток {{unrecovered}} никуда не переносится и из уже выданного не удерживается.',
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
        message={t('payroll.deleteLineConfirm', 'Строка будет удалена без возможности восстановления.')}
        confirmLabel={t('payroll.delete', 'Удалить')}
        onConfirm={() => pendingLineDelete && runDeleteLine(pendingLineDelete)}
        onClose={() => setPendingLineDelete(null)}
      />

      {rateFor && (
        <RateModal
          teacherId={rateFor.teacherId}
          teacherName={rateFor.teacherName}
          rule={rateFor.rule as any}
          baseMinor={rateFor.baseMinor}
          onClose={() => setRateFor(null)}
          onSaved={load}
        />
      )}

      {manualFor && sheet && (
        <ManualLineModal
          periodId={sheet.id}
          teacherId={manualFor.teacher.teacherId}
          teacherName={manualFor.teacher.teacherName}
          source={manualFor.source}
          onClose={() => setManualFor(null)}
          onSaved={load}
        />
      )}

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

export default PayrollPage;
