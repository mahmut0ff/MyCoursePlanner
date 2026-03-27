import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetFinanceMetrics } from '../../../lib/api';
import { TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const OverviewTab: React.FC = () => {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGetFinanceMetrics()
      .then(setMetrics)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Загрузка метрик...</div>;
  if (error) return <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl">{error}</div>;

  const data = metrics?.chartData || [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-500">{t('finances.revenue', 'Выручка')}</p>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            {metrics?.totalIncome?.toLocaleString() || 0} ₸
          </h3>
          <p className="text-xs text-slate-400 mt-2">Cash Collected</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-500">{t('finances.expenses', 'Расходы')}</p>
            <div className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-500 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            {metrics?.totalExpense?.toLocaleString() || 0} ₸
          </h3>
          <p className="text-xs text-slate-400 mt-2">Operating Costs</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-500">{t('finances.profit', 'Чистая прибыль')}</p>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-lg">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            {metrics?.netProfit?.toLocaleString() || 0} ₸
          </h3>
          <p className="text-xs text-slate-400 mt-2">Net Margin</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-400/20 to-orange-500/0 rounded-bl-full" />
          <div className="flex items-center justify-between mb-2 relative z-10">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-500">{t('finances.debt', 'Дебиторская задолженность')}</p>
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white relative z-10">
            {metrics?.outstandingDebt?.toLocaleString() || 0} ₸
          </h3>
          <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-2 relative z-10">Overdue Payments</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Cash Flow</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value: any) => `${value >= 1000 ? (value/1000)+'k' : value}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#f8fafc' }}
                itemStyle={{ fontSize: '14px', fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" name="Доход" />
              <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" name="Расход" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
