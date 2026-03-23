import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Plus } from 'lucide-react';

const AdminPlansPage: React.FC = () => {
  const { t } = useTranslation();

  const plans = [
    { id: 'starter', name: 'Starter', price: 39, color: 'bg-blue-600', features: ['50 students', '5 teachers', '10 exams', 'Basic analytics'] },
    { id: 'professional', name: 'Professional', price: 79, color: 'bg-violet-600', features: ['200 students', '20 teachers', '50 exams', 'Advanced analytics', 'AI features'] },
    { id: 'enterprise', name: 'Enterprise', price: 99, color: 'bg-amber-600', features: ['Unlimited students', 'Unlimited teachers', 'Unlimited exams', 'Full analytics', 'AI features', 'Custom branding', 'Priority support'] },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.plans')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.plans.subtitle')}</p>
        </div>
        <button className="btn-primary text-sm flex items-center gap-1"><Plus className="w-4 h-4" />{t('admin.plans.addPlan')}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className={`${plan.color} px-6 py-5`}>
              <Tag className="w-5 h-5 text-white/80 mb-2" />
              <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              <p className="text-white/80 text-sm">${plan.price}/mo</p>
            </div>
            <div className="p-6">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-secondary text-sm w-full mt-4">{t('common.edit')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPlansPage;
