import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetSubscription, apiChangePlan, apiCancelSubscription, apiReactivateSubscription } from '../../lib/api';
import { PLANS } from '../../types';
import { Check, Sparkles, Crown, Zap, CreditCard } from 'lucide-react';

const BillingPage: React.FC = () => {
  useAuth(); // ensure context is available
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const sub = await apiGetSubscription();
      setSubscription(sub);
    } catch (e) {
      console.error('Failed to load subscription:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (planId: string) => {
    setChangingPlan(planId);
    try {
      await apiChangePlan(planId);
      await loadSubscription();
    } catch (e: any) {
      alert(`Failed to change plan: ${e.message}`);
    } finally {
      setChangingPlan(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) return;
    try {
      await apiCancelSubscription();
      await loadSubscription();
    } catch (e: any) {
      alert(`Failed to cancel: ${e.message}`);
    }
  };

  const handleReactivate = async () => {
    try {
      await apiReactivateSubscription();
      await loadSubscription();
    } catch (e: any) {
      alert(`Failed to reactivate: ${e.message}`);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const currentPlan = subscription?.planId || 'starter';
  const isTrialing = subscription?.status === 'trial';
  const isCancelled = subscription?.status === 'cancelled';

  const planIcons: Record<string, React.ReactNode> = {
    starter: <Zap className="w-6 h-6" />,
    professional: <Sparkles className="w-6 h-6" />,
    enterprise: <Crown className="w-6 h-6" />,
  };

  const planColors: Record<string, string> = {
    starter: 'from-blue-500 to-blue-600',
    professional: 'from-violet-500 to-purple-600',
    enterprise: 'from-amber-500 to-orange-600',
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing & Plans</h1>
          <p className="text-slate-500 text-sm">Manage your subscription</p>
        </div>
      </div>

      {/* Current Plan Banner */}
      {subscription && (
        <div className="card p-6 mb-8 bg-gradient-to-r from-primary-50 to-violet-50 border-primary-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-primary-600 font-medium">Current Plan</p>
              <p className="text-xl font-bold text-slate-900 capitalize">{currentPlan}
                {isTrialing && <span className="ml-2 text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Trial</span>}
                {isCancelled && <span className="ml-2 text-sm font-normal text-red-600 bg-red-50 px-2 py-0.5 rounded">Cancelled</span>}
              </p>
              {isTrialing && subscription.trialEndsAt && (
                <p className="text-sm text-slate-500 mt-1">Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}</p>
              )}
            </div>
            <div>
              {isCancelled ? (
                <button onClick={handleReactivate} className="btn-primary">Reactivate</button>
              ) : (
                <button onClick={handleCancel} className="text-sm text-red-500 hover:text-red-700 font-medium">Cancel subscription</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`card overflow-hidden transition-shadow ${isCurrent ? 'ring-2 ring-primary-500 shadow-lg' : 'hover:shadow-lg'}`}>
              <div className={`bg-gradient-to-r ${planColors[plan.id]} px-6 py-5 text-white`}>
                <div className="flex items-center gap-3 mb-2">{planIcons[plan.id]}<h3 className="text-lg font-bold">{plan.name}</h3></div>
                <p className="text-3xl font-bold">${plan.price}<span className="text-sm font-normal opacity-80">/month</span></p>
              </div>
              <div className="p-6">
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button disabled className="w-full py-2.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-500">Current Plan</button>
                ) : (
                  <button
                    onClick={() => handleChangePlan(plan.id)}
                    disabled={changingPlan !== null}
                    className="btn-primary w-full"
                  >
                    {changingPlan === plan.id ? 'Changing...' : (PLANS.findIndex(p => p.id === plan.id) > PLANS.findIndex(p => p.id === currentPlan) ? 'Upgrade' : 'Downgrade')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BillingPage;
