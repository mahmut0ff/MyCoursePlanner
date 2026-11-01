import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Crown, BookOpen, Shield } from 'lucide-react';
import { planPrice } from '../../lib/subscription-plans';

const AdminPlansPage: React.FC = () => {
  const { t } = useTranslation();

  const localPlans = [
    {
      id: 'starter', name: t('landing.planBasic'), price: planPrice('starter'), popular: false, icon: BookOpen,
      features: [t('landing.planBasicF1'), t('landing.planBasicF2'), t('landing.planBasicF3'), t('landing.planBasicF4')],
    },
    {
      id: 'professional', name: t('landing.planPro'), price: planPrice('professional'), popular: true, icon: Crown,
      features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
    },
    {
      id: 'enterprise', name: t('landing.planEnt'), price: planPrice('enterprise'), popular: false, icon: Shield,
      features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.plans')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('admin.plans.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-5xl mx-auto">
        {localPlans.map((plan) => (
          <div key={plan.id} className={`relative rounded-lg p-4 border bg-white dark:bg-slate-800 ${plan.popular ? 'border-primary-600 ring-1 ring-primary-600 dark:border-primary-500 dark:ring-primary-500' : 'border-slate-200 dark:border-slate-700'}`}>
            {plan.popular && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-primary-600 text-white">
                {t('landing.popular')}
              </div>
            )}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700">
                <plan.icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
            </div>
            <div className="mb-3">
              <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{plan.price.toLocaleString()}</span>
              <span className="text-xs ml-1.5 text-slate-500 dark:text-slate-400">{t('landing.currency')}/{t('landing.perMonth')}</span>
            </div>
            <ul className="space-y-2">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPlansPage;
