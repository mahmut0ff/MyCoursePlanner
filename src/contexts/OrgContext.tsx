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
}

export const OrgContext = createContext<OrgContextValue>({
  orgData: null,
  institutionType: 'center',
});

export const useOrg = () => useContext(OrgContext);
