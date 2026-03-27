import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Lock, ArrowUpRight, Sparkles } from 'lucide-react';
import type { PlanFeature } from '../../types';
import { FEATURE_MIN_PLAN } from '../../types';

interface UpgradeWallProps {
  feature: PlanFeature;
  /** Optional custom title override */
  title?: string;
}

const PLAN_DISPLAY: Record<string, { name: string; color: string }> = {
  professional: { name: 'Professional', color: 'text-violet-600' },
  enterprise: { name: 'Enterprise', color: 'text-amber-600' },
};

const UpgradeWall: React.FC<UpgradeWallProps> = ({ feature, title }) => {
  const { t } = useTranslation();
  const minPlan = FEATURE_MIN_PLAN[feature] || 'professional';
  const display = PLAN_DISPLAY[minPlan] || PLAN_DISPLAY.professional;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-6 shadow-lg">
          <Lock className="w-9 h-9 text-slate-400 dark:text-slate-500" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-3">
          {title || t('upgrade.title', 'Функция недоступна')}
        </h2>

        {/* Subtitle */}
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
          {t('upgrade.subtitle', 'Эта функция доступна на тарифе')}
        </p>

        {/* Plan badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-8">
          <Sparkles className={`w-4 h-4 ${display.color}`} />
          <span className={`text-sm font-bold ${display.color}`}>{display.name}</span>
          <span className="text-xs text-slate-400">{t('upgrade.andAbove', 'и выше')}</span>
        </div>

        {/* CTA */}
        <Link
          to="/billing"
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20 group"
        >
          {t('upgrade.cta', 'Перейти на тариф')}
          <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};

export default UpgradeWall;
