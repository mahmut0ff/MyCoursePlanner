import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Check, Crown, BookOpen, Shield } from 'lucide-react';

const AdminPlansPage: React.FC = () => {
  const { t } = useTranslation();

  const localPlans = [
    {
      id: 'starter', name: t('landing.planBasic'), price: 1990, popular: false, icon: BookOpen,
      features: [t('landing.planBasicF1'), t('landing.planBasicF2'), t('landing.planBasicF3'), t('landing.planBasicF4')],
    },
    {
      id: 'professional', name: t('landing.planPro'), price: 4990, popular: true, icon: Crown,
      features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
    },
    {
      id: 'enterprise', name: t('landing.planEnt'), price: 14900, popular: false, icon: Shield,
      features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.plans')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('admin.plans.subtitle')}</p>
        </div>
        <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{t('admin.plans.addPlan')}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {localPlans.map((plan) => (
          <div key={plan.id} className={`relative rounded-3xl p-8 border transition-all hover:shadow-xl ${plan.popular ? 'bg-primary-600 border-primary-600 text-white shadow-2xl shadow-primary-500/30 md:scale-105 z-10' : 'bg-white border-slate-200 hover:shadow-slate-200/50 dark:bg-slate-800 dark:border-slate-700'}`}>
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                {t('landing.popular')}
              </div>
            )}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${plan.popular ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                <plan.icon className={`w-6 h-6 ${plan.popular ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} />
              </div>
              <h3 className={`text-xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h3>
            </div>
            <div className="mb-8">
              <span className={`text-5xl font-extrabold tracking-tight ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.price.toLocaleString()}</span>
              <span className={`text-sm ml-2 ${plan.popular ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{t('landing.currency')}/{t('landing.perMonth')}</span>
            </div>
            <ul className="space-y-4 mb-10">
              {plan.features.map((f, i) => (
                <li key={i} className={`flex items-start gap-3 text-sm ${plan.popular ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'}`}>
                  <Check className={`w-5 h-5 shrink-0 mt-0.5 ${plan.popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${plan.popular ? 'bg-white text-primary-700 hover:bg-slate-50 shadow-lg shadow-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'}`}>
              {t('common.edit')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPlansPage;
