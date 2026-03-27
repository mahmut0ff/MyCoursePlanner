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
  professional: { name: 'Professional', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40' },
  enterprise: { name: 'Enterprise', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40' },
};

const UpgradeWall: React.FC<UpgradeWallProps> = ({ feature, title }) => {
  const { t } = useTranslation();
  const minPlan = FEATURE_MIN_PLAN[feature] || 'professional';
  const display = PLAN_DISPLAY[minPlan] || PLAN_DISPLAY.professional;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-lg">
          <Lock className="w-9 h-9 text-slate-400 dark:text-slate-500" />
        </div>

        {/* Title & Subtitle */}
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
            {title || t('upgrade.title', 'Функция недоступна')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {t('upgrade.subtitle', 'Эта функция доступна на тарифе')}
          </p>
        </div>

        {/* Plan badge */}
        <div className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border ${display.bg}`}>
          <Sparkles className={`w-5 h-5 ${display.color}`} />
          <span className={`text-base font-bold ${display.color}`}>{display.name}</span>
          <span className="text-xs text-slate-400">{t('upgrade.andAbove', 'и выше')}</span>
        </div>

        {/* CTA */}
        <div>
          <Link
            to="/billing"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20 group"
          >
            {t('upgrade.cta', 'Перейти на тариф')}
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UpgradeWall;
