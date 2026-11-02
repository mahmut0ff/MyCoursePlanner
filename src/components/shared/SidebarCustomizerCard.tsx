import React from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, RotateCcw, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { useSidebarPrefs } from '../../lib/sidebarPrefs';
import { useNavModel } from '../layout/navModel';

/**
 * Settings card that lets each person tailor their own sidebar — every nav item
 * they are entitled to gets a switch, ON = shown in the menu.
 *
 * The model comes from useNavModel (the same source the sidebar renders), so the
 * list here always matches what that user actually sees. Hiding is **cosmetic**:
 * it only trims the menu, the route and the API stay reachable. Access is owned
 * by RBAC on /team — the copy must never suggest this card grants or revokes it.
 *
 * Renders nothing when the model is empty, so it can be dropped into any settings
 * surface safely. Mirrors ActiveRoleCard / ActiveOrgCard.
 */
const SidebarCustomizerCard: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // Same institution type the sidebar passes, so «Ученики»/«Классы» read
  // identically in both places instead of falling back to the generic terms.
  const { institutionType } = useOrg();
  // branchScope: false — the live menu drops entries that do not belong to the
  // current branch-switcher mode, but this card must offer every entry the user
  // is entitled to. Filtering here would make «Курсы» untoggleable while a
  // branch is selected, and silently reword the list as the switcher moves.
  const sections = useNavModel(institutionType, { branchScope: false });
  const { hidden, isHidden, toggle, reset } = useSidebarPrefs(profile?.uid);

  // Nothing to customise (e.g. model still deriving) — stay out of the way.
  if (!sections.length || !sections.some((s) => s.items.length)) return null;

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 ${className || ''}`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('sidebar.customize', 'Настройка меню')}</h2>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!hidden.length}
          className="btn-ghost inline-flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t('sidebar.showAll', 'Показать всё')}
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t('sidebar.customizeHint', 'Выберите, какие пункты показывать в боковом меню. Это меняет только меню и не влияет на права доступа.')}
      </p>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 items-start">
        {sections.filter((s) => s.items.length).map((section) => (
          <div key={section.id}>
            {section.label && (
              <p className="px-1 mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const visible = !isHidden(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex items-center gap-2.5 px-1 h-8 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${visible ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`} />
                    <span className={`text-sm truncate ${visible ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                      {item.label}
                    </span>
                    {item.locked && <Lock aria-hidden="true" className="w-3 h-3 shrink-0 text-slate-400 dark:text-slate-500" />}
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggle(item.id)}
                      className="sr-only peer"
                    />
                    {/* Track + knob; the real input above stays focusable for a11y. */}
                    <span className="ml-auto shrink-0 relative w-8 h-[18px] rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-primary-600 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/30 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3.5 after:h-3.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-3.5" />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SidebarCustomizerCard;
