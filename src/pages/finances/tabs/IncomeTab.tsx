import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetPaymentPlans, apiCreatePaymentPlan, apiCreateTransaction, apiGetTransactions, apiDeletePaymentPlan } from '../../../lib/api';
import { orgGetStudents } from '../../../lib/api';
import { CheckCircle2, AlertCircle, Clock, Search, Plus, CreditCard, History, X, Users, Trash2, Download } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [saving, setSaving] = useState(false);

  // Pay modal form
  const [payAmount, setPayAmount] = useState('');
  const [payComment, setPayComment] = useState('');
  const [payMethod, setPayMethod] = useState('cash');

  // Create plan form
  const [newPlan, setNewPlan] = useState({
    studentId: '', studentName: '', courseId: '', courseName: '',
    totalAmount: '', deadline: '',
  });

  // Student autocomplete
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const studentInputRef = useRef<HTMLInputElement>(null);

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

  // Load students once for autocomplete
  useEffect(() => {
    orgGetStudents().then((data: any) => setAllStudents(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const filteredStudents = allStudents.filter(s =>
    (s.displayName?.toLowerCase() || '').includes(studentQuery.toLowerCase()) ||
    (s.email?.toLowerCase() || '').includes(studentQuery.toLowerCase())
  ).slice(0, 8);

  // ACCEPT PAYMENT
  const openPayModal = (plan: PaymentPlan) => {
    setSelectedPlan(plan);
    setPayAmount(String(plan.totalAmount - plan.paidAmount));
    setPayComment('');
    setPayMethod('cash');
    setModal('pay');
  };

  const handlePay = async () => {
    if (!selectedPlan || !payAmount || Number(payAmount) <= 0) return;
    setSaving(true);
    try {
      await apiCreateTransaction({
        type: 'income',
        amount: Number(payAmount),
        date: new Date().toISOString(),
        categoryId: 'course_fee',
        paymentPlanId: selectedPlan.id,
        studentId: selectedPlan.studentId,
        courseId: selectedPlan.courseId,
        paymentMethod: payMethod,
        description: payComment || `Оплата: ${selectedPlan.studentName || selectedPlan.studentId}`,
      });
      setModal('none');
      toast.success('Оплата принята');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // CREATE PLAN — with student autocomplete
  const openCreateModal = () => {
    setNewPlan({ studentId: '', studentName: '', courseId: '', courseName: '', totalAmount: '', deadline: '' });
    setStudentQuery('');
    setShowStudentDropdown(false);
    setModal('create');
  };

  const selectStudent = (student: any) => {
    setNewPlan({ ...newPlan, studentId: student.uid || student.id, studentName: student.displayName || '' });
    setStudentQuery(student.displayName || '');
    setShowStudentDropdown(false);
  };

  const handleCreate = async () => {
    if (!newPlan.studentId || !newPlan.totalAmount) {
      toast.error('Выберите студента и укажите сумму');
      return;
    }
    setSaving(true);
    try {
      await apiCreatePaymentPlan({
        studentId: newPlan.studentId,
        studentName: newPlan.studentName,
        courseId: newPlan.courseId || 'general',
        courseName: newPlan.courseName || 'Общий',
        totalAmount: Number(newPlan.totalAmount),
        paidAmount: 0,
        status: 'pending',
        deadline: newPlan.deadline || null,
      });
      setModal('none');
      toast.success('Счёт создан');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
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

  // FILTERS
  const filtered = plans.filter((p) => {
    const matchSearch =
      (p.studentName?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (p.courseName?.toLowerCase() || '').includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const totalDebt = plans.reduce((sum, p) => sum + Math.max(0, p.totalAmount - p.paidAmount), 0);
  const overdueCount = plans.filter(p => p.status === 'overdue').length;
  const paidCount = plans.filter(p => p.status === 'paid').length;

  // CSV Export
  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const header = 'Студент,Курс,Сумма,Оплачено,Долг,Статус,Дедлайн\n';
    const rows = filtered.map(p => {
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          </select>
        </div>
        {filtered.length > 0 && (
          <button onClick={handleExportCSV}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        )}
        <button onClick={openCreateModal}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-sm shrink-0">
          <Plus className="w-4 h-4" />{t('finances.createPlan', 'Новый счёт')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-10 text-center text-slate-500 animate-pulse">{t('common.loading', 'Загрузка...')}</div>
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('finances.noPlans', 'Нет счетов на оплату')}</p>
          <button onClick={openCreateModal} className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            {t('finances.createFirst', 'Создать первый счёт →')}
          </button>
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
                {filtered.map((p) => {
                  const debt = Math.max(0, p.totalAmount - p.paidAmount);
                  const cfg = statusConfig[p.status] || statusConfig.pending;
                  const Icon = cfg.icon;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {p.studentName || p.studentId}
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

      {/* ─── PAY MODAL ─── */}
      {modal === 'pay' && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Принять оплату</h2>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <p className="font-medium text-slate-900 dark:text-white">{selectedPlan.studentName || selectedPlan.studentId}</p>
                <p className="text-sm text-slate-500 mt-1">{selectedPlan.courseName || selectedPlan.courseId}</p>
                <div className="flex justify-between mt-3 text-sm">
                  <span className="text-slate-500">Остаток:</span>
                  <span className="font-bold text-amber-600">{(selectedPlan.totalAmount - selectedPlan.paidAmount).toLocaleString()} с.</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (с.)</label>
                <input type="number" autoFocus min="1" max={selectedPlan.totalAmount - selectedPlan.paidAmount}
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold" placeholder="0"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Способ оплаты</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm">
                    <option value="cash">💵 Наличные</option>
                    <option value="card">💳 Карта</option>
                    <option value="transfer">🏦 Перевод</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Комментарий</label>
                  <input type="text" value={payComment} onChange={(e) => setPayComment(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="Наличные / Перевод..."
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setModal('none')} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
              <button onClick={handlePay} disabled={saving || !payAmount || Number(payAmount) <= 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                {saving ? 'Сохранение...' : 'Подтвердить оплату'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE PLAN MODAL (with student autocomplete) ─── */}
      {modal === 'create' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новый счёт на оплату</h2>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Student Autocomplete */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Студент *</label>
                <input
                  ref={studentInputRef}
                  type="text"
                  autoFocus
                  value={studentQuery}
                  onChange={(e) => {
                    setStudentQuery(e.target.value);
                    setShowStudentDropdown(true);
                    if (!e.target.value) setNewPlan({ ...newPlan, studentId: '', studentName: '' });
                  }}
                  onFocus={() => setShowStudentDropdown(true)}
                  className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-2.5 text-sm ${
                    newPlan.studentId ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="Начните вводить имя студента..."
                />
                {newPlan.studentId && (
                  <div className="absolute right-3 top-[34px] text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                {showStudentDropdown && studentQuery && !newPlan.studentId && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Студенты не найдены</div>
                    ) : (
                      filteredStudents.map(s => (
                        <button
                          key={s.uid || s.id}
                          type="button"
                          onClick={() => selectStudent(s)}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                        >
                          {s.avatarUrl ? (
                            <img src={s.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold">
                              {s.displayName?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{s.displayName}</p>
                            <p className="text-[11px] text-slate-400">{s.email}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Курс / Предмет</label>
                <input type="text" value={newPlan.courseName}
                  onChange={(e) => setNewPlan({ ...newPlan, courseName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="Английский язык"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (сом) *</label>
                <input type="number" min="1" value={newPlan.totalAmount}
                  onChange={(e) => setNewPlan({ ...newPlan, totalAmount: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold"
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Срок оплаты</label>
                <input type="date" value={newPlan.deadline}
                  onChange={(e) => setNewPlan({ ...newPlan, deadline: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setModal('none')} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
              <button onClick={handleCreate}
                disabled={saving || !newPlan.studentId || !newPlan.totalAmount}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all">
                {saving ? 'Создание...' : 'Создать счёт'}
              </button>
            </div>
          </div>
        </div>
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
