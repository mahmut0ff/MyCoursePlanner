import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { apiGetStudentRisks } from '../lib/api';
import type { StudentRiskProfile } from '../types';

/**
 * Risk profiles for the current org + selected branch, keyed by student uid.
 *
 * Risk is supporting information on screens whose main job is something else
 * (the roster, a student's card), so a failure here must never take the host
 * page down — on error the map is simply empty and no dots are drawn.
 */
export function useStudentRisks(enabled = true) {
  const { organizationId } = useAuth();
  const { activeBranchId } = useBranch();
  const [riskByStudent, setRiskByStudent] = useState<Record<string, StudentRiskProfile>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId || !enabled) {
      setRiskByStudent({});
      return;
    }

    // api.ts stamps the active branch onto this GET, so a branch switch has to
    // refetch — hence activeBranchId in the dependency list.
    let cancelled = false;
    setLoading(true);
    apiGetStudentRisks(organizationId)
      .then((rows: StudentRiskProfile[]) => {
        if (cancelled) return;
        const map: Record<string, StudentRiskProfile> = {};
        (Array.isArray(rows) ? rows : []).forEach(r => { map[r.studentId] = r; });
        setRiskByStudent(map);
      })
      .catch(() => { if (!cancelled) setRiskByStudent({}); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [organizationId, activeBranchId, enabled]);

  return { riskByStudent, loading };
}

/** Needs someone's attention — churn risk OR money owed. */
export const isFlagged = (r?: StudentRiskProfile): boolean =>
  !!r && (r.riskLevel !== 'low' || !!r.hasOverduePayment);
