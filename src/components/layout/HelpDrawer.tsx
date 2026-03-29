import { X, Info, Lightbulb } from 'lucide-react';
import type { PageHelpConfig } from '../../data/pageHelpData';
import { useTranslation } from 'react-i18next';

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: PageHelpConfig | null;
}

export function HelpDrawer({ isOpen, onClose, config }: HelpDrawerProps) {
  const { t } = useTranslation();

  if (!isOpen || !config) return null;

  const basePath = `pageHelp.${config.id}`;

  const title = t(`${basePath}.title`);
  const description = t(`${basePath}.desc`);
  
  // Resolve features based on icons array and tKeys (f1, f2, f3...)
  const features = config.featuresIcons.map((Icon, index) => ({
    icon: Icon,
    text: t(`${basePath}.f${index + 1}`)
  }));

  // Resolve tips based on tipsCount
  const tips: string[] = [];
  for (let i = 1; i <= config.tipsCount; i++) {
    tips.push(t(`${basePath}.t${i}`));
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={onClose}
      />
      <div 
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-xl">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                {t('common.howItWorks', 'Как работает модуль?')}
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 max-w-[200px] truncate">
                {title}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 pb-20 space-y-8">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">
              {title}
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[15px]">
              {description}
            </p>
          </div>

          {features.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {t('common.keyFeatures', 'Ключевые возможности')}
              </h4>
              <div className="grid gap-3">
                {features.map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 transition-colors hover:border-slate-200 dark:hover:border-slate-600">
                      <div className="mt-0.5 shrink-0 bg-white dark:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-600">
                        <Icon className="w-4 h-4 text-primary-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                        {feature.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tips.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 rounded-2xl p-5 mt-8">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h4 className="font-semibold text-amber-800 dark:text-amber-400">
                  {t('common.proTips', 'Полезные советы (Про-тип)')}
                </h4>
              </div>
              <ul className="space-y-2 mt-1">
                {tips.map((tip, idx) => (
                  <li key={idx} className="flex gap-3 text-[14px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                    <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400/80 opacity-60 block" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
