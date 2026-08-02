import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  MinusCircle,
  Pencil,
  Search,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiDeletePaymentPlan, apiGetPaymentPlans, orgGetCourses, orgGetGroups, orgGetStudents } from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { formatMoney, formatMonthKey, formatDayKey } from '../../../lib/money';
import { isDebtBearingPlan, isWrittenOffPlan, isPlanOverdue, planDebt, planDiscount, planPeriodKey, planProgressKey } from '../../../lib/payment-plans';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import RowMenu from '../../../components/ui/RowMenu';
import type { RowMenuItem } from '../../../components/ui/RowMenu';
import LazyListFooter from '../../../components/ui/LazyListFooter';
import { useLazyList } from '../../../hooks/useLazyList';
import AcceptPaymentModal from '../../../components/finance/AcceptPaymentModal';
import PaymentHistoryModal from '../../../components/finance/PaymentHistoryModal';
import EditPlanAmountModal from '../../../components/finance/EditPlanAmountModal';
import BillMonthModal from '../../../components/finance/BillMonthModal';
import type { BillCandidate } from '../../../components/finance/BillMonthModal';
import type { DebtsFilters } from '../FinancesPage';

interface Props {
  filters: DebtsFilters;
  onFiltersChange: (next: DebtsFilters) => void;
  month: string;
  onMonthChange: (m: string) => void;
  /** Ограничить одним студентом (?student=<uid>). Пусто — показываем всех. */
  studentId?: string;
  onStudentNameResolved?: (name: string) => void;
  /**
   * Режим «все неоплаченные»: месяц перестаёт быть жёстким фильтром.
   *
   * Экран отвечал только на вопрос «кто оплатил за ЭТОТ месяц», а директор
   * спрашивает «кто должен». Долг же копится по РАЗНЫМ месяцам: у студента с
   * долгом 12 000 это июнь и июль, а за август ему ещё не начисляли — и переход
   * «Открыть в финансах» с его карточки приводил на заведомо пустой экран
   * «За этот месяц ещё не начисляли», пока чип сверху уверял «Только один
   * студент: Айгуль». Менеджер решал, что долг погашен или что карточка врёт.
   */
  unpaidOnly?: boolean;
  /**
   * Снять фильтр МЕСЯЦА — ось, отдельная от «только должники».
   *
   * Приход с карточки студента обязан показать все его счета за все месяцы,
   * ВКЛЮЧАЯ оплаченные: иначе заплативший студент снова даёт пустой экран с
   * текстом «За этот месяц ещё не начисляли» — ровно та ложь, ради устранения
   * которой режим и заводился.
   */
  allMonths?: boolean;
  onUnpaidOnlyChange?: (next: boolean) => void;
}

interface PaymentPlan {
  id: string;
  studentId: string;
  studentName?: string;
  courseId?: string;
  courseName?: string;
  totalAmount: number;
  listAmount?: number;
  paidAmount: number;
  status: string;
  deadline?: string;
  period?: string;
  createdAt?: string;
}

type ModalType = 'none' | 'pay' | 'history' | 'editAmount';

const collator = new Intl.Collator('ru');
const isExpelled = (s: any) => (s?.status || 'active') === 'expelled';
const studentKey = (s: any) => String(s.uid || s.id);

/** Сдвиг месяца 'YYYY-MM' на delta месяцев, в UTC чтобы не съезжать по зоне. */
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Подпись месяца — общий форматтер (src/lib/money.ts): помесячный срез, выбор
// счёта при приёме оплаты и история платежей обязаны называть месяц одинаково.
const monthLabel = formatMonthKey;

/**
 * Бейдж строки = ТОЛЬКО прогресс оплаты (planProgressKey). Просрочка — отдельная
 * ось (метка «срок прошёл» по isPlanOverdue), а не подмена статуса. Ключ 'pending'
 * нейтрально-серый: неоплаченный, но ещё не просроченный счёт — это «Ожидает», а
 * не «Не оплачено» красным. Иначе оплата 28-го выглядела долгом уже 1-го числа.
 */
const PROGRESS_META: Record<string, { key: string; fallback: string; cls: string; Icon: typeof Clock }> = {
  paid: { key: 'finances.statusPaidMonth', fallback: 'Оплачено', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', Icon: CheckCircle2 },
  partial: { key: 'finances.statusPartial', fallback: 'Частично', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', Icon: Clock },
  pending: { key: 'finances.statusPending', fallback: 'Ожидает', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', Icon: Clock },
  cancelled: { key: 'finances.statusWrittenOff', fallback: 'Списан', cls: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500', Icon: Ban },
};

/**
 * «Оплаты за месяц» — что заплатили за выбранный месяц и кто ещё нет. Это тот же
 * движок payment-plans, но сгруппированный по месяцу: одно начисление = один
 * студент за один курс за месяц. Ежемесячная сумма у каждого своя и переносится
 * из прошлого месяца при «Начислить».
 */
const MonthTab: React.FC<Props> = ({
  filters, onFiltersChange, month, onMonthChange, studentId = '', onStudentNameResolved,
  unpaidOnly = false, allMonths = false, onUnpaidOnlyChange,
}) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();
  const { canRead } = usePermissions();
  // «Собрано за месяц» — сводная сумма дохода. Роль с оплатами, но без
  // `finance_overview`, видит счётчики «оплатили / не оплатили», но не сумму.
  const canOverview = canRead('finance_overview');

  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState<ModalType>('none');
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  const [showBill, setShowBill] = useState(false);

  // Удаление в два шага — как на прежней вкладке: если к начислению привязаны
  // оплаты, сервер отвечает 409 и мы переспрашиваем, назвав их число.
  const [pendingDelete, setPendingDelete] = useState<PaymentPlan | null>(null);
  const [forceDelete, setForceDelete] = useState<{ plan: PaymentPlan; linked: number | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([apiGetPaymentPlans(), orgGetStudents(), orgGetGroups(), orgGetCourses()])
      .then(([planData, studentData, groupData, courseData]: [any, any, any, any]) => {
        setPlans(Array.isArray(planData) ? planData : []);
        setAllStudents(Array.isArray(studentData) ? studentData : []);
        setGroups(Array.isArray(groupData) ? groupData : []);
        setCourses(Array.isArray(courseData) ? courseData : []);
      })
      .catch((e: any) => setError(e?.message || t('finances.loadFailed', 'Не удалось загрузить данные')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
    // activeBranchId: api-слой штампует его в GET, смена филиала обязана перезагрузить.
  }, [load, activeBranchId]);

  const setSearch = (search: string) => onFiltersChange({ ...filters, search });

  const studentById = useMemo(() => new Map(allStudents.map(s => [studentKey(s), s])), [allStudents]);

  // Цена курса по id — прайсовая база: подставляем в «Начислить» для новых
  // студентов и передаём как listAmount, чтобы скидка считалась от цены курса.
  const coursePriceById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of courses) {
      const price = Number(c.price);
      if (Number.isFinite(price)) m.set(String(c.id), price);
    }
    return m;
  }, [courses]);

  /**
   * Курсы, которые действительно оплачиваются ПОМЕСЯЧНО.
   *
   * «Начислить за месяц» предлагало студентов любых курсов, включая разовые
   * (`paymentFormat: 'one-time'`), и выставляло им полную цену курса — каждый
   * месяц заново. Автоматический крон так не делает: он берёт только
   * `paymentFormat == 'monthly'`, то есть ручной путь противоречил
   * автоматическому на одних и тех же данных.
   *
   * Отсутствующий формат считаем помесячным: у легаси-курсов поля нет, а
   * форма курса подставляет 'monthly' по умолчанию — белый список отсёк бы их
   * все. Разовый счёт по-прежнему выставляется кнопкой «Выставить счёт» на
   * карточке студента.
   */
  const monthlyCourseIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of courses) {
      if ((c.paymentFormat ?? 'monthly') === 'monthly') s.add(String(c.id));
    }
    return s;
  }, [courses]);

  // Начисления выбранного месяца, без отчисленных студентов.
  //
  // В режиме «все неоплаченные» фильтр по месяцу снимается: долг живёт не в
  // одном месяце, и вопрос «кто должен» на месячном срезе не имеет ответа.
  const monthPlans = useMemo(
    () => plans.filter(p =>
      (allMonths || planPeriodKey(p) === month)
      && !isExpelled(studentById.get(String(p.studentId)))),
    [plans, month, studentById, allMonths]
  );

  // Что реально показываем и считаем на «кто оплатил за месяц». Убираем ровно
  // один вид шума — списанный счёт (status: 'cancelled'): денег по нему
  // академия не ждёт, и в «ещё не оплатили» он не нужен.
  //
  // Раньше здесь стояло ещё и условие `studentById.has(...)` — «студента нет в
  // ростере, значит он удалён». Под филиальным срезом это неверно: ростер
  // (orgGetStudents) тоже отфильтрован филиалом, а филиал СТУДЕНТА и филиал
  // СЧЁТА — разные оси. Из списка молча исчезал каждый счёт, чей студент не
  // приписан к выбранному филиалу или не приписан ни к какому вовсе, — а это
  // массовый случай, не аномалия. Счёт при этом оставался в дебиторке «Обзора»:
  // директор видел долг в сводке и не находил строки, чтобы принять по нему
  // оплату. Менеджеру, запертому в одном филиале, деваться было и вовсе некуда —
  // переключиться на «Все филиалы» он не может.
  //
  // Неразрешимый студент теперь рисуется по денормализованному p.studentName
  // (см. рендер строки ниже), а не выбрасывается. Это заодно возвращает на экран
  // счета удалённых студентов — их долг тоже считается в KPI, и закрыть его
  // раньше было негде.
  //
  // monthPlans трогать нельзя: дедуп «Начислить» (candidates) обязан видеть ВСЕ
  // счёта месяца, иначе выставит повторно.
  const activePlans = useMemo(
    () => monthPlans.filter(p => !isWrittenOffPlan(p)),
    [monthPlans]
  );

  // Перенос суммы: самое свежее по месяцу начисление на (студент, курс).
  //
  // По счёту, закрытому разовой скидкой (settledByDiscount — отметка «оплачено
  // полностью» в приёме оплаты), переносим ПРАЙСОВУЮ цену, а не урезанную.
  // Иначе прощённые один раз 500 сом становились постоянной ценой: следующий
  // месяц предлагался на 500 дешевле, и так до тех пор, пока кто-нибудь не
  // заметит. Договорную цену задают правкой «суммы к оплате» — она переносится
  // дальше, и это осознанно.
  const lastAmountByKey = useMemo(() => {
    const best = new Map<string, { period: string; amount: number }>();
    for (const p of plans) {
      const amt = (p as any).settledByDiscount
        ? Number((p as any).listAmount ?? p.totalAmount)
        : Number(p.totalAmount);
      if (!Number.isFinite(amt)) continue;
      const k = `${p.studentId}|${p.courseId}`;
      const per = planPeriodKey(p) || '';
      const cur = best.get(k);
      if (!cur || per > cur.period) best.set(k, { period: per, amount: amt });
    }
    return best;
  }, [plans]);

  // Кандидаты на «Начислить»: активные студенты в группах курса, у кого за этот
  // месяц счёта ещё нет. Сумма перенесена из прошлого; дубликат (студент в двух
  // группах одного курса) сворачиваем по ключу студент|курс.
  const candidates = useMemo<BillCandidate[]>(() => {
    const billed = new Set(monthPlans.map(p => `${p.studentId}|${p.courseId}`));
    const byKey = new Map<string, BillCandidate>();
    for (const g of groups) {
      const courseId = g.courseId;
      if (!courseId) continue;
      // Разовый курс помесячно не начисляют — см. monthlyCourseIds.
      if (!monthlyCourseIds.has(String(courseId))) continue;
      // Закрытая группа тоже не порождает начислений: тот же фильтр, что и в
      // кроне monthly-billing. Пустой status = легаси-активная.
      if (g.status && g.status !== 'active') continue;
      for (const sid of (g.studentIds || [])) {
        const student = studentById.get(String(sid));
        if (!student || isExpelled(student)) continue;
        const k = `${sid}|${courseId}`;
        if (billed.has(k) || byKey.has(k)) continue;
        // Сумма к оплате: перенос из прошлого месяца → цена курса → null.
        // Новый студент без истории теперь начисляется по цене курса (её всё ещё
        // можно поправить в окне), а не оставляет менеджера гадать сумму.
        const price = coursePriceById.get(String(courseId)) ?? null;
        byKey.set(k, {
          studentId: String(sid),
          studentName: student.displayName || '',
          courseId,
          courseName: g.courseName || g.name || '',
          branchId: g.branchId || null,
          amount: lastAmountByKey.get(k)?.amount ?? price,
          listAmount: price,
        });
      }
    }
    return [...byKey.values()].sort((a, b) => collator.compare(a.studentName, b.studentName));
  }, [groups, studentById, monthPlans, lastAmountByKey, coursePriceById, monthlyCourseIds]);

  // Сводка ВСЕГДА про выбранный месяц, даже когда список показывает все месяцы.
  // Иначе подписи («Оплачено по начислениям месяца», «Оплатили X из Y») врут:
  // директор, открывший плитку «Долги», читал бы двухлетний итог как августовский.
  const monthScoped = useMemo(
    () => activePlans.filter(p => planPeriodKey(p) === month),
    [activePlans, month]
  );

  const stats = useMemo(() => ({
    total: monthScoped.length,
    // По тому же предикату, что и бейджи строк (planProgressKey), а не по сырому
    // p.status: легаси-план без суммы со status:'paid' иначе считался бы «оплачен»
    // в тайле, но рисовался «Частично» в строке — тайл и строки противоречили бы.
    paid: monthScoped.filter(p => planProgressKey(p) === 'paid').length,
    collected: monthScoped.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0),
    unpaid: monthScoped.filter(p => isDebtBearingPlan(p)).length,
  }), [monthScoped]);


  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return activePlans
      .filter(p => {
        if (studentId && String(p.studentId) !== studentId) return false;
        // «Только должники» — заявленный в типе DebtsFilters.status фильтр,
        // который до сих пор нигде не отрисовывался. В режиме «все
        // неоплаченные» он включён по определению: иначе экран показал бы и
        // закрытые счета всех месяцев сразу.
        if ((unpaidOnly || filters.status === 'unpaid') && !isDebtBearingPlan(p)) return false;
        if (!q) return true;
        const name = (p.studentName || studentById.get(String(p.studentId))?.displayName || '').toLowerCase();
        return name.includes(q) || (p.courseName?.toLowerCase() || '').includes(q);
      })
      .sort((a, b) => {
        const an = a.studentName || studentById.get(String(a.studentId))?.displayName || '';
        const bn = b.studentName || studentById.get(String(b.studentId))?.displayName || '';
        return collator.compare(an, bn) || collator.compare(a.courseName || '', b.courseName || '');
      });
  }, [activePlans, filters.search, filters.status, studentId, studentById, unpaidOnly]);

  useEffect(() => {
    if (!studentId || !onStudentNameResolved) return;
    const name = studentById.get(studentId)?.displayName || plans.find(p => String(p.studentId) === studentId)?.studentName || '';
    if (name) onStudentNameResolved(name);
  }, [studentId, studentById, plans, onStudentNameResolved]);

  /** Долг по тому, что РЕАЛЬНО на экране: подпись для режима «все месяцы». */
  const shownDebt = useMemo(
    () => filtered.reduce((sum, p) => sum + planDebt(p), 0),
    [filtered]
  );

  const { visible: pageRows, total, hasMore, sentinelRef, loadMore } = useLazyList(filtered, {
    // Режим и фильтр «только должники» меняют выборку целиком — без них в ключе
    // досмотренный хвост прежнего среза оставался на экране.
    resetKey: `${filters.search}|${month}|${studentId || ''}|${activeBranchId || ''}|${allMonths ? 'all' : 'm'}|${unpaidOnly ? 'u' : ''}|${filters.status}`,
  });

  const openPay = (plan: PaymentPlan) => { setSelectedPlan(plan); setModal('pay'); };
  const openHistory = (plan: PaymentPlan) => { setSelectedPlan(plan); setModal('history'); };
  const openEditAmount = (plan: PaymentPlan) => { setSelectedPlan(plan); setModal('editAmount'); };

  const runDelete = async (plan: PaymentPlan, force: boolean) => {
    setDeleting(true);
    try {
      await apiDeletePaymentPlan(plan.id, force || undefined);
      toast.success(t('finances.planDeleted', 'Начисление удалено'));
      setPendingDelete(null);
      setForceDelete(null);
      load();
    } catch (e: any) {
      if (!force && e?.status === 409) {
        const raw = e?.linkedTransactions ?? e?.body?.linkedTransactions;
        setPendingDelete(null);
        setForceDelete({ plan, linked: typeof raw === 'number' ? raw : null });
      } else {
        toast.error(e?.message || t('finances.deleteFailed', 'Не удалось удалить'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const rowMenu = (p: PaymentPlan): RowMenuItem[] => [
    ...(isWrittenOffPlan(p) ? [] : [{ label: t('finances.editAmount', 'Изменить сумму'), icon: Pencil, onSelect: () => openEditAmount(p) }]),
    { label: t('finances.paymentHistory', 'История оплат'), icon: History, onSelect: () => openHistory(p) },
    { label: t('finances.deleteCharge', 'Удалить начисление'), icon: Trash2, danger: true, separated: true, onSelect: () => setPendingDelete(p) },
  ];

  // Статус строки живёт в PROGRESS_META (прогресс оплаты) + отдельная метка
  // «срок прошёл» по isPlanOverdue. Единой плашки «Просрочено» больше нет.

  return (
    <div className="space-y-4">
      {/* Переключатель месяца + «Начислить» */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 w-fit">
          <button onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label={t('finances.prevMonth', 'Предыдущий месяц')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-sm font-bold text-slate-900 dark:text-white min-w-[130px] text-center capitalize">{monthLabel(month)}</span>
          <button onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label={t('finances.nextMonth', 'Следующий месяц')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* В режиме «все неоплаченные» месяц не выбран, и начислять не за что —
            кнопка была бы обещанием действия без адресата. */}
        <button
          onClick={() => setShowBill(true)}
          disabled={allMonths}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
        >
          <CalendarPlus className="w-4 h-4" />{t('finances.billMonth', 'Начислить за месяц')}
        </button>
      </div>

      {/* Сводка за месяц. Счётчики оплат — операционные, их видит и кассир;
          «Собрано» — сводная сумма, только для роли с `finance_overview`. */}
      <div className={`grid grid-cols-1 gap-3 ${canOverview ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.paidCount', 'Оплатили')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.paid} <span className="text-sm font-normal text-slate-400">{t('finances.outOf', 'из')} {stats.total}</span></p>
          </div>
        </div>
        {canOverview && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-xl"><Wallet className="w-5 h-5 text-sky-600" /></div>
            <div>
              {/* Подпись называет БАЗУ, а не просто «Собрано за месяц».
                  Это сумма paidAmount по НАЧИСЛЕНИЯМ выбранного месяца, а
                  соседняя вкладка «Платежи» суммирует транзакции по ДАТЕ КАССЫ.
                  Числа законно расходятся — аванс за следующий месяц, оплата
                  прошлого счёта, возврат, — но раньше обе подписи выглядели
                  синонимами, и на вопрос «сколько собрали в июле» экран давал
                  два разных ответа без единого пояснения, какой из них нести
                  директору. */}
              <p className="text-xs text-slate-500">
                {t('finances.collectedByCharges', 'Оплачено по начислениям месяца')}
              </p>
              <p className="text-lg font-bold text-emerald-600">{formatMoney(stats.collected)}</p>
              <Link
                to="/finances?tab=payments"
                className="text-[11px] text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
              >
                {t('finances.cashForPeriodLink', 'Что пришло в кассу за период →')}
              </Link>
            </div>
          </div>
        )}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          {/* «Ещё не оплатили» — операционный счётчик «сколько ещё собрать», не тревога:
              1-го числа ВСЕ свежие счета ещё не оплачены, и это норма. Поэтому
              нейтральный янтарный, а не красный. Красный — только реальная просрочка. */}
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl"><Clock className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.unpaidCount', 'Ещё не оплатили')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.unpaid}</p>
            {/* Счётчик, который ведёт к списку: раньше он называл число и не
                давал способа увидеть, кто за ним стоит. */}
            {onUnpaidOnlyChange && !unpaidOnly && stats.unpaid > 0 && (
              <button
                type="button"
                onClick={() => onUnpaidOnlyChange(true)}
                className="text-[11px] text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:underline"
              >
                {t('finances.showAllUnpaidShort', 'Показать всех должников →')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Поиск + режим «все неоплаченные» */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('finances.searchStudent', 'Поиск по студенту или курсу...')}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
        {/* Единственный способ ответить на «кто должен»: долг копится по разным
            месяцам, и месячный срез на этот вопрос не отвечает в принципе. */}
        {onUnpaidOnlyChange && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600 dark:text-slate-300 shrink-0">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={e => onUnpaidOnlyChange(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            {t('finances.showAllUnpaid', 'Все неоплаченные, за любой месяц')}
          </label>
        )}
      </div>

      {allMonths && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          {unpaidOnly
            ? t('finances.allUnpaidHint', 'Показаны все счета с непогашенным остатком за любые месяцы. Выбор месяца и начисление в этом режиме не действуют.')
            : t('finances.allMonthsHint', 'Показаны счета за все месяцы, включая оплаченные. Плитки выше считают только выбранный месяц.')}
          {' '}
          <span className="font-semibold">
            {t('finances.shownRowsDebt', 'На экране: {{n}} счетов, долг {{sum}}', {
              n: filtered.length,
              sum: formatMoney(shownDebt),
            })}
          </span>
        </div>
      )}

      {/* Таблица */}
      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-medium underline shrink-0">{t('finances.retry', 'Повторить')}</button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MinusCircle}
          // В режиме «все месяцы» текст про начисление за месяц — ложь: месяц не
          // выбран, а кнопка, на которую он ссылается, отключена. Пустой экран
          // здесь значит «долгов нет» либо «счетов у этого студента нет».
          title={
            filters.search
              ? t('finances.nothingFound', 'Ничего не найдено')
              : unpaidOnly
                ? t('finances.noUnpaidAtAll', 'Непогашенных счетов нет')
                : allMonths
                  ? t('finances.noChargesAtAll', 'Счетов нет')
                  : t('finances.noChargesMonth', 'За этот месяц ещё не начисляли')
          }
          description={
            filters.search
              ? t('finances.tryOtherSearch', 'Попробуйте изменить поиск')
              : allMonths
                ? t('finances.noChargesAtAllHint', 'По выбранному срезу счетов не нашлось.')
                : t('finances.noChargesHint', 'Нажмите «Начислить за месяц», чтобы выставить оплату студентам.')
          }
        />
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colStudent', 'Студент')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colGroup', 'Группа')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colForMonth', 'За месяц')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.colActions', 'Действия')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pageRows.map(p => {
                    const student = studentById.get(String(p.studentId));
                    // Студента может не быть в ростере по двум разным причинам —
                    // удалён из системы ИЛИ приписан к другому филиалу (ростер
                    // тоже филиальный). Различить их на клиенте нечем, поэтому
                    // подпись нейтральная: «вне текущего среза». Имя почти всегда
                    // берётся из денормализованного p.studentName и до неё не
                    // доходит.
                    const name = p.studentName || student?.displayName || t('finances.studentOutOfScope', 'Студент вне текущего среза');
                    const pk = planProgressKey(p);
                    const meta = PROGRESS_META[pk];
                    const owes = isDebtBearingPlan(p);
                    const writtenOff = isWrittenOffPlan(p);
                    // Просрочка — отдельная ось (метка «срок прошёл»), не подмена статуса.
                    const overdue = !writtenOff && isPlanOverdue(p);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${writtenOff ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {student ? (
                            <Link to={`/students/${p.studentId}`} className="font-medium text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors">{name}</Link>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-white">{name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{p.courseName || p.courseId || '—'}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.cls}`}>
                            <meta.Icon className="w-3.5 h-3.5" />
                            {t(meta.key, meta.fallback)}
                            {pk === 'partial' && (
                              <span className="font-bold">· {formatMoney(p.paidAmount)} {t('finances.outOf', 'из')} {formatMoney(p.totalAmount)}</span>
                            )}
                            {pk === 'pending' && owes && (
                              <span className="font-bold">· {formatMoney(planDebt(p))}</span>
                            )}
                          </span>
                          {/* Срок оплаты неоплаченного счёта: нейтрально «до 10.08», не тревожно.
                              Раньше любой неоплаченный (в т.ч. ещё не подошедший по сроку) горел
                              красным «Не оплачено» — и оплата 28-го выглядела долгом уже 1-го.
                              Теперь до срока это спокойное «Ожидает · до <дата>». */}
                          {owes && p.deadline && (
                            <span className={`ml-2 text-[11px] align-middle ${overdue ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                              {t('finances.until', 'до')} {formatDayKey(p.deadline)}
                            </span>
                          )}
                          {/* «Срок прошёл» — отдельная красная метка, только когда срок реально прошёл. */}
                          {overdue && (
                            <span
                              title={t('finances.overdueTagHint', 'Снимется, когда оплатят полностью или продлят срок.')}
                              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 align-middle"
                            >
                              <AlertCircle className="w-3 h-3" /> {t('finances.overdueTag', 'срок прошёл')}
                            </span>
                          )}
                          {/* Скидка от цены курса — не долг. Показываем рядом со статусом. */}
                          {!writtenOff && planDiscount(p) > 0 && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium align-middle"
                              title={`${t('finances.coursePrice', 'Цена курса')} ${formatMoney(p.listAmount || 0)}`}
                            >
                              <Tag className="w-3 h-3" /> {t('finances.discount', 'Скидка')} {formatMoney(planDiscount(p))}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {owes && !writtenOff && (
                              <button
                                onClick={() => openPay(p)}
                                className="text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors text-xs"
                              >
                                {t('finances.acceptPayment', 'Принять оплату')}
                              </button>
                            )}
                            <RowMenu items={rowMenu(p)} label={t('finances.colActions', 'Действия')} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <LazyListFooter visibleCount={pageRows.length} total={total} hasMore={hasMore} sentinelRef={sentinelRef} onLoadMore={loadMore} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        busy={deleting}
        title={t('finances.deleteCharge', 'Удалить начисление')}
        message={t('finances.deleteChargeConfirm', 'Начисление для {{name}} будет удалено без возможности восстановления.', { name: pendingDelete?.studentName || '' })}
        confirmLabel={t('finances.delete', 'Удалить')}
        onConfirm={() => pendingDelete && runDelete(pendingDelete, false)}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(forceDelete)}
        danger
        busy={deleting}
        title={t('finances.deletePlanForceTitle', 'К начислению привязаны оплаты')}
        message={
          forceDelete?.linked != null
            ? t('finances.deletePlanForceCount', 'К этому начислению привязано операций: {{n}}. Они останутся в кассе, но перестанут быть связаны с ним. Удалить всё равно?', { n: forceDelete.linked })
            : t('finances.deletePlanForce', 'К этому начислению привязаны оплаты. Они останутся в кассе, но перестанут быть связаны с ним. Удалить всё равно?')
        }
        confirmLabel={t('finances.deleteAnyway', 'Всё равно удалить')}
        onConfirm={() => forceDelete && runDelete(forceDelete.plan, true)}
        onClose={() => setForceDelete(null)}
      />

      {modal === 'pay' && selectedPlan && (
        <AcceptPaymentModal plans={[selectedPlan]} onClose={() => setModal('none')} onSuccess={load} />
      )}

      {modal === 'editAmount' && selectedPlan && (
        <EditPlanAmountModal
          plan={selectedPlan}
          onClose={() => setModal('none')}
          onSuccess={() => { setModal('none'); load(); }}
        />
      )}

      {modal === 'history' && selectedPlan && (
        <PaymentHistoryModal
          plan={selectedPlan}
          studentName={selectedPlan.studentName || selectedPlan.studentId}
          canRefund
          onRefunded={load}
          onClose={() => setModal('none')}
        />
      )}

      {showBill && (
        <BillMonthModal
          period={month}
          periodLabel={monthLabel(month)}
          candidates={candidates}
          onClose={() => setShowBill(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
};

export default MonthTab;
