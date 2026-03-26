import React, { useEffect, useState } from 'react';
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
}

const STORAGE_KEY = 'mycourseplanner_branch_filter';

const BranchFilter: React.FC<BranchFilterProps> = ({ allowedBranchIds, value, onChange, hideAll, compact }) => {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

        // Auto-select if only one branch
        if (filtered.length === 1 && !value) {
          onChange(filtered[0].id);
        }

        // Restore from localStorage
        if (!value && filtered.length > 1) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && filtered.some(b => b.id === stored)) {
            onChange(stored);
          }
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [allowedBranchIds?.join(',')]); // eslint-disable-line

  // Don't show if no branches or only 1 branch and hideAll is off  
  if (loading || branches.length === 0) return null;
  if (branches.length === 1 && !hideAll) return null;

  const selected = branches.find(b => b.id === value);

  const handleSelect = (branchId: string | null) => {
    onChange(branchId);
    setOpen(false);
    if (branchId) {
      localStorage.setItem(STORAGE_KEY, branchId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors`}
      >
        <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[180px]">
          {selected ? selected.name : t('branchFilter.allBranches', 'Все филиалы')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 min-w-[240px] max-h-64 overflow-y-auto">
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
        </>
      )}
    </div>
  );
};

export default BranchFilter;
