import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { apiGetSubscription } from '../lib/api';
import { PLANS, FEATURE_TO_LIMIT } from '../types';
import type { PlanId, PlanLimits, PlanFeature } from '../types';

interface PlanContextType {
  planId: PlanId;
  limits: PlanLimits;
  loading: boolean;
  canAccess: (feature: PlanFeature) => boolean;
  subscriptionStatus: string | null;
}

const DEFAULT_LIMITS = PLANS[0].limits; // starter

const PlanContext = createContext<PlanContextType>({
  planId: 'starter',
  limits: DEFAULT_LIMITS,
  loading: true,
  canAccess: () => false,
  subscriptionStatus: null,
});

export const usePlanGate = () => useContext(PlanContext);

export const PlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organizationId, isSuperAdmin, role } = useAuth();
  const [planId, setPlanId] = useState<PlanId>('starter');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSuperAdmin || !organizationId || role === 'student') {
      // Super admins see everything; students don't need gating
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sub = await apiGetSubscription();
        if (!cancelled && sub) {
          setPlanId(sub.planId || 'starter');
          setSubscriptionStatus(sub.status || null);
        }
      } catch (e) {
        console.warn('PlanContext: failed to load subscription', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId, isSuperAdmin, role]);

  const limits = useMemo(() => {
    if (isSuperAdmin) {
      // Super admins bypass all limits
      return PLANS[2].limits; // enterprise-level
    }
    const plan = PLANS.find(p => p.id === planId);
    return plan?.limits || DEFAULT_LIMITS;
  }, [planId, isSuperAdmin]);

  const canAccess = (feature: PlanFeature): boolean => {
    if (isSuperAdmin) return true;
    const key = FEATURE_TO_LIMIT[feature];
    if (!key) return true;
    return !!limits[key];
  };

  return (
    <PlanContext.Provider value={{ planId, limits, loading, canAccess, subscriptionStatus }}>
      {children}
    </PlanContext.Provider>
  );
};
