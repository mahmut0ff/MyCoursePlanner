import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  History,
  MinusCircle,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiDeletePaymentPlan, apiGetPaymentPlans, orgGetStudents } from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { formatMoney } from '../../../lib/money';
import { buildCsv, downloadCsv, formatCsvDate } from '../../../lib/csv';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import RowMenu from '../../../components/ui/RowMenu';
import type { RowMenuItem } from '../../../components/ui/RowMenu';
import AcceptPaymentModal from '../../../components/finance/AcceptPaymentModal';
import CreatePaymentPlanModal from '../../../components/finance/CreatePaymentPlanModal';
import PaymentHistoryModal from '../../../components/finance/PaymentHistoryModal';
import type { DebtsFilters } from '../FinancesPage';

interface Props {
  filters: DebtsFilters;
  onFiltersChange: (next: DebtsFilters) => void;
}

type PlanStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';

interface PaymentPlan {
  id: string;
  studentId: string;
  studentName?: string;
  courseId?: string;
  courseName?: string;
  totalAmount: number;
  paidAmount: number;
  status: PlanStatus;
  /** Настоящий срок оплаты. `nextDueDate` мёртв — не читаем его. */
  deadline?: string;
  createdAt?: string;
}

type ModalType = 'none' | 'pay' | 'create' | 'history';

const PAGE_SIZE = 50;

// Один коллатор на модуль: прежняя вкладка звала localeCompare на каждое
// сравнение, то есть строила новый Intl.Collator тысячи раз за сортировку.
const collator = new Intl.Collator('ru');

const STATUS_STYLES: Record<PlanStatus, { fallback: string; key: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  paid: { key: 'finances.statusPaid', fallback: 'Оплачено', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  overdue: { key: 'finances.statusOverdue', fallback: 'Просрочено', bg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', icon: AlertCircle },
  partial: { key: 'finances.statusPartial', fallback: 'Частично', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  pending: { key: 'finances.statusPending', fallback: 'Ожидает', bg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', icon: Clock },
  // Отменённый счёт — списание. Раньше он падал в `|| statusConfig.pending` и
  // директор видел «Ожидает» на том, чего с человека уже никто не ждёт.
  cancelled: { key: 'finances.statusCancelled', fallback: 'Отменён', bg: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500', icon: Ban },
};

const isExpelled = (s: any) => (s?.status || 'active') === 'expelled';
const studentKey = (s: any) => String(s.uid || s.id);
const debtOf = (p: PaymentPlan) => Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0));
/** Отменённый счёт не долг: ни в сумму, ни в просрочку он не входит. */
const isWrittenOff = (p: PaymentPlan) => p.status === 'cancelled';

// Имя строки-счёта: снимок имени в самом счёте → актуальное имя из ростера →
// нейтральная подпись. Голый studentId (20-значный Firestore-id) как имя не
// показываем: у легаси-счёта удалённого студента это выглядело мусором.
// Один резолвер на строку и на поиск — иначе искать пришлось бы по одному
// значению, а видеть другое.
const resolvePlanName = (p: PaymentPlan, student: any, placeholder: string): string =>
  p.studentName || student?.displayName || placeholder;

// Бэкенд иногда отдаёт по нескольку member-документов на одного студента —
// сворачиваем к одному uid, предпочитая активную запись отчисленной.
const dedupeStudents = (list: any[]): any[] => {
  const byId = new Map<string, any>();
  for (const s of list) {
    const id = studentKey(s);
    const existing = byId.get(id);
    if (!existing || (isExpelled(existing) && !isExpelled(s))) byId.set(id, s);
  }
  return [...byId.values()];
};

// Единый список: строки-счета + строки-студентов, которым не выставили ничего.
type Row =
  | { kind: 'plan'; plan: PaymentPlan; student?: any }
  | { kind: 'student'; student: any };

const StudentCell: React.FC<{ name: string; email?: string; avatarUrl?: string }> = ({ name, email, avatarUrl }) => (
  <div className="flex items-center gap-3">
    {avatarUrl ? (
      <img src={avatarUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
    ) : (
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[11px] text-white font-bold shrink-0">
        {name?.[0]?.toUpperCase() || '?'}
      </div>
    )}
    <div>
      <p className="font-medium text-slate-900 dark:text-white leading-tight">{name}</p>
      {email && <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{email}</p>}
    </div>
  </div>
);

/**
 * «Долги» — кто сколько должен прямо сейчас. Периода у вкладки нет намеренно:
 * долг это состояние, а не окно во времени; вопрос «сколько нам должны за
 * март» задаётся на вкладке «Платежи».
 */
const DebtsTab: React.FC<Props> = ({ filters, onFiltersChange }) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();

  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState<ModalType>('none');
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  // Кому выставляем счёт — саму форму держит CreatePaymentPlanModal.
  const [createFor, setCreateFor] = useState({ studentId: '', studentName: '' });

  // Удаление в два шага: обычное подтверждение, а если сервер ответил 409 —
  // второе, уже с числом привязанных операций.
  const [pendingDelete, setPendingDelete] = useState<PaymentPlan | null>(null);
  const [forceDelete, setForceDelete] = useState<{ plan: PaymentPlan; linked: number | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    // Ошибку гасим на входе: иначе она висит на экране и после удачной перезагрузки.
    setError('');
    Promise.all([apiGetPaymentPlans(), orgGetStudents()])
      .then(([planData, studentData]: [any, any]) => {
        setPlans(Array.isArray(planData) ? planData : []);
        setAllStudents(dedupeStudents(Array.isArray(studentData) ? studentData : []));
      })
      .catch((e: any) => {
        // Раньше список студентов грузился с `.catch(() => {})`: при отказе
        // строки «без счёта» просто исчезали, и это выглядело как «все оплатили».
        setError(e?.message || t('finances.loadFailed', 'Не удалось загрузить данные'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
    // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  }, [load, activeBranchId]);

  // Смена филиала меняет весь набор строк — оставаться на 7-й странице бессмысленно.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const onChangeRef = useRef(onFiltersChange);
  onChangeRef.current = onFiltersChange;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (filtersRef.current.page !== 1) onChangeRef.current({ ...filtersRef.current, page: 1 });
  }, [activeBranchId]);

  // Подпись для счёта, чей студент выпал из ростера и у которого нет снимка имени.
  const namePlaceholder = t('finances.studentRemoved', 'Студент удалён');

  const setSearch = (search: string) => onFiltersChange({ ...filters, search, page: 1 });
  const setStatus = (status: string) => onFiltersChange({ ...filters, status, page: 1 });
  const setPage = (page: number) => onFiltersChange({ ...filters, page });

  // ── Производные данные. Всё под useMemo: раньше карта студентов, фильтрация
  // и сортировка всего массива пересчитывались на каждое нажатие клавиши.
  const studentById = useMemo(
    () => new Map(allStudents.map(s => [studentKey(s), s])),
    [allStudents]
  );

  const activeStudents = useMemo(() => allStudents.filter(s => !isExpelled(s)), [allStudents]);

  // Счета отчисленных не показываем и не считаем в статистике.
  const visiblePlans = useMemo(
    () => plans.filter(p => !isExpelled(studentById.get(String(p.studentId)))),
    [plans, studentById]
  );

  const unbilledStudents = useMemo(() => {
    // Считаем выставленным любой счёт, включая отменённый: иначе студент попал
    // бы в список дважды — строкой отменённого счёта и строкой «без счёта».
    const billed = new Set(plans.map(p => String(p.studentId)));
    return activeStudents.filter(s => !billed.has(studentKey(s)));
  }, [plans, activeStudents]);

  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [
      ...visiblePlans.map(p => ({ kind: 'plan' as const, plan: p, student: studentById.get(String(p.studentId)) })),
      ...unbilledStudents.map(s => ({ kind: 'student' as const, student: s })),
    ];
    const nameOf = (r: Row) =>
      r.kind === 'plan' ? (r.plan.studentName || r.student?.displayName || r.plan.studentId) : (r.student.displayName || '');
    rows.sort((a, b) =>
      collator.compare(nameOf(a), nameOf(b)) ||
      (a.kind === 'plan' && b.kind === 'plan' ? collator.compare(a.plan.courseName || '', b.plan.courseName || '') : 0)
    );
    return rows;
  }, [visiblePlans, unbilledStudents, studentById]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const status = filters.status;
    return allRows.filter(r => {
      if (r.kind === 'plan') {
        const p = r.plan;
        // Ищем по тому же имени, что рисует строка: у легаси-счёта без studentName
        // это displayName из ростера, и без него счёт нельзя было найти по имени,
        // которое директор видит в таблице. Плейсхолдер здесь пустой — искать по
        // «Студент удалён» смысла нет.
        const name = resolvePlanName(p, r.student, '');
        const match = !q ||
          name.toLowerCase().includes(q) ||
          (p.courseName?.toLowerCase() || '').includes(q) ||
          (r.student?.email?.toLowerCase() || '').includes(q);
        return match && (!status || p.status === status);
      }
      const s = r.student;
      const match = !q ||
        (s.displayName?.toLowerCase() || '').includes(q) ||
        (s.email?.toLowerCase() || '').includes(q);
      return match && (!status || status === 'no_plan');
    });
  }, [allRows, filters.search, filters.status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, filters.page), totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const stats = useMemo(() => ({
    totalDebt: visiblePlans.reduce((sum, p) => sum + (isWrittenOff(p) ? 0 : debtOf(p)), 0),
    overdueCount: visiblePlans.filter(p => p.status === 'overdue' && !isWrittenOff(p)).length,
    paidCount: visiblePlans.filter(p => p.status === 'paid').length,
    unbilledCount: unbilledStudents.length,
  }), [visiblePlans, unbilledStudents]);

  // ── Действия
  const openPay = (plan: PaymentPlan) => { setSelectedPlan(plan); setModal('pay'); };
  const openHistory = (plan: PaymentPlan) => { setSelectedPlan(plan); setModal('history'); };
  const openCreateFor = (studentId: string, studentName: string) => {
    setCreateFor({ studentId, studentName });
    setModal('create');
  };

  const runDelete = async (plan: PaymentPlan, force: boolean) => {
    setDeleting(true);
    try {
      await apiDeletePaymentPlan(plan.id, force || undefined);
      toast.success(t('finances.planDeleted', 'Счёт удалён'));
      setPendingDelete(null);
      setForceDelete(null);
      load();
    } catch (e: any) {
      // apiRequest кладёт HTTP-код в `status` — ветвимся по нему, а не по тексту
      // сообщения: текст локализуется и меняется, код нет.
      if (!force && e?.status === 409) {
        // Тело 409-го ответа несёт `linkedTransactions`. apiRequest выносит его
        // на саму ошибку (как status/code); на случай, если поле окажется под
        // `body`, читаем и оттуда. Нет числа — пусть форма покажет общий текст,
        // но не «undefined».
        const raw = e?.linkedTransactions ?? e?.body?.linkedTransactions;
        const linked = typeof raw === 'number' ? raw : null;
        setPendingDelete(null);
        setForceDelete({ plan, linked });
      } else {
        toast.error(e?.message || t('finances.deleteFailed', 'Не удалось удалить счёт'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const csv = buildCsv(
      [
        t('finances.colStudent', 'Студент'),
        t('finances.colCourse', 'Курс'),
        t('finances.colTotal', 'Сумма'),
        t('finances.colPaid', 'Оплачено'),
        t('finances.colDebt', 'Долг'),
        t('finances.colStatus', 'Статус'),
        t('finances.colDeadline', 'Срок'),
      ],
      filtered.map(r => {
        if (r.kind === 'student') {
          return [r.student.displayName || '', '', '', '', '', t('finances.statusNoPlan', 'Без счёта'), ''];
        }
        const p = r.plan;
        const cfg = STATUS_STYLES[p.status];
        return [
          p.studentName || r.student?.displayName || p.studentId,
          p.courseName || p.courseId || '',
          // Числа выгружаем сырыми: formatMoney добавил бы пробелы-разделители и
          // «с.», и таблица перестала бы считать колонку числовой.
          p.totalAmount ?? 0,
          p.paidAmount ?? 0,
          debtOf(p),
          cfg ? t(cfg.key, cfg.fallback) : p.status,
          formatCsvDate(p.deadline),
        ];
      })
    );
    downloadCsv('debts.csv', csv);
  };

  const buildPlanMenu = (p: PaymentPlan, displayName: string): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    if (p.status !== 'paid' && p.status !== 'cancelled') {
      items.push({ label: t('finances.acceptPayment', 'Принять оплату'), icon: CreditCard, onSelect: () => openPay(p) });
    }
    items.push({ label: t('finances.paymentHistory', 'История оплат'), icon: History, onSelect: () => openHistory(p) });
    items.push({
      label: t('finances.billAgain', 'Выставить ещё один счёт'),
      icon: Plus,
      onSelect: () => openCreateFor(String(p.studentId), displayName),
    });
    items.push({
      label: t('finances.deletePlan', 'Удалить счёт'),
      icon: Trash2,
      danger: true,
      separated: true,
      onSelect: () => setPendingDelete(p),
    });
    return items;
  };

  const hasFilters = Boolean(filters.search || filters.status);

  return (
    <div className="space-y-4">
      {/* Карточки статистики */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl"><CreditCard className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.totalDebt', 'Общий долг')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(stats.totalDebt)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-rose-100 dark:bg-rose-900/30 rounded-xl"><AlertCircle className="w-5 h-5 text-rose-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.overdue', 'Просрочено')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.overdueCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.fullyPaid', 'Полностью оплачено')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.paidCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-xl"><Users className="w-5 h-5 text-sky-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.unbilled', 'Без счёта')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.unbilledCount}</p>
          </div>
        </div>
      </div>

      {/* Панель фильтров */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('finances.searchDebts', 'Поиск по студенту или курсу...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <select
            value={filters.status}
            onChange={e => setStatus(e.target.value)}
            aria-label={t('finances.allStatuses', 'Все статусы')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">{t('finances.allStatuses', 'Все статусы')}</option>
            <option value="pending">{t('finances.statusPending', 'Ожидает')}</option>
            <option value="partial">{t('finances.statusPartial', 'Частично')}</option>
            <option value="overdue">{t('finances.statusOverdue', 'Просрочено')}</option>
            <option value="paid">{t('finances.statusPaid', 'Оплачено')}</option>
            <option value="cancelled">{t('finances.statusCancelled', 'Отменён')}</option>
            <option value="no_plan">{t('finances.statusNoPlan', 'Без счёта')}</option>
          </select>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        )}
      </div>

      {/* Таблица */}
      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-medium underline shrink-0">
            {t('finances.retry', 'Повторить')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? t('finances.nothingFound', 'Ничего не найдено') : t('finances.noStudents', 'Нет студентов')}
          description={
            hasFilters
              ? t('finances.tryOtherFilters', 'Попробуйте изменить поиск или статус')
              : t('finances.noStudentsHint', 'Счета появятся здесь, как только в организации будут студенты')
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
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colCourse', 'Курс')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colTotal', 'Сумма')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colPaid', 'Оплачено')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colDebt', 'Долг')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colStatus', 'Статус')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.colActions', 'Действия')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pageRows.map(row => {
                    if (row.kind === 'student') {
                      const s = row.student;
                      return (
                        <tr key={`student-${studentKey(s)}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <StudentCell name={s.displayName || '—'} email={s.email} avatarUrl={s.avatarUrl} />
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                          <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                          <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                          <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                              <MinusCircle className="w-3.5 h-3.5" />{t('finances.statusNoPlan', 'Без счёта')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => openCreateFor(studentKey(s), s.displayName || '')}
                              className="text-sky-600 hover:text-sky-700 font-medium bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 px-2.5 py-1.5 rounded-lg transition-colors text-xs inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />{t('finances.createPlan', 'Выставить счёт')}
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const p = row.plan;
                    const debt = debtOf(p);
                    const cfg = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
                    const Icon = cfg.icon;
                    const displayName = resolvePlanName(p, row.student, namePlaceholder);
                    const writtenOff = isWrittenOff(p);
                    return (
                      <tr key={`plan-${p.id}`} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${writtenOff ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <StudentCell name={displayName} email={row.student?.email} avatarUrl={row.student?.avatarUrl} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{p.courseName || p.courseId || '—'}</td>
                        <td className={`px-5 py-3.5 font-medium whitespace-nowrap ${writtenOff ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                          {formatMoney(p.totalAmount)}
                        </td>
                        <td className="px-5 py-3.5 text-emerald-600 font-medium whitespace-nowrap">{formatMoney(p.paidAmount)}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {/* Отменённый счёт списан — показывать по нему долг было бы враньём. */}
                          <span className={`font-bold ${writtenOff ? 'text-slate-400' : debt > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {writtenOff || debt === 0 ? '—' : formatMoney(debt)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg}`}>
                            <Icon className="w-3.5 h-3.5" />{t(cfg.key, cfg.fallback)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* «Принять» остаётся отдельной кнопкой: это самое частое
                                действие на этой вкладке, прятать его в меню нельзя. */}
                            {p.status !== 'paid' && !writtenOff && (
                              <button
                                onClick={() => openPay(p)}
                                className="text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors text-xs"
                              >
                                {t('finances.accept', 'Принять')}
                              </button>
                            )}
                            <RowMenu items={buildPlanMenu(p, displayName)} label={t('finances.colActions', 'Действия')} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-slate-500">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} из {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">←</button>
                <span className="text-sm font-medium text-slate-500 px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        busy={deleting}
        title={t('finances.deletePlan', 'Удалить счёт')}
        message={t(
          'finances.deletePlanConfirm',
          'Счёт для {{name}} будет удалён без возможности восстановления.',
          { name: pendingDelete?.studentName || pendingDelete?.studentId || '' }
        )}
        confirmLabel={t('finances.delete', 'Удалить')}
        onConfirm={() => pendingDelete && runDelete(pendingDelete, false)}
        onClose={() => setPendingDelete(null)}
      />

      {/* Второе подтверждение — ответ на 409. Сервер отказался удалять счёт,
          к которому привязаны оплаты: они не исчезнут, но останутся без счёта. */}
      <ConfirmDialog
        open={Boolean(forceDelete)}
        danger
        busy={deleting}
        title={t('finances.deletePlanForceTitle', 'К счёту привязаны оплаты')}
        message={
          forceDelete?.linked != null
            ? t(
                // Не `count`: это служебное имя i18next, оно включает плюрализацию
                // и подменяет ключ на `_one`/`_few`, которых у нас нет.
                'finances.deletePlanForceCount',
                'К этому счёту привязано операций: {{n}}. Они останутся в кассе, но перестанут быть связаны со счётом, и долг по ним больше не пересчитается. Удалить всё равно?',
                { n: forceDelete.linked }
              )
            : t(
                'finances.deletePlanForce',
                'К этому счёту привязаны оплаты. Они останутся в кассе, но перестанут быть связаны со счётом, и долг по ним больше не пересчитается. Удалить всё равно?'
              )
        }
        confirmLabel={t('finances.deleteAnyway', 'Всё равно удалить')}
        onConfirm={() => forceDelete && runDelete(forceDelete.plan, true)}
        onClose={() => setForceDelete(null)}
      />

      {modal === 'pay' && selectedPlan && (
        <AcceptPaymentModal
          plans={[selectedPlan]}
          onClose={() => setModal('none')}
          onSuccess={load}
        />
      )}

      {modal === 'create' && (
        <CreatePaymentPlanModal
          studentId={createFor.studentId}
          studentName={createFor.studentName}
          students={activeStudents}
          onClose={() => setModal('none')}
          onSuccess={load}
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
    </div>
  );
};

export default DebtsTab;
