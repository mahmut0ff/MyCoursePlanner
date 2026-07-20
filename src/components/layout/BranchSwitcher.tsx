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
      <div className={`px-3 pt-2 pb-1 ${isCollapsed ? 'lg:flex lg:justify-center lg:px-0' : ''}`}>
        <div className={`h-9 bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse ${isCollapsed ? 'lg:w-9' : ''}`} />
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
    <div ref={rootRef} className={`relative px-3 pt-2 pb-1 ${isCollapsed ? 'lg:flex lg:justify-center lg:px-0' : ''}`}>
      {/* Single-line pill: the branch name carries the meaning, so the sub-label moves
          to the title attribute rather than adding a second row of height here. */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('branch.switchBranch', 'Переключить филиал')}
        className={`group flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/[0.08] transition w-full h-9 gap-2 px-2.5 text-left ${isCollapsed ? 'lg:w-9 lg:mx-auto lg:px-0' : ''}`}
        title={isCollapsed ? label : `${label} — ${subLabel}`}
      >
        <div className="rounded-md flex items-center justify-center shrink-0 w-6 h-6 bg-violet-500/15 dark:bg-violet-500/25">
          {activeBranch
            ? <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300" />
            : <Building2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300" />}
        </div>
        <div className={`flex items-center gap-2 flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
          <p className="flex-1 text-[13px] text-slate-900 dark:text-white truncate font-semibold">{label}</p>
          <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className={`absolute z-50 overflow-hidden bg-white dark:bg-[#151f2e] border border-slate-200 dark:border-slate-600/30 rounded-2xl shadow-2xl ${isCollapsed ? 'lg:left-[76px] lg:-top-2 lg:w-[260px] left-3 right-3 top-full mt-1' : 'left-3 right-3 top-full mt-1'}`}
          >
            <div className="py-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">
                {t('branch.sectionLabel', 'Филиал')}
              </p>

              {/* «Все филиалы» — clears the scope. Records with no branch assigned are
                  only ever visible here, so it doubles as the way to find them. */}
              <button
                role="option"
                aria-selected={!activeBranchId}
                onClick={() => select(null)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 transition"
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                  !activeBranchId
                    ? 'bg-violet-500/20 text-violet-700 ring-1 ring-violet-400/30 dark:bg-violet-500/30 dark:text-violet-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500'
                }`}>
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${!activeBranchId ? 'text-slate-900 font-semibold dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    {t('branch.allBranches', 'Все филиалы')}
                  </p>
                  <p className="text-[10px] text-slate-500">{t('branch.allData', 'Все данные центра')}</p>
                </div>
                {!activeBranchId && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
              </button>

              {branches.map((b) => (
                <button
                  key={b.id}
                  role="option"
                  aria-selected={b.id === activeBranchId}
                  onClick={() => select(b.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 transition"
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    b.id === activeBranchId
                      ? 'bg-violet-500/20 text-violet-700 ring-1 ring-violet-400/30 dark:bg-violet-500/30 dark:text-violet-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500'
                  }`}>
                    {(b.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate ${b.id === activeBranchId ? 'text-slate-900 font-semibold dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                      {b.name}
                    </p>
                    {b.city && (
                      <p className="text-[10px] text-slate-500 truncate flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />{b.city}
                      </p>
                    )}
                  </div>
                  {b.id === activeBranchId && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                </button>
              ))}
            </div>

            {canManage && (
              <div className="border-t border-slate-200 dark:border-white/5 px-1 py-1">
                <button
                  onClick={() => go('/branches')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-600 dark:text-violet-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition font-medium"
                >
                  <Settings2 className="w-3.5 h-3.5 shrink-0" />
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
