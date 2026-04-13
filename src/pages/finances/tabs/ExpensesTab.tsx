import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetTransactions, apiCreateTransaction, apiDeleteTransaction } from '../../../lib/api';
import { Plus, Search, Calendar as CalendarIcon, FileText, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
  { id: 'salary', label: 'Зарплата', color: '#6366f1' },
  { id: 'rent', label: 'Аренда', color: '#f59e0b' },
  { id: 'marketing', label: 'Маркетинг', color: '#10b981' },
  { id: 'supplies', label: 'Канцтовары', color: '#06b6d4' },
  { id: 'utilities', label: 'Коммунальные', color: '#ef4444' },
  { id: 'transport', label: 'Транспорт', color: '#8b5cf6' },
  { id: 'equipment', label: 'Оборудование', color: '#f97316' },
  { id: 'other', label: 'Прочее', color: '#64748b' },
];

const getCategoryLabel = (id: string) => EXPENSE_CATEGORIES.find(c => c.id === id)?.label || id;
const getCategoryColor = (id: string) => EXPENSE_CATEGORIES.find(c => c.id === id)?.color || '#64748b';

const ExpensesTab: React.FC = () => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [form, setForm] = useState({
    amount: '',
    categoryId: 'other',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash',
  });

  const load = () => {
    setLoading(true);
    apiGetTransactions()
      .then((data) => setTransactions(data.filter((tx: any) => tx.type === 'expense')))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Введите корректную сумму');
    setSaving(true);
    try {
      await apiCreateTransaction({
        type: 'expense',
        amount: Number(form.amount),
        date: new Date(form.date).toISOString(),
        categoryId: form.categoryId,
        description: form.description,
        paymentMethod: form.paymentMethod,
      });
      setShowModal(false);
      setForm({ amount: '', categoryId: 'other', description: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' });
      toast.success('Расход добавлен');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить эту транзакцию? Это необратимо.')) return;
    try {
      await apiDeleteTransaction(id);
      toast.success('Транзакция удалена');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  // Filters
  const filtered = transactions.filter((tx) => {
    const matchSearch =
      (tx.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (tx.categoryId?.toLowerCase() || '').includes(search.toLowerCase());
    const matchCategory = !categoryFilter || tx.categoryId === categoryFilter;
    return matchSearch && matchCategory;
  });

  // Stats
  const totalExpenses = filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Итого расходов (отфильтровано)</p>
          <p className="text-2xl font-bold text-rose-500">-{totalExpenses.toLocaleString()} с.</p>
        </div>
        <div className="text-right text-xs text-slate-400">{filtered.length} записей</div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по описанию..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">Все категории</option>
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('finances.addExpense', 'Добавить Расход')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-10 text-center text-slate-500 animate-pulse">Загрузка данных...</div>
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-500">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p>Нет расходов</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Дата</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Категория</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Сумма</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500">Способ</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500 w-full">Описание</th>
                  <th className="px-5 py-3.5 font-medium text-slate-500 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(tx.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: getCategoryColor(tx.categoryId) + '18', color: getCategoryColor(tx.categoryId) }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: getCategoryColor(tx.categoryId) }} />
                        {getCategoryLabel(tx.categoryId)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-rose-500">
                      -{tx.amount.toLocaleString()} с.
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 capitalize">
                      {tx.paymentMethod === 'card' ? '💳 Карта' : tx.paymentMethod === 'transfer' ? '🏦 Перевод' : '💵 Наличные'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate">
                      {tx.description || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ADD EXPENSE MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новый Расход</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (с.)</label>
                <input
                  type="number" autoFocus min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Категория</label>
                <div className="grid grid-cols-4 gap-2">
                  {EXPENSE_CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, categoryId: c.id })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium transition-all ${
                        form.categoryId === c.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Дата</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Способ оплаты</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="cash">💵 Наличные</option>
                    <option value="card">💳 Карта</option>
                    <option value="transfer">🏦 Перевод</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Описание</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm min-h-[70px]"
                  placeholder="Например: Закупка бумаги..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.amount}
                className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
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
