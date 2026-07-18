import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetPaymentPlans, apiGetTransactions, apiDeletePaymentPlan } from '../../../lib/api';
import { orgGetStudents } from '../../../lib/api';
import { CheckCircle2, AlertCircle, Clock, Search, Plus, CreditCard, History, X, Users, Trash2, Download, MinusCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AcceptPaymentModal from '../../../components/finance/AcceptPaymentModal';
import CreatePaymentPlanModal from '../../../components/finance/CreatePaymentPlanModal';

interface PaymentPlan {
  id: string;
  studentId: string;
  studentName?: string;
  courseId: string;
  courseName?: string;
  totalAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  deadline?: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description?: string;
  studentId?: string;
  paymentPlanId?: string;
  paymentMethod?: string;
  createdAt: string;
}

type ModalType = 'none' | 'pay' | 'create' | 'history';

const statusConfig = {
  paid: { label: 'Оплачено', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  overdue: { label: 'Просрочено', bg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', icon: AlertCircle },
  partial: { label: 'Частично', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  pending: { label: 'Ожидает', bg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', icon: Clock },
};

const noPlanBadge = { label: 'Без счёта', bg: 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400', icon: MinusCircle };

const isExpelled = (s: any) => (s?.status || 'active') === 'expelled';

// Бэкенд иногда отдаёт по нескольку member-документов на одного студента —
// сворачиваем к одному uid, предпочитая активную запись отчисленной.
const dedupeStudents = (list: any[]): any[] => {
  const byId = new Map<string, any>();
  for (const s of list) {
    const id = String(s.uid || s.id);
    const existing = byId.get(id);
    if (!existing || (isExpelled(existing) && !isExpelled(s))) byId.set(id, s);
  }
  return [...byId.values()];
};

// Единый список: строки-счета + строки-студенты без единого счёта
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

const IncomeTab: React.FC = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const [modal, setModal] = useState<ModalType>('none');
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  // Кого выставляем счёт — саму форму держит CreatePaymentPlanModal
  const [createFor, setCreateFor] = useState({ studentId: '', studentName: '' });

  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // History
  const [history, setHistory] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = () => {
    setLoading(true);
    apiGetPaymentPlans()
      .then((data: any) => setPlans(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Load students once — for autocomplete and the unified list.
  // Дедуплицируем по uid: бэкенд может вернуть дубли member-документов.
  useEffect(() => {
    orgGetStudents()
      .then((data: any) => setAllStudents(dedupeStudents(Array.isArray(data) ? data : [])))
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, []);

  // ACCEPT PAYMENT
  const openPayModal = (plan: PaymentPlan) => {
    setSelectedPlan(plan);
    setModal('pay');
  };

  // CREATE PLAN — открывается из строки студента, студент уже выбран
  const openCreateFor = (studentId: string, studentName: string) => {
    setCreateFor({ studentId, studentName });
    setModal('create');
  };

  // DELETE PLAN
  const handleDeletePlan = async (plan: PaymentPlan) => {
    if (!window.confirm(`Удалить счёт для ${plan.studentName || plan.studentId}? Это необратимо.`)) return;
    try {
      await apiDeletePaymentPlan(plan.id);
      toast.success('Счёт удалён');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  // PAYMENT HISTORY — server-side filtering
  const openHistory = async (plan: PaymentPlan) => {
    setSelectedPlan(plan);
    setModal('history');
    setHistoryLoading(true);
    try {
      const txs = await apiGetTransactions({ paymentPlanId: plan.id } as any);
      setHistory(Array.isArray(txs) ? txs : []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  // UNIFIED ROWS — все счета + все активные студенты без единого счёта.
  // Отчисленных не показываем: ни их счета, ни строки «без счёта».
  const studentKey = (s: any) => String(s.uid || s.id);
  const studentById = new Map(allStudents.map((s) => [studentKey(s), s]));
  const activeStudents = allStudents.filter((s) => !isExpelled(s));
  const billedIds = new Set(plans.map((p) => String(p.studentId)));
  const unbilledStudents = activeStudents.filter((s) => !billedIds.has(studentKey(s)));

  // Счета отчисленных студентов не показываем и не считаем в статистике
  const visiblePlans = plans.filter((p) => !isExpelled(studentById.get(String(p.studentId))));

  const allRows: Row[] = [
    ...visiblePlans.map((p) => ({ kind: 'plan' as const, plan: p, student: studentById.get(String(p.studentId)) })),
    ...unbilledStudents.map((s) => ({ kind: 'student' as const, student: s })),
  ];
  const rowName = (r: Row) =>
    r.kind === 'plan' ? (r.plan.studentName || r.student?.displayName || r.plan.studentId) : (r.student.displayName || '');
  allRows.sort((a, b) =>
    rowName(a).localeCompare(rowName(b), 'ru') ||
    (a.kind === 'plan' && b.kind === 'plan' ? (a.plan.courseName || '').localeCompare(b.plan.courseName || '', 'ru') : 0)
  );

  // FILTERS
  const q = search.toLowerCase();
  const filtered = allRows.filter((r) => {
    if (r.kind === 'plan') {
      const p = r.plan;
      const matchSearch = !q ||
        (p.studentName?.toLowerCase() || '').includes(q) ||
        (p.courseName?.toLowerCase() || '').includes(q) ||
        (r.student?.email?.toLowerCase() || '').includes(q);
      return matchSearch && (!statusFilter || p.status === statusFilter);
    }
    const s = r.student;
    const matchSearch = !q ||
      (s.displayName?.toLowerCase() || '').includes(q) ||
      (s.email?.toLowerCase() || '').includes(q);
    return matchSearch && (!statusFilter || statusFilter === 'no_plan');
  });

  // Stats — по видимым счетам (без отчисленных)
  const totalDebt = visiblePlans.reduce((sum, p) => sum + Math.max(0, p.totalAmount - p.paidAmount), 0);
  const overdueCount = visiblePlans.filter(p => p.status === 'overdue').length;
  const paidCount = visiblePlans.filter(p => p.status === 'paid').length;
  const unbilledCount = unbilledStudents.length;

  // CSV Export
  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const header = 'Студент,Курс,Сумма,Оплачено,Долг,Статус,Дедлайн\n';
    const rows = filtered.map(r => {
      if (r.kind === 'student') {
        return `"${r.student.displayName || ''}","",,,,${noPlanBadge.label},`;
      }
      const p = r.plan;
      const debt = Math.max(0, p.totalAmount - p.paidAmount);
      const statusLabel = statusConfig[p.status]?.label || p.status;
      return `"${p.studentName || p.studentId}","${p.courseName || p.courseId || ''}",${p.totalAmount},${p.paidAmount},${debt},${statusLabel},${p.deadline || ''}`;
    }).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment_plans.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl"><CreditCard className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.totalDebt', 'Общий долг')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{totalDebt.toLocaleString()} с.</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-rose-100 dark:bg-rose-900/30 rounded-xl"><AlertCircle className="w-5 h-5 text-rose-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.overdue', 'Просрочено')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{overdueCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.fullyPaid', 'Полностью оплачено')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{paidCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-xl"><Users className="w-5 h-5 text-sky-600" /></div>
          <div>
            <p className="text-xs text-slate-500">{t('finances.unbilled', 'Без счёта')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{unbilledCount}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('finances.searchDebts', 'Поиск по студенту или курсу...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm">
            <option value="">{t('finances.allStatuses', 'Все статусы')}</option>
            <option value="pending">Ожидает</option>
            <option value="partial">Частично</option>
            <option value="overdue">Просрочено</option>
            <option value="paid">Оплачено</option>
            <option value="no_plan">Без счёта</option>
          </select>
        </div>
        {filtered.length > 0 && (
          <button onClick={handleExportCSV}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        )}
      </div>

      {/* Table */}
      {loading || studentsLoading ? (
        <div className="py-10 text-center text-slate-500 animate-pulse">{t('common.loading', 'Загрузка...')}</div>
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {search || statusFilter ? t('finances.nothingFound', 'Ничего не найдено') : t('finances.noStudents', 'Нет студентов')}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Студент</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Курс</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Сумма</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Оплачено</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Долг</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Статус</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((row) => {
                  if (row.kind === 'student') {
                    const s = row.student;
                    const NoPlanIcon = noPlanBadge.icon;
                    return (
                      <tr key={`student-${s.uid || s.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <StudentCell name={s.displayName || '—'} email={s.email} avatarUrl={s.avatarUrl} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${noPlanBadge.bg}`}>
                            <NoPlanIcon className="w-3.5 h-3.5" />{noPlanBadge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openCreateFor(String(s.uid || s.id), s.displayName || '')}
                              className="text-sky-600 hover:text-sky-700 font-medium bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 px-2.5 py-1.5 rounded-lg transition-colors text-xs inline-flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" />Выставить счёт
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const p = row.plan;
                  const debt = Math.max(0, p.totalAmount - p.paidAmount);
                  const cfg = statusConfig[p.status] || statusConfig.pending;
                  const Icon = cfg.icon;
                  const displayName = p.studentName || row.student?.displayName || p.studentId;
                  return (
                    <tr key={`plan-${p.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <StudentCell name={displayName} email={row.student?.email} avatarUrl={row.student?.avatarUrl} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{p.courseName || p.courseId || '—'}</td>
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">{p.totalAmount?.toLocaleString()} с.</td>
                      <td className="px-5 py-3.5 text-emerald-600 font-medium whitespace-nowrap">{p.paidAmount?.toLocaleString()} с.</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`font-bold ${debt > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {debt > 0 ? `${debt.toLocaleString()} с.` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg}`}>
                          <Icon className="w-3.5 h-3.5" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {p.status !== 'paid' && (
                            <button onClick={() => openPayModal(p)}
                              className="text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors text-xs">
                              Принять
                            </button>
                          )}
                          <button onClick={() => openHistory(p)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="История оплат">
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => openCreateFor(String(p.studentId), displayName)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Выставить ещё один счёт">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletePlan(p)}
                            className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Удалить счёт">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* ─── HISTORY MODAL ─── */}
      {modal === 'history' && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">История оплат</h2>
                <p className="text-sm text-slate-500 mt-0.5">{selectedPlan.studentName || selectedPlan.studentId}</p>
              </div>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="mb-5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Прогресс оплаты</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedPlan.paidAmount.toLocaleString()} / {selectedPlan.totalAmount.toLocaleString()} с.
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (selectedPlan.paidAmount / selectedPlan.totalAmount) * 100)}%` }} />
                </div>
              </div>
              {historyLoading ? (
                <div className="py-6 text-center text-slate-500 animate-pulse">Загрузка...</div>
              ) : history.length === 0 ? (
                <div className="py-6 text-center text-slate-400">Нет истории оплат</div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {history.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                          <CreditCard className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">+{tx.amount.toLocaleString()} с.</p>
                          <p className="text-xs text-slate-500">
                            {new Date(tx.date || tx.createdAt).toLocaleDateString()}
                            {tx.paymentMethod && <span className="ml-1.5">· {tx.paymentMethod === 'card' ? '💳' : tx.paymentMethod === 'transfer' ? '🏦' : '💵'}</span>}
                          </p>
                        </div>
                      </div>
                      {tx.description && <p className="text-xs text-slate-400 max-w-[140px] truncate">{tx.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeTab;
