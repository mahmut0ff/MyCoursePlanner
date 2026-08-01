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
import { formatMoney } from '../../../lib/money';
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

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

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
const MonthTab: React.FC<Props> = ({ filters, onFiltersChange, month, onMonthChange, studentId = '', onStudentNameResolved }) => {
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

  // Начисления выбранного месяца, без отчисленных студентов.
  const monthPlans = useMemo(
    () => plans.filter(p => planPeriodKey(p) === month && !isExpelled(studentById.get(String(p.studentId)))),
    [plans, month, studentById]
  );

  // Что реально показываем и считаем на «кто оплатил за месяц»: только живые,
  // ещё числящиеся студенты. Убираем ДВА вида шума, которые ни оплатить, ни
  // взыскать нельзя, а в счётчиках они раздували «ещё не оплатили»:
  //  • списанный счёт (status: 'cancelled') — денег по нему академия не ждёт;
  //  • удалённого из системы студента — его нет в ростере (orgGetStudents
  //    отдаёт ПОЛНЫЙ список active+expelled без лимита), значит студентов с
  //    неразрешимым studentId не существует, а не «не долистали».
  // monthPlans при этом трогать нельзя: дедуп «Начислить» (candidates) обязан
  // видеть ВСЕ счёта месяца, иначе выставит повторно.
  const activePlans = useMemo(
    () => monthPlans.filter(p => studentById.has(String(p.studentId)) && !isWrittenOffPlan(p)),
    [monthPlans, studentById]
  );

  // Перенос суммы: самое свежее по месяцу начисление на (студент, курс).
  const lastAmountByKey = useMemo(() => {
    const best = new Map<string, { period: string; amount: number }>();
    for (const p of plans) {
      const amt = Number(p.totalAmount);
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
  }, [groups, studentById, monthPlans, lastAmountByKey, coursePriceById]);

  const stats = useMemo(() => ({
    total: activePlans.length,
    // По тому же предикату, что и бейджи строк (planProgressKey), а не по сырому
    // p.status: легаси-план без суммы со status:'paid' иначе считался бы «оплачен»
    // в тайле, но рисовался «Частично» в строке — тайл и строки противоречили бы.
    paid: activePlans.filter(p => planProgressKey(p) === 'paid').length,
    collected: activePlans.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0),
    unpaid: activePlans.filter(p => isDebtBearingPlan(p)).length,
  }), [activePlans]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return activePlans
      .filter(p => {
        if (studentId && String(p.studentId) !== studentId) return false;
        if (!q) return true;
        const name = (p.studentName || studentById.get(String(p.studentId))?.displayName || '').toLowerCase();
        return name.includes(q) || (p.courseName?.toLowerCase() || '').includes(q);
      })
      .sort((a, b) => {
        const an = a.studentName || studentById.get(String(a.studentId))?.displayName || '';
        const bn = b.studentName || studentById.get(String(b.studentId))?.displayName || '';
        return collator.compare(an, bn) || collator.compare(a.courseName || '', b.courseName || '');
      });
  }, [activePlans, filters.search, studentId, studentById]);

  useEffect(() => {
    if (!studentId || !onStudentNameResolved) return;
    const name = studentById.get(studentId)?.displayName || plans.find(p => String(p.studentId) === studentId)?.studentName || '';
    if (name) onStudentNameResolved(name);
  }, [studentId, studentById, plans, onStudentNameResolved]);

  const { visible: pageRows, total, hasMore, sentinelRef, loadMore } = useLazyList(filtered, {
    resetKey: `${filters.search}|${month}|${studentId || ''}|${activeBranchId || ''}`,
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
        <button
          onClick={() => setShowBill(true)}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
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
              <p className="text-xs text-slate-500">{t('finances.collectedMonth', 'Собрано за месяц')}</p>
              <p className="text-lg font-bold text-emerald-600">{formatMoney(stats.collected)}</p>
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
          </div>
        </div>
      </div>

      {/* Поиск */}
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
          title={filters.search ? t('finances.nothingFound', 'Ничего не найдено') : t('finances.noChargesMonth', 'За этот месяц ещё не начисляли')}
          description={
            filters.search
              ? t('finances.tryOtherSearch', 'Попробуйте изменить поиск')
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
                    const name = p.studentName || student?.displayName || t('finances.studentRemoved', 'Студент удалён');
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
                              {t('finances.until', 'до')} {new Date(p.deadline).toLocaleDateString()}
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
