import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GitBranch, ChevronDown, Check,  MapPin } from 'lucide-react';
import { orgListBranches } from '../../lib/api';

interface BranchItem {
  id: string;
  name: string;
  city?: string;
  isActive?: boolean;
}

interface BranchFilterProps {
  /** Restrict to these branch IDs (e.g. manager's assigned branches) */
  allowedBranchIds?: string[];
  /** Current selected value */
  value: string | null;
  /** Called when user selects a branch (null = all) */
  onChange: (branchId: string | null) => void;
  /** Hide the "All" option */
  hideAll?: boolean;
  /** Compact mode for tight layouts */
  compact?: boolean;
  /** 
   * Render mode:
   * - 'dropdown' (default): custom popover dropdown, best for toolbars/headers
   * - 'select': native <select> element, safe inside modals & forms (no overflow issues)
   */
  mode?: 'dropdown' | 'select';
}

const BranchFilter: React.FC<BranchFilterProps> = ({ allowedBranchIds, value, onChange, hideAll, compact, mode = 'dropdown' }) => {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    orgListBranches()
      .then((data: any) => {
        const list = (Array.isArray(data) ? data : []).filter((b: any) => b.isActive !== false);
        // Filter to allowed branches if specified
        const filtered = allowedBranchIds
          ? list.filter((b: any) => allowedBranchIds.includes(b.id))
          : list;
        setBranches(filtered);

        // Auto-select if only one branch — a create form should not make the user
        // pick the only option there is.
        if (filtered.length === 1 && !value) {
          onChange(filtered[0].id);
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [allowedBranchIds?.join(',')]); // eslint-disable-line

  // Position the portal popover directly under the trigger button, in viewport
  // coordinates. Rendering the menu in a portal + `position: fixed` means it can
  // never be clipped by an ancestor's `overflow` (e.g. a horizontally-scrolling
  // filter bar) or trapped in a lower stacking context.
  const reposition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Keep the 240px-wide menu inside the viewport horizontally.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 248));
    setCoords({ top: r.bottom + 4, left });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // capture:true so scrolling inside any ancestor container repositions the menu too
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line

  // Don't show if no branches or only 1 branch and hideAll is off
  if (loading || branches.length === 0) return null;
  if (branches.length === 1 && !hideAll) return null;

  const selected = branches.find(b => b.id === value);

  const handleSelect = (branchId: string | null) => {
    onChange(branchId);
    setOpen(false);
  };

  // ─── Native <select> mode — safe inside modals/forms ───
  if (mode === 'select') {
    return (
      <div className="relative w-full">
        <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-500 pointer-events-none z-10" />
        <select
          value={value || ''}
          onChange={(e) => handleSelect(e.target.value || null)}
          className="appearance-none w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none transition-all cursor-pointer"
        >
          {!hideAll && (
            <option value="">{t('branchFilter.allBranches', 'Все филиалы')}</option>
          )}
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}{b.city ? ` (${b.city})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  // ─── Custom dropdown mode — for toolbars/headers ───
  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        onClick={() => { if (open) { setOpen(false); } else { reposition(); setOpen(true); } }}
        className={`flex items-center gap-2 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors`}
      >
        <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[180px]">
          {selected ? selected.name : t('branchFilter.allBranches', 'Все филиалы')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
          <div
            style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
            className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-[60] py-1 min-w-[240px] max-h-64 overflow-y-auto"
          >
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t('branchFilter.selectBranch', 'Выберите филиал')}
            </p>

            {/* "All branches" option */}
            {!hideAll && (
              <button
                onClick={() => handleSelect(null)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition"
              >
                <GitBranch className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                  {t('branchFilter.allBranches', 'Все филиалы')}
                </span>
                {!value && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              </button>
            )}

            {/* Branch list */}
            {branches.map(b => (
              <button
                key={b.id}
                onClick={() => handleSelect(b.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition"
              >
                <GitBranch className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-700 dark:text-slate-300 block truncate">{b.name}</span>
                  {b.city && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" /> {b.city}
                    </span>
                  )}
                </div>
                {b.id === value && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default BranchFilter;
