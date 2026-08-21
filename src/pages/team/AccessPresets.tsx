import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Zap } from 'lucide-react';
import { ACCESS_PRESETS, type AccessPreset } from '../../lib/rbac';

/**
 * Быстрые наборы прав — одна кнопка вместо семи галочек в разных разделах.
 *
 * Показывается над матрицей и в редакторе роли, и в тонкой настройке сотрудника:
 * это два входа в один и тот же набор прав, и раньше наборы были только во
 * втором — роль тем же кликом собрать было нельзя. Пресет ничего не хранит, он
 * правит ту же матрицу, поэтому сразу видно, что именно он включил, и любую
 * галочку можно доснять руками.
 */
const AccessPresets: React.FC<{
  /** Набор выдан целиком? */
  active: (preset: AccessPreset) => boolean;
  onToggle: (preset: AccessPreset) => void;
  disabled?: boolean;
}> = ({ active, onToggle, disabled }) => {
  const { t } = useTranslation();
  if (ACCESS_PRESETS.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        {t('team.presets', 'Быстрые наборы')}
      </p>
      <div className="space-y-2">
        {ACCESS_PRESETS.map(p => {
          const on = active(p);
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(p)}
              className={`w-full text-left p-3 rounded-xl border transition-colors disabled:opacity-60 disabled:cursor-default ${
                on
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/10 dark:border-primary-500/50'
                  : 'border-slate-200 dark:border-slate-700 enabled:hover:bg-slate-50 dark:enabled:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  on ? 'bg-primary-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  {on ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                </span>
                <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{p.label}</span>
              </span>
              <span className="block mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{p.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AccessPresets;
