import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Check, MapPin, Settings2 } from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';

interface BranchSwitcherProps {
  onClose?: () => void;
  isCollapsed?: boolean;
}

/**
 * Sidebar branch (филиал) switcher — the app's single branch-scope control.
 *
 * Selecting a branch scopes every page's data through BranchContext, which is why
 * the individual pages no longer carry their own branch filters. «Все филиалы»
 * clears the scope entirely.
 */
const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ onClose, isCollapsed }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { branches, activeBranchId, setActiveBranch, activeBranch, loading } = useBranch();
  const { organizationId, isSuperAdmin, role } = useAuth();
  const { canRead } = usePermissions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Admins always manage branches; everyone else needs the RBAC grant. Students and
  // teachers get the switcher but not the management link.
  const canManage = role === 'admin' || canRead('branches');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Super admins operate above any single org; personal workspace has no branches.
  if (isSuperAdmin || !organizationId || organizationId === 'personal') return null;

  if (loading) {
    return (
      <div className={`px-2 pb-2 ${isCollapsed ? 'lg:flex lg:justify-center lg:px-0' : ''}`}>
        <div className={`h-8 bg-slate-200/60 dark:bg-slate-700/50 rounded-md animate-pulse ${isCollapsed ? 'lg:w-8' : ''}`} />
      </div>
    );
  }

  // No branches configured: offer the way in for those who can create one, and stay
  // out of the way for everyone else rather than showing an inert control.
  if (branches.length === 0 && !canManage) return null;

  const go = (path: string) => {
    setOpen(false);
    onClose?.();
    navigate(path);
  };

  const label = activeBranch?.name || t('branch.allBranches', 'Все филиалы');
  const subLabel = activeBranch?.city
    || (activeBranch ? t('branch.branch', 'Филиал') : t('branch.allData', 'Все данные центра'));

  const select = (branchId: string | null) => {
    setActiveBranch(branchId);
    setOpen(false);
    onClose?.();
  };

  return (
    <div ref={rootRef} className={`relative px-2 pb-2 ${isCollapsed ? 'lg:flex lg:justify-center lg:px-0' : ''}`}>
      {/* Single-line select: the branch name carries the meaning, so the sub-label moves
          to the title attribute rather than adding a second row of height here. */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('branch.switchBranch', 'Переключить филиал')}
        className={`group flex items-center w-full h-8 gap-2 px-2 rounded-md border border-slate-200 bg-white hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-slate-600 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${isCollapsed ? 'lg:w-8 lg:px-0 lg:justify-center' : ''}`}
        title={isCollapsed ? label : `${label} — ${subLabel}`}
      >
        <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
          {activeBranch
            ? <MapPin className="w-3 h-3" />
            : <Building2 className="w-3 h-3" />}
        </span>
        <div className={`flex items-center gap-2 flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
          <p className="flex-1 text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{label}</p>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className={`absolute z-50 overflow-hidden p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-pop ${isCollapsed ? 'lg:left-[52px] lg:-top-1 lg:w-[260px] left-2 right-2 top-full mt-1' : 'left-2 right-2 top-full mt-1'}`}
          >
            <div className="max-h-64 overflow-y-auto">
              <p className="px-2 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('branch.sectionLabel', 'Филиал')}
              </p>

              {/* «Все филиалы» — clears the scope. Records with no branch assigned are
                  only ever visible here, so it doubles as the way to find them. */}
              <button
                role="option"
                aria-selected={!activeBranchId}
                onClick={() => select(null)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  !activeBranchId
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  <Building2 className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] leading-4 truncate ${!activeBranchId ? 'text-slate-900 font-medium dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                    {t('branch.allBranches', 'Все филиалы')}
                  </p>
                  <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t('branch.allData', 'Все данные центра')}</p>
                </div>
                {!activeBranchId && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />}
              </button>

              {branches.map((b) => (
                <button
                  key={b.id}
                  role="option"
                  aria-selected={b.id === activeBranchId}
                  onClick={() => select(b.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                    b.id === activeBranchId
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {(b.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] leading-4 truncate ${b.id === activeBranchId ? 'text-slate-900 font-medium dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                      {b.name}
                    </p>
                    {b.city && (
                      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400 truncate flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />{b.city}
                      </p>
                    )}
                  </div>
                  {b.id === activeBranchId && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />}
                </button>
              ))}
            </div>

            {canManage && (
              <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                <button
                  onClick={() => go('/branches')}
                  className="w-full flex items-center gap-2 h-8 px-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                  {t('branch.manageBranches', 'Управлять филиалами')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BranchSwitcher;
