import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
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
  /** Days remaining in trial, null if not trialing */
  trialDaysLeft: number | null;
  /** True if trial/subscription has expired and user must pay */
  isExpired: boolean;
  /** True if subscription is in gifted state (permanent) */
  isGifted: boolean;
  /** Trial end date ISO string */
  trialEndsAt: string | null;
}

const DEFAULT_LIMITS = PLANS[0].limits; // starter

const PlanContext = createContext<PlanContextType>({
  planId: 'starter',
  limits: DEFAULT_LIMITS,
  loading: true,
  canAccess: () => false,
  subscriptionStatus: null,
  trialDaysLeft: null,
  isExpired: false,
  isGifted: false,
  trialEndsAt: null,
});

export const usePlanGate = () => useContext(PlanContext);

export const PlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organizationId, isSuperAdmin, role } = useAuth();
  const [planId, setPlanId] = useState<PlanId>('starter');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (isSuperAdmin || !organizationId || role === 'student') {
      setLoading(false);
      return;
    }
    try {
      const sub = await apiGetSubscription();
      if (sub) {
        setPlanId(sub.planId || 'starter');
        setSubscriptionStatus(sub.status || null);
        setTrialEndsAt(sub.trialEndsAt || null);
      }
    } catch (e) {
      console.warn('PlanContext: failed to load subscription', e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isSuperAdmin, role]);

  // Initial fetch
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Re-fetch when user returns to the tab (e.g. after admin gifts a plan)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && organizationId) {
        fetchSubscription();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchSubscription, organizationId]);

  const isGifted = subscriptionStatus === 'gifted';

  // Calculate trial days left
  const trialDaysLeft = useMemo(() => {
    if (subscriptionStatus !== 'trial' || !trialEndsAt) return null;
    const end = new Date(trialEndsAt);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [subscriptionStatus, trialEndsAt]);

  // Determine if expired
  const isExpired = useMemo(() => {
    if (isSuperAdmin || isGifted) return false;
    if (!subscriptionStatus) return false;
    // Status-based: backend sets 'expired' when balance depletes
    if (subscriptionStatus === 'cancelled' || subscriptionStatus === 'suspended' || subscriptionStatus === 'expired') return true;
    // Trial ended
    if (subscriptionStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0) return true;
    return false;
  }, [subscriptionStatus, trialDaysLeft, isSuperAdmin, isGifted]);

  const limits = useMemo(() => {
    if (isSuperAdmin) return PLANS[2].limits;
    // During active trial — full plan access
    if (subscriptionStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft > 0) {
      const plan = PLANS.find(p => p.id === planId);
      return plan?.limits || DEFAULT_LIMITS;
    }
    if (isExpired) return DEFAULT_LIMITS; // lock everything down
    const plan = PLANS.find(p => p.id === planId);
    return plan?.limits || DEFAULT_LIMITS;
  }, [planId, isSuperAdmin, subscriptionStatus, trialDaysLeft, isExpired]);

  const canAccess = (feature: PlanFeature): boolean => {
    if (isSuperAdmin) return true;
    if (isExpired) return false;
    const key = FEATURE_TO_LIMIT[feature];
    if (!key) return true;
    return !!limits[key];
  };

  return (
    <PlanContext.Provider value={{ planId, limits, loading, canAccess, subscriptionStatus, trialDaysLeft, isExpired, isGifted, trialEndsAt }}>
      {children}
    </PlanContext.Provider>
  );
};
