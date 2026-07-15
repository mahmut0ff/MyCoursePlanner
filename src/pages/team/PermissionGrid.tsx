import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  RESOURCE_GROUPS, RBAC_ACTIONS, ACTION_LABELS,
  type RbacAction, type ResourceDef,
} from '../../lib/rbac';

export const ACTION_COLORS: Record<RbacAction, string> = {
  read: 'text-emerald-600 dark:text-emerald-400',
  write: 'text-blue-600 dark:text-blue-400',
  delete: 'text-red-500',
};

/**
 * Reusable resource × action permission matrix.
 * Used by the role editor (RoleMatrix) and the per-member override editor (MembersTab).
 * When `baselineHas` is supplied, cells that differ from the member's role baseline are
 * flagged with an amber ring so it's obvious what an override actually changes.
 */
const PermissionGrid: React.FC<{
  hasPerm: (r: string, a: RbacAction) => boolean;
  togglePerm: (r: string, a: RbacAction) => void;
  toggleAll: (r: string, allowed: RbacAction[]) => void;
  viewOnly: boolean;
  openHelp: string | null;
  setOpenHelp: (v: string | null) => void;
  collapsed: Record<string, boolean>;
  setCollapsed: (v: Record<string, boolean>) => void;
  /** Optional: the role baseline, to highlight cells changed by an override. */
  baselineHas?: (r: string, a: RbacAction) => boolean;
}> = ({ hasPerm, togglePerm, toggleAll, viewOnly, openHelp, setOpenHelp, collapsed, setCollapsed, baselineHas }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Column header */}
      <div className="grid grid-cols-[1fr_repeat(3,52px)_44px_28px] items-center gap-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
        <span>{t('team.resource', 'Раздел')}</span>
        {RBAC_ACTIONS.map(a => <span key={a} className="text-center">{ACTION_LABELS[a]}</span>)}
        <span className="text-center">{t('team.all', 'Все')}</span>
        <span />
      </div>

      {RESOURCE_GROUPS.map(group => {
        const isCollapsed = collapsed[group.group];
        return (
          <div key={group.group}>
            <button
              type="button"
              onClick={() => setCollapsed({ ...collapsed, [group.group]: !isCollapsed })}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {group.group}
            </button>
            {!isCollapsed && group.resources.map((res: ResourceDef) => {
              const allowed = (res.actions ?? RBAC_ACTIONS);
              const allOn = allowed.every(a => hasPerm(res.id, a));
              return (
                <div key={res.id} className="relative grid grid-cols-[1fr_repeat(3,52px)_44px_28px] items-center gap-1 px-3 py-2 border-t border-slate-100 dark:border-slate-700/50">
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 pl-4 truncate">{res.label}</span>
                  {RBAC_ACTIONS.map(a => (
                    <div key={a} className="flex justify-center">
                      {allowed.includes(a) ? (
                        <input
                          type="checkbox"
                          checked={hasPerm(res.id, a)}
                          disabled={viewOnly}
                          onChange={() => togglePerm(res.id, a)}
                          className={`w-4 h-4 rounded accent-primary-600 cursor-pointer disabled:cursor-default ${
                            baselineHas && baselineHas(res.id, a) !== hasPerm(res.id, a)
                              ? 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-slate-900'
                              : ''
                          }`}
                        />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={allOn}
                      disabled={viewOnly}
                      onChange={() => toggleAll(res.id, allowed)}
                      className="w-4 h-4 rounded accent-primary-600 cursor-pointer disabled:cursor-default"
                    />
                  </div>
                  {/* Help */}
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setOpenHelp(openHelp === res.id ? null : res.id)}
                      className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 text-[10px] font-bold text-slate-400 hover:text-primary-500 hover:border-primary-400 transition-colors"
                    >?</button>
                  </div>
                  {openHelp === res.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenHelp(null)} />
                      <div className="absolute right-2 top-9 z-20 w-64 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{res.label}</span>
                          <button onClick={() => setOpenHelp(null)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
                        </div>
                        <div className="space-y-1.5">
                          <p><span className={`font-semibold ${ACTION_COLORS.read}`}>{ACTION_LABELS.read}:</span> <span className="text-slate-500">{res.help.read}</span></p>
                          {res.help.write && res.help.write !== '—' && <p><span className={`font-semibold ${ACTION_COLORS.write}`}>{ACTION_LABELS.write}:</span> <span className="text-slate-500">{res.help.write}</span></p>}
                          {res.help.delete && res.help.delete !== '—' && <p><span className={`font-semibold ${ACTION_COLORS.delete}`}>{ACTION_LABELS.delete}:</span> <span className="text-slate-500">{res.help.delete}</span></p>}
                          {res.help.notes && <p className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-700 text-amber-600 dark:text-amber-400 italic">💡 {res.help.notes}</p>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default PermissionGrid;
