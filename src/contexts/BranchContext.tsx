import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { orgListBranches, setActiveBranchId } from '../lib/api';
import { useAuth } from './AuthContext';
import type { Branch } from '../types';

/**
 * Active-branch (филиал) scope for the whole authenticated app.
 *
 * One switcher in the sidebar owns the selection; pages read `activeBranchId` from
 * here instead of rendering their own filter. The value is pushed into
 * `src/lib/api.ts`, which stamps it onto branch-scopable GET requests — so a page
 * becomes branch-aware just by adding `activeBranchId` to its load-effect deps.
 *
 * `null` means «Все филиалы»: no filter is sent and the server applies the member's
 * own scope (`resolveBranchFilter` in netlify/functions/utils/auth.ts). Records with
 * no branchId are therefore reachable only under «Все филиалы» — picking a specific
 * branch is a strict match.
 */

/** Org-scoped, so a branch id from org A can never leak into org B. */
const STORAGE_KEY = 'mycourseplanner_active_branch';
/** Superseded by STORAGE_KEY — cleared on first load. Every BranchFilter instance
 *  wrote to it, including the ones inside create/edit modals, which meant picking a
 *  branch in a form silently re-scoped unrelated list pages. */
const LEGACY_STORAGE_KEY = 'mycourseplanner_branch_filter';

interface StoredSelection {
  orgId: string;
  branchId: string;
}

function readStored(orgId: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredSelection = JSON.parse(raw);
    return parsed?.orgId === orgId ? parsed.branchId || null : null;
  } catch {
    return null;
  }
}

function writeStored(orgId: string, branchId: string | null) {
  try {
    if (branchId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ orgId, branchId }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode / quota — the selection just won't persist */
  }
}

export interface BranchContextValue {
  /** Active branches this member may switch between. */
  branches: Branch[];
  /** `null` = «Все филиалы». */
  activeBranchId: string | null;
  setActiveBranch: (branchId: string | null) => void;
  /** Resolved Branch for `activeBranchId`, if any. */
  activeBranch: Branch | null;
  loading: boolean;
  /** More than one branch available — i.e. switching is meaningful. */
  canSwitch: boolean;
  /** Re-fetch after a branch is created/renamed/archived on /branches. */
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  activeBranchId: null,
  setActiveBranch: () => {},
  activeBranch: null,
  loading: true,
  canSwitch: false,
  refreshBranches: async () => {},
});

export const useBranch = () => useContext(BranchContext);

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organizationId, isSuperAdmin, primaryBranchId, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Mirror into the api client during render, so a request fired in the same tick
  // as a switch already carries the new scope.
  setActiveBranchId(activeBranchId);

  const applySelection = useCallback((orgId: string, branchId: string | null) => {
    setActiveBranchIdState(branchId);
    setActiveBranchId(branchId);
    writeStored(orgId, branchId);
  }, []);

  const load = useCallback(async () => {
    if (isSuperAdmin || !organizationId || organizationId === 'personal') {
      setBranches([]);
      setActiveBranchIdState(null);
      setActiveBranchId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await orgListBranches();
      const list: Branch[] = (Array.isArray(data) ? data : []).filter((b: Branch) => b.isActive !== false);
      setBranches(list);

      // Seed the selection, validating every candidate against what the server
      // actually returned — a revoked assignment must never reach the API and
      // trigger a scope violation.
      const stored = readStored(organizationId);
      let next: string | null = null;
      if (stored && list.some(b => b.id === stored)) {
        next = stored;
      } else if (primaryBranchId && list.some(b => b.id === primaryBranchId)) {
        next = primaryBranchId;
      } else if (list.length === 1) {
        next = list[0].id;
      }
      applySelection(organizationId, next);
    } catch {
      // No access to the branch list (or none configured) — fall back to org-wide.
      setBranches([]);
      setActiveBranchIdState(null);
      setActiveBranchId(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isSuperAdmin, primaryBranchId, applySelection]);

  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const setActiveBranch = useCallback((branchId: string | null) => {
    if (!organizationId) return;
    applySelection(organizationId, branchId);
  }, [organizationId, applySelection]);

  const value = useMemo<BranchContextValue>(() => ({
    branches,
    activeBranchId,
    setActiveBranch,
    activeBranch: branches.find(b => b.id === activeBranchId) || null,
    loading,
    canSwitch: branches.length > 1,
    refreshBranches: load,
  }), [branches, activeBranchId, setActiveBranch, loading, load]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};
