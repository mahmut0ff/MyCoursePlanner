import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  orgGetStudents, orgGetResults, orgGetGroups, orgUpdateGroup, apiRemoveMember,
  apiRestoreStudent, apiGetPaymentPlans, apiGetTransactions,
} from '../../lib/api';
import AcceptPaymentModal, { type PayablePlan } from '../../components/finance/AcceptPaymentModal';
import CreatePaymentPlanModal from '../../components/finance/CreatePaymentPlanModal';
import PaymentHistoryModal from '../../components/finance/PaymentHistoryModal';
import EditPlanAmountModal from '../../components/finance/EditPlanAmountModal';
import EditStudentModal from '../../components/students/EditStudentModal';
import StudentAccessModal from '../../components/students/StudentAccessModal';
import MoveStudentModal from '../../components/roster/MoveStudentModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import RowMenu, { type RowMenuItem } from '../../components/ui/RowMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { usePlanGate } from '../../contexts/PlanContext';
import {
  planDebt, isDebtBearingPlan, isWrittenOffPlan, isPlanOverdue, planDiscount,
  planPeriodKey, planProgressKey, daysUntilDeadline,
} from '../../lib/payment-plans';
import { formatMoney } from '../../lib/money';
import ReportCommentModal from '../../components/ai/ReportCommentModal';
import MemberRolesEditor from '../../components/shared/MemberRolesEditor';
import {
  ArrowLeft, Users, Phone, MessageCircle, BookOpen, Plus, X, AlertTriangle,
  Wallet, Tag, Receipt, History, KeyRound, Pencil, Sparkles, Link2, Copy,
  ExternalLink, UsersRound, Building2, UserMinus, UserCheck, Trash2, Shield,
  ArrowDownRight, ArrowUpRight, RotateCcw,
} from 'lucide-react';
import type { UserProfile, ExamAttempt, Group } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';
import { useStudentRisks } from '../../hooks/useStudentRisks';
import toast from 'react-hot-toast';

/**
 * Карточка студента — одна сводка, а не набор конкурирующих карточек.
 *
 * Порядок секций задан ЧАСТОТОЙ обращения, а не источником данных: сюда приходят
 * из «Оплат за месяц» и «Долгов» с вопросом «сколько должен», поэтому деньги — на
 * первом экране, а онлайн-экзамены (для офлайн-академии это второстепенный модуль)
 * ушли вниз. Раньше вся измерительная часть страницы строилась на examAttempts:
 * шесть плиток и гистограмма занимали полтора экрана нулями.
 *
 * Правила оформления, которые здесь держатся сознательно:
 *  • пол кегля — 14px (text-sm); 12px (text-xs) только для метаданных. Ни одного
 *    text-[10px]: раньше их было 43, включая денежную строку «оплачено X из Y».
 *  • цвет — ТОЛЬКО код состояния (просрочка, долг, риск), никогда не украшение;
 *    локальная kahoot-палитра и 25 инлайновых style={{}} (у них не было dark-пары) убраны.
 *  • ноль вложенных карточек: заголовок секции живёт НАД контейнером.
 */

/** Секции, на которые можно дать ссылку: /students/:uid?section=payments. */
type SectionId = 'payments' | 'progress' | 'access';

/**
 * Подписи статусов счёта — те же ключи и та же палитра, что на вкладке оплат.
 * Карточка студента и финансы обязаны говорить об одном счёте одно и то же:
 * расхождение между ними и породило жалобу про «долг, которого нет».
 */
const PLAN_STATUS: Record<string, { key: string; fallback: string; cls: string }> = {
  paid: { key: 'finances.statusPaid', fallback: 'Оплачено', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  // «Просрочено» больше не бейдж, а отдельная метка «срок прошёл» рядом со статусом
  // (см. ниже): бейдж теперь выражает ТОЛЬКО прогресс оплаты и не затирает «Частично».
  partial: { key: 'finances.statusPartial', fallback: 'Частично', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pending: { key: 'finances.statusPending', fallback: 'Ожидает', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  cancelled: { key: 'finances.statusWrittenOff', fallback: 'Списан', cls: 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400' },
};

/**
 * Возврат — это расход с категорией `refund`. Раньше «История оплат» брала
 * только `type === 'income'`, поэтому студент, которому деньги вернули, до
 * последнего выглядел полностью оплатившим.
 */
const isRefundTx = (tx: any) => tx?.type === 'expense' && tx?.categoryId === 'refund';

/** Сумма счёта известна: у легаси-счетов её может не быть вовсе. */
const hasKnownTotal = (plan: any) => Number.isFinite(Number(plan?.totalAmount));

/** 'YYYY-MM' → «Июль 2026». Пусто, если ключ пуст. Тот же язык, что на «Оплатах за месяц». */
const monthLabel = (key: string | null): string => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Синтетическая почта офлайн-студента — это не адрес, показывать её незачем. */
const isSyntheticEmail = (email?: string) => !email || /@student\.sabakhub\.app$/i.test(email);

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`;
};

/** «12 дней» с правильным окончанием — строка попадает в текст, а не в таблицу. */
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};
const daysWord = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

const StudentDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role, organizationId } = useAuth();
  const { activeBranchId, setActiveBranch, branches } = useBranch();
  const { loaded: permsLoaded, can, canRead, canWrite, canDelete } = usePermissions();
  const { canAccess } = usePlanGate();
  const [searchParams] = useSearchParams();

  const [student, setStudent] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Ошибка никогда не превращается в факт. Раньше `loadFinances` глотал 403
   * пустым `catch {}`, и менеджер без права на финансы читал «Начислений пока
   * нет» — прямую ложь про деньги. Теперь каждая секция сама сообщает о сбое.
   */
  const [failed, setFailed] = useState<{ finance?: boolean; results?: boolean; groups?: boolean }>({});

  // ─── Права ───
  //
  // Сырое `isAdmin = admin|manager|super_admin` убрано: MANAGER_DEFAULT не
  // содержит `finances`, поэтому обычный менеджер видел денежный блок и получал
  // 403; и зеркально — преподаватель с «ведением контингента» не видел ни одного
  // действия, хотя в списке ему всё разрешено.
  const isOrgAdmin = role === 'admin' || role === 'super_admin';
  // Зеркало серверного isRosterManager (utils/auth.ts): роль admin/manager ЛИБО
  // явный модификатор roster_management — и всё это ПОВЕРХ прав на students.
  const isRosterManager = isOrgAdmin || role === 'manager' || can('roster_management', 'write');
  const canEditRoster = permsLoaded && isRosterManager && canWrite('students');
  const canPurgeStudent = permsLoaded && isRosterManager && canDelete('students');
  const canSeeMoney = permsLoaded && canRead('finances') && canAccess('finances');
  const canTakeMoney = permsLoaded && canWrite('finances') && canAccess('finances');

  // Почему студент помечен в списке — тот же серверный расчёт, что и для точки в ростере.
  const { riskByStudent } = useStudentRisks();
  const risk = uid ? riskByStudent[uid] : undefined;

  // ─── Модальные окна и подтверждения ───
  const [payModalPlan, setPayModalPlan] = useState<any | null>(null);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [moveMode, setMoveMode] = useState<'group' | 'branch' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'expel' }
    | { kind: 'unassign'; groupId: string; groupName: string }
    | { kind: 'revokeParent' }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const groups = useMemo(
    () => allGroups.filter(g => g.studentIds?.includes(uid!)),
    [allGroups, uid],
  );

  const loadFinances = useCallback(async () => {
    // studentId уходит на сервер, а не отсекается здесь: GET транзакций обрезан
    // серверным потолком, и в крупной академии старые оплаты просто не попадали
    // в ответ. Клиентский фильтр оставлен вторым рубежом.
    const [plans, txs] = await Promise.all([
      apiGetPaymentPlans({ studentId: uid }),
      apiGetTransactions({ studentId: uid }),
    ]);
    setPaymentPlans((plans || []).filter((p: any) => p.studentId === uid));
    setTransactions((txs || []).filter((t: any) => t.studentId === uid));
  }, [uid]);

  const reloadFinances = useCallback(() => {
    loadFinances()
      .then(() => setFailed(f => ({ ...f, finance: false })))
      .catch(() => setFailed(f => ({ ...f, finance: true })));
  }, [loadFinances]);

  useEffect(() => {
    if (!uid || !permsLoaded) return;
    setLoading(true);
    setFailed({});
    // allSettled, а не all: падение одного источника больше не роняет всю
    // страницу в «Не найдено» и не даёт unhandled rejection.
    Promise.allSettled([
      orgGetStudents().then((all: UserProfile[]) => setStudent(all.find(s => s.uid === uid) || null)),
      orgGetResults({ studentId: uid }).then(setResults),
      orgGetGroups().then(setAllGroups),
      canSeeMoney ? loadFinances() : Promise.resolve(),
    ]).then(([, res, grp, fin]) => {
      setFailed({
        results: res.status === 'rejected',
        groups: grp.status === 'rejected',
        finance: canSeeMoney && fin.status === 'rejected',
      });
      if (res.status === 'rejected') setResults([]);
      if (grp.status === 'rejected') setAllGroups([]);
    }).finally(() => setLoading(false));
    // activeBranchId: api-слой штампует филиал на GET, поэтому переключение — это перезагрузка.
  }, [uid, activeBranchId, permsLoaded, canSeeMoney, loadFinances]);

  /* ─── Ссылка на секцию: /students/:uid?section=payments ─── */
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (loading) return;
    const target = searchParams.get('section');
    if (!target) return;
    const el = sectionRefs.current[target];
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [loading, searchParams]);

  const registerSection = (id: SectionId) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };

  /* ─── Производные значения ─── */
  const stats = useMemo(() => {
    if (results.length === 0) return { avgScore: 0, passRate: 0, best: 0, totalTime: 0, totalCorrect: 0, totalQuestions: 0 };
    const avgScore = Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
    const passRate = Math.round((results.filter(r => r.passed).length / results.length) * 100);
    const best = Math.max(...results.map(r => r.percentage || 0));
    const totalTime = results.reduce((s, r) => s + (r.timeSpentSeconds || 0), 0);
    const totalCorrect = results.reduce((s, r) => s + (r.questionResults?.filter(q => q.isCorrect).length || 0), 0);
    const totalQuestions = results.reduce((s, r) => s + (r.questionResults?.length || 0), 0);
    return { avgScore, passRate, best, totalTime, totalCorrect, totalQuestions };
  }, [results]);

  // Долг считается ТОЛЬКО общими предикатами из lib/payment-plans — четвёртой
  // версии правды о деньгах на этой странице не появится.
  const money = useMemo(() => {
    const debtPlans = paymentPlans.filter(p => isDebtBearingPlan(p));
    const total = debtPlans.reduce((s, p) => s + planDebt(p), 0);
    const overdue = debtPlans.filter(p => isPlanOverdue(p));
    const worstDays = overdue.reduce((worst, p) => {
      const d = daysUntilDeadline(p.deadline);
      return d != null && d < 0 ? Math.max(worst, -d) : worst;
    }, 0);
    return { debtPlans, total, overdue, worstDays };
  }, [paymentPlans]);

  const payablePlans: PayablePlan[] = useMemo(
    () => money.debtPlans.map(p => ({
      id: p.id, studentId: p.studentId, studentName: p.studentName || student?.displayName,
      courseId: p.courseId, courseName: p.courseName,
      totalAmount: Number(p.totalAmount) || 0, paidAmount: Number(p.paidAmount) || 0,
    })),
    [money.debtPlans, student?.displayName],
  );

  const planNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of paymentPlans) if (p?.id) map[String(p.id)] = p.courseName || t('finances.plan', 'Счёт');
    return map;
  }, [paymentPlans, t]);

  // Оплаты и возвраты одной лентой, новыми вперёд.
  const ledger = useMemo(
    () => transactions
      .filter(tx => tx.type === 'income' || isRefundTx(tx))
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()),
    [transactions],
  );

  const sortedResults = useMemo(
    () => [...results].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [results],
  );

  /* ─── Действия ─── */
  const expelled = (student as any)?.status === 'expelled';
  const hasLogin = !!student?.email && (student as any)?.offlineStudent !== true;

  const handleAssignGroup = async () => {
    if (!selectedGroupId || !uid) return;
    const target = allGroups.find(g => g.id === selectedGroupId);
    if (!target) return;
    setAssigning(true);
    try {
      const ids = target.studentIds || [];
      if (!ids.includes(uid)) {
        await orgUpdateGroup({ id: target.id, studentIds: [...ids, uid] });
        setAllGroups(prev => prev.map(g => (g.id === target.id ? { ...g, studentIds: [...ids, uid] } : g)));
        toast.success('Ученик прикреплён к группе');
      }
      setShowAssignModal(false);
      setSelectedGroupId('');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось прикрепить');
    } finally {
      setAssigning(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm || !student) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === 'expel') {
        await apiRemoveMember(student.uid, organizationId!);
        // Остаёмся на карточке: отчисление обратимо, и следующий вопрос почти
        // всегда «а долг?». Раньше страница молча выкидывала в список.
        setStudent({ ...student, status: 'expelled' } as UserProfile);
        toast.success('Студент отчислен');
      } else if (confirm.kind === 'unassign') {
        const target = allGroups.find(g => g.id === confirm.groupId);
        if (target) {
          const ids = (target.studentIds || []).filter(id => id !== uid);
          await orgUpdateGroup({ id: target.id, studentIds: ids });
          setAllGroups(prev => prev.map(g => (g.id === target.id ? { ...g, studentIds: ids } : g)));
          toast.success('Ученик откреплён от группы');
        }
      } else if (confirm.kind === 'revokeParent') {
        await import('../../lib/api').then(m => m.apiRevokeParentKey(student.uid));
        setStudent({ ...student, parentPortalKey: undefined });
        toast.success('Ссылка сброшена');
      }
      setConfirm(null);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось выполнить');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!student || !organizationId) return;
    try {
      await apiRestoreStudent(student.uid, organizationId);
      setStudent({ ...student, status: 'active' } as UserProfile);
      toast.success('Студент восстановлен');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось восстановить');
    }
  };

  /* ─── Состояния до отрисовки ─── */
  if (loading) return <DetailSkeleton />;

  if (!student) {
    // Три разных «нет студента» вместо одного «Не найдено». Самый частый случай —
    // не удалённая запись, а выбранный филиал: переключатель штампует branchId на
    // GET, и студент из соседнего филиала просто не приходит.
    const branchScoped = !!activeBranchId && branches.length > 1;
    return (
      <div className="max-w-2xl mx-auto py-10">
        <EmptyState
          icon={Users}
          title={branchScoped ? 'Студента нет в выбранном филиале' : 'Студент не найден'}
          description={branchScoped
            ? 'Запись может относиться к другому филиалу — покажите все филиалы, чтобы её увидеть.'
            : 'Запись удалена или ссылка устарела.'}
          actionLabel={branchScoped ? 'Показать все филиалы' : 'К списку студентов'}
          {...(branchScoped
            ? { onAction: () => setActiveBranch(null) }
            : { actionLink: '/students' })}
        />
      </div>
    );
  }

  /* ─── Меню редких действий ─── */
  const menuItems: RowMenuItem[] = [];
  if (canTakeMoney && !expelled) {
    menuItems.push({ label: 'Выставить счёт', icon: Receipt, onSelect: () => setShowBillModal(true) });
  }
  if (canSeeMoney && paymentPlans.length > 0) {
    menuItems.push({ label: 'История оплат', icon: History, onSelect: () => setShowHistory(true) });
  }
  // Связаться — самое частое действие сразу после «увидел долг», поэтому без прав:
  // телефон и так напечатан строкой выше.
  const waPhone = (student.phone || '').replace(/\D/g, '');
  if (student.phone) {
    menuItems.push({ label: 'Позвонить', icon: Phone, separated: menuItems.length > 0, onSelect: () => { window.location.href = `tel:${student.phone}`; } });
    // Короткие номера без кода страны wa.me не откроет — не предлагаем.
    if (waPhone.length >= 10) {
      menuItems.push({ label: 'Написать в WhatsApp', icon: MessageCircle, onSelect: () => window.open(`https://wa.me/${waPhone}`, '_blank', 'noopener') });
    }
  }
  if (canEditRoster) {
    menuItems.push({ label: t('common.edit', 'Редактировать'), icon: Pencil, separated: menuItems.length > 0, onSelect: () => setShowEditModal(true) });
    if (!expelled) {
      if (allGroups.length > 0) menuItems.push({ label: 'Перевести в группу', icon: UsersRound, onSelect: () => setMoveMode('group') });
      if (branches.length > 0) menuItems.push({ label: 'Перевести в филиал', icon: Building2, onSelect: () => setMoveMode('branch') });
      menuItems.push({ label: hasLogin ? 'Сменить пароль' : 'Выдать доступ', icon: KeyRound, onSelect: () => setShowAccessModal(true) });
    }
    menuItems.push(
      expelled
        ? { label: 'Восстановить', icon: UserCheck, separated: true, onSelect: handleRestore }
        : { label: 'Отчислить', icon: UserMinus, danger: true, separated: true, onSelect: () => setConfirm({ kind: 'expel' }) },
    );
  }
  if (expelled && canPurgeStudent) {
    menuItems.push({ label: t('common.delete', 'Удалить навсегда'), icon: Trash2, danger: true, onSelect: () => navigate('/students') });
  }

  const showMoneyProblem = canSeeMoney && money.overdue.length > 0;
  const showEngagementProblem = !!risk && risk.riskLevel !== 'low';

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <Link
        to="/students"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
      >
        <ArrowLeft className="w-4 h-4" />{t('nav.students', 'Студенты')}
      </Link>

      {/* ═══ Идентичность ═══ */}
      <header className="flex items-start gap-4 mb-6">
        {student.avatarUrl ? (
          <img src={student.avatarUrl} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-xl font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {student.displayName?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{student.displayName}</h1>
            {expelled && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('common.expelled', 'Отчислен')}
              </span>
            )}
            <PinnedBadgesDisplay badges={student.pinnedBadges} />
          </div>

          {/* Мета одной строкой: телефон — действие, а не подпись. */}
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            {groups.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                {groups.map(g => g.name).join(', ')}
              </span>
            )}
            {(student as any).enrollmentDate && (
              <><Dot />с {new Date((student as any).enrollmentDate).toLocaleDateString('ru-RU')}</>
            )}
            {student.city && <><Dot />{student.city}</>}
            {!isSyntheticEmail(student.email) && <><Dot />{student.email}</>}
            {student.phone && (
              <>
                <Dot />
                <a
                  href={`tel:${student.phone}`}
                  className="font-medium text-slate-700 hover:text-primary-600 dark:text-slate-200 dark:hover:text-primary-400 transition-colors"
                >
                  {student.phone}
                </a>
                {waPhone.length >= 10 && (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Написать ${student.displayName} в WhatsApp`}
                    className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {/* Одно первичное действие: то, ради чего карточку чаще всего открывают. */}
          {canTakeMoney && money.total > 0 && (
            <button
              onClick={() => setPayModalPlan(money.debtPlans[0])}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <Wallet className="w-4 h-4" />
              Принять оплату · <span className="tabular-nums">{formatMoney(money.total)}</span>
            </button>
          )}
          {canAccess('ai') && (
            <button
              onClick={() => setReportOpen(true)}
              title="AI-комментарий в табель"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <Sparkles className="w-4 h-4" /><span className="hidden lg:inline">AI-отзыв</span>
            </button>
          )}
          <RowMenu items={menuItems} />
        </div>
      </header>

      {/* ═══ Что не так — максимум две строки, деньги и вовлечённость раздельно ═══
          Это разные столы: просрочка — вопрос к бухгалтерии, пропуски — к куратору. */}
      {(showMoneyProblem || showEngagementProblem) && (
        <div className="space-y-2 mb-6">
          {showMoneyProblem && (
            <ProblemRow
              tone="rose"
              text={
                <>
                  Долг <span className="tabular-nums font-semibold">{formatMoney(money.total)}</span>
                  {money.worstDays > 0 && <> · срок прошёл {daysWord(money.worstDays)}</>}
                </>
              }
              action={canTakeMoney
                ? { label: 'Принять оплату', onClick: () => setPayModalPlan(money.debtPlans[0]) }
                : { label: 'В финансы', to: `/finances?tab=debts&student=${uid}` }}
            />
          )}
          {showEngagementProblem && (
            <ProblemRow
              tone={risk!.riskLevel === 'high' ? 'rose' : 'amber'}
              text={
                risk!.hasActivity === false
                  ? <>Ещё не начинал(а) заниматься — добавлен(а) {daysWord(risk!.daysSinceEnrolled ?? risk!.daysSinceLastActive)} назад</>
                  : <>{risk!.reasons?.length ? risk!.reasons.join(' · ') : 'Показатели ниже нормы'} · посещаемость <span className="tabular-nums">{risk!.attendanceRate}%</span></>
              }
              action={groups[0] ? { label: 'Открыть группу', to: `/groups/${groups[0].id}` } : undefined}
            />
          )}
        </div>
      )}

      {/* ═══ Полоса показателей — текстом, без плиток и без иконок ═══
          Посещаемость и средний балл приходят в риск-профиле и раньше были видны
          ТОЛЬКО у проблемного студента: у здорового карточка молчала о главном. */}
      <dl className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-x divide-y md:divide-y-0 divide-slate-200 dark:divide-slate-700 overflow-hidden mb-8">
        <Metric
          label="Посещаемость"
          value={risk ? `${risk.attendanceRate}%` : '—'}
          hint={risk?.missedLessons ? `пропущено ${risk.missedLessons}` : undefined}
          alarming={!!risk && risk.attendanceRate < 70}
        />
        <Metric
          label="Средний балл"
          value={risk?.averageScore ? String(risk.averageScore) : '—'}
          hint={risk?.scoreTrend === 'down' ? 'снижается' : risk?.scoreTrend === 'up' ? 'растёт' : undefined}
          trend={risk?.scoreTrend}
        />
        <Metric
          label="Последняя активность"
          value={risk ? (risk.daysSinceLastActive === 0 ? 'сегодня' : daysWord(risk.daysSinceLastActive)) : '—'}
          hint={risk && risk.daysSinceLastActive > 0 ? 'назад' : undefined}
          alarming={!!risk && risk.daysSinceLastActive >= 14}
        />
        {canSeeMoney ? (
          <Metric
            label="Долг"
            value={money.total > 0 ? formatMoney(money.total) : 'нет'}
            hint={money.overdue.length > 0 ? 'срок прошёл' : undefined}
            alarming={money.overdue.length > 0}
          />
        ) : (
          <Metric label="Групп" value={String(groups.length)} />
        )}
      </dl>

      {/* ═══ Группы ═══ */}
      <section className="mb-8">
        <SectionHeading title="Группы" />
        <div className="flex flex-wrap items-center gap-2">
          {failed.groups && <LoadError onRetry={() => window.location.reload()} />}
          {!failed.groups && groups.map(g => (
            <span key={g.id} className="group inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              <Link to={`/groups/${g.id}`} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                {g.name}{g.courseName ? ` · ${g.courseName}` : ''}
              </Link>
              {canEditRoster && (
                <button
                  onClick={() => setConfirm({ kind: 'unassign', groupId: g.id, groupName: g.name })}
                  aria-label={`Открепить от группы ${g.name}`}
                  // Видно всегда, а не по hover: действие, доступное только наведением,
                  // недоступно с клавиатуры и с телефона. slate-500, а не 400:
                  // иконка — графический объект, ему нужен контраст ≥3:1.
                  className="p-0.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
          {!failed.groups && groups.length === 0 && (
            <span className="text-sm text-slate-500 dark:text-slate-400">Не состоит ни в одной группе</span>
          )}
          {canEditRoster && !expelled && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary-600 hover:border-primary-400 dark:hover:text-primary-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />Группа
            </button>
          )}
        </div>
      </section>

      {/* ═══ Оплаты ═══ */}
      {canSeeMoney && (
        <section ref={registerSection('payments')} className="mb-8 scroll-mt-6">
          <SectionHeading
            title="Оплаты"
            action={{ label: 'Открыть в финансах', to: `/finances?tab=debts&student=${uid}` }}
          />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {failed.finance ? (
              <div className="p-4"><LoadError onRetry={reloadFinances} /></div>
            ) : paymentPlans.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                Начислений пока нет
                {canTakeMoney && !expelled && (
                  <> · <button onClick={() => setShowBillModal(true)} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">выставить счёт</button></>
                )}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {[...paymentPlans]
                  .sort((a, b) => (planPeriodKey(b) || '').localeCompare(planPeriodKey(a) || ''))
                  .map(plan => {
                    // Единые предикаты из lib/payment-plans — те же, по которым считают
                    // долг сервер и финансы. Своей арифметики здесь нет.
                    const writtenOff = isWrittenOffPlan(plan);
                    const owes = isDebtBearingPlan(plan);
                    const debt = planDebt(plan);
                    const totalKnown = hasKnownTotal(plan);
                    const overdue = !writtenOff && isPlanOverdue(plan);
                    // Бейдж = ТОЛЬКО прогресс оплаты; просрочка — отдельная метка,
                    // а не подмена статуса, иначе «Частично» затирается.
                    const cfg = PLAN_STATUS[planProgressKey(plan)];
                    return (
                      <li key={plan.id} className={`px-4 py-3.5 ${writtenOff ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {/* Заголовок строки — МЕСЯЦ: карточка про «оплату за месяц»,
                                как и раздел финансов. У легаси-плана без периода — курс. */}
                            <p className={`text-sm font-semibold ${writtenOff ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
                              {monthLabel(planPeriodKey(plan)) || plan.courseName || t('finances.payment', 'Оплата')}
                            </p>
                            {monthLabel(planPeriodKey(plan)) && plan.courseName && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{plan.courseName}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                              {t(cfg.key, cfg.fallback)}
                            </span>
                            {overdue && (
                              <span
                                title={t('finances.overdueTagHint', 'Снимется, когда оплатят полностью или продлят срок.')}
                                className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                              >
                                {t('finances.overdueTag', 'срок прошёл')}
                              </span>
                            )}
                            {canTakeMoney && !writtenOff && (
                              <button
                                onClick={() => setEditPlan(plan)}
                                title={t('finances.editAmount', 'Изменить сумму')}
                                aria-label={t('finances.editAmount', 'Изменить сумму')}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Денежная строка ВСЕГДА показывает прогресс: сколько внесли, из
                            какой суммы и сколько осталось. Раньше при долге печатался
                            только остаток, и внесённый платёж не оставлял следа — отсюда
                            «я же оплатил, почему просрочка?». */}
                        {!writtenOff && (
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {!totalKnown ? (
                              <>
                                {t('finances.colPaid', 'Оплачено')}: <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(plan.paidAmount)}</span>
                                {' · '}<span className="text-rose-600 dark:text-rose-400">{t('finances.amountNotSet', 'сумма не указана')}</span>
                              </>
                            ) : owes ? (
                              <>
                                {t('finances.colPaid', 'Оплачено')}:{' '}
                                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(plan.paidAmount || 0)}</span>
                                {' '}{t('finances.outOf', 'из')} <span className="tabular-nums">{formatMoney(plan.totalAmount)}</span> ·{' '}
                                <span className={`font-semibold tabular-nums ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                  {t('finances.remainingInline', 'осталось')} {formatMoney(debt)}
                                </span>
                                {plan.deadline && (
                                  <span className={overdue ? 'text-rose-600 dark:text-rose-400' : ''}>
                                    {' '}· {t('finances.until', 'до')} {new Date(plan.deadline).toLocaleDateString('ru-RU')}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>{t('finances.colPaid', 'Оплачено')}: <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(plan.paidAmount)}</span></>
                            )}
                          </p>
                        )}

                        {/* Скидка от цены курса — это НЕ долг: «недоплата» относительно
                            прайса объяснена явно, иначе она читается как задолженность. */}
                        {!writtenOff && planDiscount(plan) > 0 && (
                          <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 shrink-0" />
                            {t('finances.discount', 'Скидка')}: <span className="tabular-nums">{formatMoney(planDiscount(plan))}</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              · {t('finances.coursePrice', 'Цена курса')} <span className="tabular-nums">{formatMoney(plan.listAmount || 0)}</span>
                            </span>
                          </p>
                        )}

                        {writtenOff ? (
                          // Списанный счёт не предлагаем принимать: income с allowRevive
                          // воскресил бы списание обратно в долг.
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {t('finances.writtenOffHint', 'Счёт списан — денег по нему академия больше не ждёт.')}
                          </p>
                        ) : owes && canTakeMoney ? (
                          <button
                            onClick={() => setPayModalPlan(plan)}
                            className="mt-2.5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800 dark:hover:bg-emerald-900/40 transition-colors"
                          >
                            {t('finances.acceptPayment', 'Принять оплату')}: <span className="tabular-nums">{formatMoney(debt)}</span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            )}

            {ledger.length > 0 && !failed.finance && (
              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('finances.paymentHistory', 'История оплат')}
                  </h4>
                  <button onClick={() => setShowHistory(true)} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                    Все операции
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {ledger.slice(0, 4).map(tx => {
                    const refund = isRefundTx(tx);
                    // По какому счёту прошли деньги: сумма без счёта не отвечает на «за что».
                    const forPlan = tx.paymentPlanId ? planNameById[tx.paymentPlanId] : undefined;
                    return (
                      <li key={tx.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 text-slate-600 dark:text-slate-300 truncate">
                          {/* Дата операции — когда деньги реально приняли (tx.date);
                              createdAt это лишь момент ввода в систему. */}
                          {new Date(tx.date || tx.createdAt).toLocaleDateString('ru-RU')}
                          {refund && <span className="ml-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{t('finances.refundBadge', 'возврат')}</span>}
                          {forPlan && <span className="ml-1.5 text-slate-400 dark:text-slate-500">· {forPlan}</span>}
                        </span>
                        <span className={`shrink-0 font-semibold tabular-nums ${refund ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {refund ? '−' : '+'}{formatMoney(tx.amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ Экзамены — понижены в приоритете ═══
          Для офлайн-академии это второстепенный модуль: раньше он занимал 2/3
          ширины и полтора экрана, у большинства академий — нулями. */}
      <section ref={registerSection('progress')} className="mb-8 scroll-mt-6">
        <SectionHeading
          title="Онлайн-экзамены"
          meta={results.length > 0 ? `${results.length} ${plural(results.length, 'попытка', 'попытки', 'попыток')} · средний ${stats.avgScore}%` : undefined}
        />
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          {failed.results ? (
            <div className="p-4"><LoadError onRetry={() => window.location.reload()} /></div>
          ) : sortedResults.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              Ученик ещё не проходил онлайн-экзамены
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
              {sortedResults.map(r => {
                const pct = r.percentage || 0;
                return (
                  <li key={r.id}>
                    <Link
                      to={`/results/${r.id}`}
                      className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-700/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.examTitle}</p>
                        <div className="shrink-0 flex items-center gap-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.passed
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}
                          >
                            {r.passed ? t('common.passed', 'Сдан') : t('common.failed', 'Не сдан')}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white w-11 text-right">{pct}%</span>
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                        <span className="tabular-nums">{new Date(r.submittedAt).toLocaleDateString('ru-RU')}</span>
                        {!!r.timeSpentSeconds && <><Dot />{formatTime(r.timeSpentSeconds)}</>}
                        {r.questionResults && (
                          <><Dot /><span className="tabular-nums">{r.questionResults.filter(q => q.isCorrect).length}/{r.questionResults.length}</span> верных</>
                        )}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ═══ Доступ и связи ═══
          Три редких, но родственных вопроса в одном месте: как ученик заходит,
          что видит родитель, какие у него роли. Раньше это были три отдельные
          карточки, конкурировавшие с деньгами за первый экран. */}
      <section ref={registerSection('access')} className="scroll-mt-6">
        <SectionHeading title="Доступ и связи" />
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
          {/* Вход в систему */}
          {canEditRoster && (
            <div className="px-4 py-3.5 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-400" />Вход в систему
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 break-all">
                  {hasLogin
                    ? ((student as any).username || student.email)
                    : 'Ученик без входа — это запись для журнала и оплат.'}
                </p>
              </div>
              {!expelled && (
                <button
                  onClick={() => setShowAccessModal(true)}
                  className="shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                >
                  {hasLogin ? 'Сменить пароль' : 'Выдать доступ'}
                </button>
              )}
            </div>
          )}

          {/* Портал для родителей */}
          <div className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-400" />Портал для родителей
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Ссылка на успеваемость без регистрации.
                </p>
              </div>
              {canEditRoster && !student.parentPortalKey && (
                <button
                  onClick={async () => {
                    try {
                      const res = await import('../../lib/api').then(m => m.apiGenerateParentKey(student.uid));
                      setStudent({ ...student, parentPortalKey: res.parentPortalKey });
                      toast.success('Ссылка создана');
                    } catch { toast.error('Не удалось создать ссылку'); }
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />Создать ссылку
                </button>
              )}
            </div>
            {student.parentPortalKey && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2 min-w-0 flex-1 rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
                  <Link2 className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-300 truncate font-mono">
                    {window.location.origin}/parent/{student.parentPortalKey}
                  </span>
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/parent/${student.parentPortalKey}`);
                    toast.success('Ссылка скопирована');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                >
                  <Copy className="w-4 h-4" />Копировать
                </button>
                {canEditRoster && (
                  <button
                    onClick={() => setConfirm({ kind: 'revokeParent' })}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 dark:text-rose-300 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 transition-colors"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Роли — только настоящие админы и только у тех, кто вообще может войти. */}
          {isOrgAdmin && organizationId && hasLogin && (
            <div className="px-4 py-3.5">
              <MemberRolesEditor uid={student.uid} orgId={organizationId} />
            </div>
          )}
        </div>
      </section>

      {/* Мобильная панель первичного действия: на телефоне кнопка из шапки уезжает. */}
      {canTakeMoney && money.total > 0 && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setPayModalPlan(money.debtPlans[0])}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            <Wallet className="w-4 h-4" />Принять оплату · <span className="tabular-nums">{formatMoney(money.total)}</span>
          </button>
        </div>
      )}

      {/* ═══ Модальные окна ═══ */}
      {payModalPlan && (
        <AcceptPaymentModal
          plans={payablePlans.length > 0 ? payablePlans : [payModalPlan]}
          studentName={student.displayName}
          onClose={() => setPayModalPlan(null)}
          onSuccess={reloadFinances}
        />
      )}

      {editPlan && (
        <EditPlanAmountModal
          plan={{ ...editPlan, studentName: editPlan.studentName || student.displayName }}
          onClose={() => setEditPlan(null)}
          onSuccess={() => { setEditPlan(null); reloadFinances(); }}
        />
      )}

      {showBillModal && (
        <CreatePaymentPlanModal
          studentId={student.uid}
          studentName={student.displayName}
          onClose={() => setShowBillModal(false)}
          onSuccess={() => { setShowBillModal(false); reloadFinances(); }}
        />
      )}

      {showHistory && (
        <PaymentHistoryModal
          studentId={student.uid}
          studentName={student.displayName}
          canRefund={canTakeMoney}
          onRefunded={reloadFinances}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showAccessModal && (
        <StudentAccessModal
          uid={student.uid}
          studentName={student.displayName}
          hasLogin={hasLogin}
          currentLogin={(student as any).username || student.email}
          onClose={() => setShowAccessModal(false)}
          onGranted={login => setStudent({ ...student, email: login.email, username: login.username, offlineStudent: false } as any)}
        />
      )}

      {moveMode && (
        <MoveStudentModal
          uid={student.uid}
          studentName={student.displayName}
          mode={moveMode}
          groups={allGroups}
          branches={branches}
          current={moveMode === 'group' ? groups.map(g => g.id) : ((student as any).branchIds || [])}
          onClose={() => setMoveMode(null)}
          onDone={() => { setMoveMode(null); orgGetGroups().then(setAllGroups).catch(() => {}); }}
        />
      )}

      {showEditModal && (
        <EditStudentModal
          student={student}
          onClose={() => setShowEditModal(false)}
          onSaved={patch => setStudent({ ...student, ...patch, enrollmentDate: patch.enrollmentDate || undefined } as UserProfile)}
        />
      )}

      {/* Прикрепление к группе — инлайновый выбор, а не третье модальное окно поверх. */}
      {showAssignModal && (
        <ConfirmDialog
          open
          title="Прикрепить к группе"
          confirmLabel={assigning ? 'Прикрепляем…' : 'Прикрепить'}
          busy={assigning || !selectedGroupId}
          onConfirm={handleAssignGroup}
          onClose={() => { setShowAssignModal(false); setSelectedGroupId(''); }}
          message={
            <div>
              <p className="mb-3">Выберите группу для ученика <b>{student.displayName}</b>.</p>
              {allGroups.filter(g => !(g.studentIds || []).includes(uid!)).length === 0 ? (
                <p className="text-amber-700 dark:text-amber-300">Свободных групп нет — все уже содержат этого ученика.</p>
              ) : (
                <select
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  aria-label="Группа"
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-primary-500"
                >
                  <option value="">— Выберите группу —</option>
                  {allGroups.filter(g => !(g.studentIds || []).includes(uid!)).map(g => (
                    <option key={g.id} value={g.id}>{g.name}{g.courseName ? ` (${g.courseName})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          }
        />
      )}

      <ConfirmDialog
        open={confirm?.kind === 'expel'}
        danger
        busy={confirmBusy}
        title="Отчислить студента?"
        confirmLabel="Отчислить"
        // Формулировка та же, что в списке: одно действие не должно звучать
        // в двух местах по-разному, особенно необратимое на вид.
        message={<>Отчислить <b>{student.displayName}</b>? Журнал и история оплат сохранятся — студента можно будет восстановить.</>}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'unassign'}
        busy={confirmBusy}
        title="Открепить от группы?"
        confirmLabel="Открепить"
        message={<>Ученик перестанет числиться в группе <b>{confirm?.kind === 'unassign' ? confirm.groupName : ''}</b>. Отметки и оценки в журнале сохранятся.</>}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'revokeParent'}
        danger
        busy={confirmBusy}
        title="Сбросить ссылку?"
        confirmLabel="Сбросить"
        message="Родитель больше не сможет открыть портал по текущей ссылке. Это действие необратимо."
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />

      <ReportCommentModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        studentName={student.displayName || 'Ученик'}
        stats={{
          'Посещаемость': risk ? `${risk.attendanceRate}%` : '—',
          'Средний балл': risk?.averageScore ? String(risk.averageScore) : '—',
          'Сдано онлайн-экзаменов': results.length,
          'Средний результат': `${stats.avgScore}%`,
          'Верных ответов': stats.totalQuestions > 0 ? `${stats.totalCorrect}/${stats.totalQuestions}` : '0',
        }}
      />
    </div>
  );
};

/* ─── Мелкие части ─── */

const Dot: React.FC = () => <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>;

const SectionHeading: React.FC<{
  title: string;
  meta?: string;
  action?: { label: string; to: string };
}> = ({ title, meta, action }) => (
  // Заголовок живёт НАД контейнером, а не внутри него: иначе получается карточка
  // в карточке — самый частый способ утопить иерархию.
  <div className="flex items-baseline justify-between gap-3 mb-2.5">
    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
      {title}
      {meta && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{meta}</span>}
    </h2>
    {action && (
      <Link to={action.to} className="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);

const Metric: React.FC<{
  label: string;
  value: string;
  hint?: string;
  /** Порог перейдён — только тогда появляется цвет. */
  alarming?: boolean;
  trend?: 'up' | 'down' | 'flat';
}> = ({ label, value, hint, alarming, trend }) => (
  <div className="px-4 py-3">
    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-xl font-semibold tabular-nums flex items-center gap-1 ${
      alarming ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
    }`}>
      {value}
      {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-rose-500" aria-hidden />}
      {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-500" aria-hidden />}
    </dd>
    {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);

const ProblemRow: React.FC<{
  tone: 'rose' | 'amber';
  text: React.ReactNode;
  action?: { label: string; to?: string; onClick?: () => void };
}> = ({ tone, text, action }) => {
  const cls = tone === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100'
    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${cls}`}>
      <p className="text-sm flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
        <span>{text}</span>
      </p>
      {action && (action.to ? (
        <Link to={action.to} className="shrink-0 text-sm font-semibold underline underline-offset-2">{action.label}</Link>
      ) : (
        <button onClick={action.onClick} className="shrink-0 text-sm font-semibold underline underline-offset-2">{action.label}</button>
      ))}
    </div>
  );
};

const LoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  // Сбой обязан выглядеть как сбой. Пустой catch печатал 403 как «Начислений
  // пока нет» — то есть ошибка превращалась в факт про деньги.
  <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
    Не удалось загрузить
    <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-primary-600 dark:text-primary-400 hover:underline">
      <RotateCcw className="w-3.5 h-3.5" />Повторить
    </button>
  </p>
);

/** Скелет вместо спиннера: экран сразу показывает свою форму. */
const DetailSkeleton: React.FC = () => (
  <div className="max-w-5xl mx-auto" aria-busy="true" aria-label="Загрузка карточки студента">
    <Skeleton className="h-5 w-24 mb-5" />
    <div className="flex items-start gap-4 mb-6">
      <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>
    </div>
    <Skeleton className="h-20 w-full rounded-2xl mb-8" />
    <Skeleton className="h-4 w-20 mb-2.5" />
    <Skeleton className="h-40 w-full rounded-2xl mb-8" />
    <Skeleton className="h-4 w-28 mb-2.5" />
    <Skeleton className="h-32 w-full rounded-2xl" />
  </div>
);

export default StudentDetailPage;
