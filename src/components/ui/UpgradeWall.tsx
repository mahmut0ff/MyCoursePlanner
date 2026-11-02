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

const PLAN_DISPLAY: Record<string, { name: string; color: string; bg: string }> = {
  professional: { name: 'Professional', color: 'text-primary-700 dark:text-primary-300', bg: 'bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800' },
  enterprise: { name: 'Enterprise', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40' },
};

const UpgradeWall: React.FC<UpgradeWallProps> = ({ feature, title }) => {
  const { t } = useTranslation();
  const minPlan = FEATURE_MIN_PLAN[feature] || 'professional';
  const display = PLAN_DISPLAY[minPlan] || PLAN_DISPLAY.professional;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center space-y-4">
        {/* Icon */}
        <Lock className="mx-auto w-6 h-6 text-slate-400 dark:text-slate-500" />

        {/* Title & Subtitle */}
        <div>
          <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            {title || t('upgrade.title', 'Функция недоступна')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('upgrade.subtitle', 'Эта функция доступна на тарифе')}
          </p>
        </div>

        {/* Plan badge */}
        <div className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border ${display.bg}`}>
          <Sparkles className={`w-3.5 h-3.5 ${display.color}`} />
          <span className={`text-sm font-semibold ${display.color}`}>{display.name}</span>
          <span className="text-xs text-slate-400">{t('upgrade.andAbove', 'и выше')}</span>
        </div>

        {/* CTA */}
        <div>
          <Link
            to="/billing"
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {t('upgrade.cta', 'Перейти на тариф')}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UpgradeWall;
