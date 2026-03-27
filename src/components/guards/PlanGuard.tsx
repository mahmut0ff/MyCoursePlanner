import React from 'react';
import { usePlanGate } from '../../contexts/PlanContext';
import UpgradeWall from '../ui/UpgradeWall';
import type { PlanFeature } from '../../types';

interface PlanGuardProps {
  feature: PlanFeature;
  children: React.ReactNode;
  /** Optional custom title for the upgrade wall */
  title?: string;
}

/**
 * Route-level guard: renders children if org has access to the feature,
 * otherwise shows UpgradeWall.
 */
const PlanGuard: React.FC<PlanGuardProps> = ({ feature, children, title }) => {
  const { canAccess, loading } = usePlanGate();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  if (!canAccess(feature)) {
    return <UpgradeWall feature={feature} title={title} />;
  }

  return <>{children}</>;
};

export default PlanGuard;
