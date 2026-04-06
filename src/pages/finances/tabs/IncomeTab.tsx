import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetPaymentPlans, apiCreatePaymentPlan, apiCreateTransaction, apiGetTransactions } from '../../../lib/api';
import { CheckCircle2, AlertCircle, Clock, Search, Plus, CreditCard, History, X, Users } from 'lucide-react';

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

  // Create plan form
  const [newPlan, setNewPlan] = useState({
    studentId: '', studentName: '', courseId: '', courseName: '',
    totalAmount: '', deadline: '',
  });

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

  // ACCEPT PAYMENT
  const openPayModal = (plan: PaymentPlan) => {
    setSelectedPlan(plan);
    setPayAmount(String(plan.totalAmount - plan.paidAmount)); // pre-fill remaining
    setPayComment('');
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
        description: payComment || `Оплата: ${selectedPlan.studentName || selectedPlan.studentId}`,
      });
      setModal('none');
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // CREATE PLAN
  const openCreateModal = () => {
    setNewPlan({ studentId: '', studentName: '', courseId: '', courseName: '', totalAmount: '', deadline: '' });
    setModal('create');
  };

  const handleCreate = async () => {
    if (!newPlan.studentName || !newPlan.totalAmount) return;
    setSaving(true);
    try {
      await apiCreatePaymentPlan({
        studentId: newPlan.studentId || newPlan.studentName, // fallback
        studentName: newPlan.studentName,
        courseId: newPlan.courseId || 'general',
        courseName: newPlan.courseName || 'Общий',
        totalAmount: Number(newPlan.totalAmount),
        paidAmount: 0,
        status: 'pending',
        deadline: newPlan.deadline || null,
      });
      setModal('none');
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // PAYMENT HISTORY
  const openHistory = async (plan: PaymentPlan) => {
    setSelectedPlan(plan);
    setModal('history');
    setHistoryLoading(true);
    try {
      const txs = await apiGetTransactions();
      const filtered = (Array.isArray(txs) ? txs : []).filter((tx: Transaction) =>
        tx.paymentPlanId === plan.id || (tx.studentId === plan.studentId && tx.type === 'income')
      );
      setHistory(filtered);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
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
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('finances.searchDebts', 'Поиск по студенту или курсу...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">{t('finances.allStatuses', 'Все статусы')}</option>
            <option value="pending">{t('finances.pending', 'Ожидает')}</option>
            <option value="partial">{t('finances.partial', 'Частично')}</option>
            <option value="overdue">{t('finances.overdue', 'Просрочено')}</option>
            <option value="paid">{t('finances.paid', 'Оплачено')}</option>
          </select>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('finances.createPlan', 'Новый счёт')}
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
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.student', 'Студент')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.course', 'Курс')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.total', 'Сумма')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.paidOf', 'Оплачено')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.debt', 'Долг')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">{t('common.status', 'Статус')}</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.actions', 'Действия')}</th>
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
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                        {p.courseName || p.courseId || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {p.totalAmount?.toLocaleString()} с.
                      </td>
                      <td className="px-5 py-3.5 text-emerald-600 font-medium whitespace-nowrap">
                        {p.paidAmount?.toLocaleString()} с.
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`font-bold ${debt > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {debt > 0 ? `${debt.toLocaleString()} с.` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {p.status !== 'paid' && (
                            <button
                              onClick={() => openPayModal(p)}
                              className="text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors text-xs"
                            >
                              {t('finances.acceptPayment', 'Принять оплату')}
                            </button>
                          )}
                          <button
                            onClick={() => openHistory(p)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title={t('finances.paymentHistory', 'История оплат')}
                          >
                            <History className="w-4 h-4" />
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.acceptPayment', 'Принять оплату')}</h2>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <p className="font-medium text-slate-900 dark:text-white">{selectedPlan.studentName || selectedPlan.studentId}</p>
                <p className="text-sm text-slate-500 mt-1">{selectedPlan.courseName || selectedPlan.courseId}</p>
                <div className="flex justify-between mt-3 text-sm">
                  <span className="text-slate-500">{t('finances.remaining', 'Остаток')}:</span>
                  <span className="font-bold text-amber-600">{(selectedPlan.totalAmount - selectedPlan.paidAmount).toLocaleString()} с.</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.amount', 'Сумма (с.)')}</label>
                <input
                  type="number"
                  autoFocus
                  min="1"
                  max={selectedPlan.totalAmount - selectedPlan.paidAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.comment', 'Комментарий')}</label>
                <input
                  type="text"
                  value={payComment}
                  onChange={(e) => setPayComment(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder={t('finances.commentPlaceholder', 'Наличные / Перевод / ...')}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setModal('none')} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handlePay}
                disabled={saving || !payAmount || Number(payAmount) <= 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {saving ? t('common.loading', 'Сохранение...') : t('finances.confirmPayment', 'Подтвердить оплату')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE PLAN MODAL ─── */}
      {modal === 'create' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.createPlan', 'Новый счёт на оплату')}</h2>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.student', 'Имя студента')} *</label>
                <input
                  type="text"
                  autoFocus
                  value={newPlan.studentName}
                  onChange={(e) => setNewPlan({ ...newPlan, studentName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder={t('finances.studentPlaceholder', 'Алишер Каримов')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.course', 'Курс / Предмет')}</label>
                <input
                  type="text"
                  value={newPlan.courseName}
                  onChange={(e) => setNewPlan({ ...newPlan, courseName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder={t('finances.coursePlaceholder', 'Английский язык')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.amount', 'Сумма (сом)')} *</label>
                <input
                  type="number"
                  min="1"
                  value={newPlan.totalAmount}
                  onChange={(e) => setNewPlan({ ...newPlan, totalAmount: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold"
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.deadline', 'Срок оплаты')}</label>
                <input
                  type="date"
                  value={newPlan.deadline}
                  onChange={(e) => setNewPlan({ ...newPlan, deadline: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setModal('none')} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newPlan.studentName || !newPlan.totalAmount}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
              >
                {saving ? t('common.loading', 'Создание...') : t('finances.create', 'Создать счёт')}
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
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.paymentHistory', 'История оплат')}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{selectedPlan.studentName || selectedPlan.studentId}</p>
              </div>
              <button onClick={() => setModal('none')} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {/* Progress bar */}
              <div className="mb-5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">{t('finances.progress', 'Прогресс оплаты')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedPlan.paidAmount.toLocaleString()} / {selectedPlan.totalAmount.toLocaleString()} с.
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (selectedPlan.paidAmount / selectedPlan.totalAmount) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Timeline */}
              {historyLoading ? (
                <div className="py-6 text-center text-slate-500 animate-pulse">{t('common.loading', 'Загрузка...')}</div>
              ) : history.length === 0 ? (
                <div className="py-6 text-center text-slate-400">{t('finances.noHistory', 'Нет истории оплат')}</div>
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
                          <p className="text-xs text-slate-500">{new Date(tx.date || tx.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {tx.description && (
                        <p className="text-xs text-slate-400 max-w-[140px] truncate">{tx.description}</p>
                      )}
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
