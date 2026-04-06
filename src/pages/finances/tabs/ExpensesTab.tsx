import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetTransactions, apiCreateTransaction } from '../../../lib/api';
import { Plus, Search, Calendar as CalendarIcon, Tag, FileText } from 'lucide-react';

const ExpensesTab: React.FC = () => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    categoryId: 'office',
    description: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setLoading(true);
    // Fetch only expenses for the list
    apiGetTransactions()
      .then((data) => setTransactions(data.filter((tx: any) => tx.type === 'expense')))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) return alert('Введите корректную сумму');
    setSaving(true);
    try {
      await apiCreateTransaction({
        type: 'expense',
        amount: Number(form.amount),
        date: new Date(form.date).toISOString(),
        categoryId: form.categoryId,
        description: form.description
      });
      setShowModal(false);
      setForm({ amount: '', categoryId: 'office', description: '', date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('common.search', 'Поиск')}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          {t('finances.addExpense', 'Добавить Расход')}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500 animate-pulse">Загрузка данных...</div>
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="py-20 text-center text-slate-500">
          Нет расходов
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium text-slate-500">Дата</th>
                <th className="px-6 py-4 font-medium text-slate-500">Категория</th>
                <th className="px-6 py-4 font-medium text-slate-500">Сумма</th>
                <th className="px-6 py-4 font-medium text-slate-500 w-full">Описание</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-slate-400" />
                      {new Date(tx.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-900 dark:text-white capitalize">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-slate-400" />
                      {tx.categoryId || 'Прочее'}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-rose-500">
                    -{tx.amount.toLocaleString()} с.
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {tx.description || '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новый Расход</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (с.)</label>
                <input
                  type="number"
                  autoFocus
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Категория</label>
                <input
                  type="text"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="Зарплата, Аренда, Маркетинг, Канцтовары..."
                  list="expense-categories"
                />
                <datalist id="expense-categories">
                  <option value="Зарплата" />
                  <option value="Аренда" />
                  <option value="Маркетинг" />
                  <option value="Канцтовары" />
                  <option value="Коммунальные" />
                  <option value="Транспорт" />
                  <option value="Оборудование" />
                  <option value="Прочее" />
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Дата</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Описание (Опционально)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm min-h-[80px]"
                  placeholder="Например: Закупка бумаги..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.amount}
                className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-all"
              >
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesTab;
