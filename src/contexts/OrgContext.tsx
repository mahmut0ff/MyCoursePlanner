import { createContext, useContext } from 'react';
import type { InstitutionType } from '../types';

/**
 * Lightweight org context. Populated from the organization document that
 * AppLayout already fetches, so pages (gradebook, etc.) can read the active
 * institution type without re-fetching.
 */
export interface OrgContextValue {
  orgData: any | null;
  institutionType: InstitutionType;
  /** Re-read the org document so a saved setting (type, name, logo) shows without a reload. */
  refreshOrg: () => Promise<void>;
}

export const OrgContext = createContext<OrgContextValue>({
  orgData: null,
  institutionType: 'center',
  refreshOrg: async () => {},
});

export const useOrg = () => useContext(OrgContext);
