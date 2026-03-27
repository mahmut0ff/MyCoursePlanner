import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetPaymentPlans, apiCreateTransaction } from '../../../lib/api';
import { CheckCircle2, AlertCircle, Clock, Search } from 'lucide-react';

const IncomeTab: React.FC = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    apiGetPaymentPlans()
      .then(setPlans)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleMarkPaid = async (plan: any) => {
    if (!confirm('Отметить как оплаченный?')) return;
    try {
      // Create an income transaction
      await apiCreateTransaction({
        type: 'income',
        amount: plan.totalAmount - plan.paidAmount,
        date: new Date().toISOString(),
        categoryId: 'course_fee',
        paymentPlanId: plan.id,
        studentId: plan.studentId,
        courseId: plan.courseId,
        description: `Оплата курса`
      });
      // The backend transaction trigger should automatically update the plan's paidAmount, but we can optimistically reload
      load();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const filtered = plans.filter((p) => 
    (p.studentName?.toLowerCase() || '').includes(search.toLowerCase()) || 
    (p.courseName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('finances.searchDebts', 'Поиск по студенту или курсу...')}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500 animate-pulse">Загрузка данных...</div>
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-500">
          Нет счетов
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium text-slate-500">Студент</th>
                <th className="px-6 py-4 font-medium text-slate-500">Курс</th>
                <th className="px-6 py-4 font-medium text-slate-500">Сумма (Оплачено)</th>
                <th className="px-6 py-4 font-medium text-slate-500">Статус</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {p.studentName || p.studentId}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {p.courseName || p.courseId}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <span className={p.paidAmount < p.totalAmount ? 'text-amber-500' : 'text-emerald-500'}>
                      {p.paidAmount?.toLocaleString()} / {p.totalAmount?.toLocaleString()} с.
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      p.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                      p.status === 'overdue' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30'
                    }`}>
                      {p.status === 'paid' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {p.status === 'overdue' && <AlertCircle className="w-3.5 h-3.5" />}
                      {(p.status === 'pending' || p.status === 'partial') && <Clock className="w-3.5 h-3.5" />}
                      {p.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {p.status !== 'paid' && (
                      <button onClick={() => handleMarkPaid(p)} className="text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                        Отметить оплату
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default IncomeTab;
