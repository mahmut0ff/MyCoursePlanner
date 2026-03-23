import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetSubscription, apiChangePlan, apiCancelSubscription, apiReactivateSubscription } from '../../lib/api';
import { PLANS } from '../../types';
import { Check, Sparkles, Crown, Zap, CreditCard, Star } from 'lucide-react';

const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  useAuth();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);

  useEffect(() => { loadSubscription(); }, []);

  const loadSubscription = async () => {
    try { setSubscription(await apiGetSubscription()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleChangePlan = async (planId: string) => {
    setChangingPlan(planId);
    try { await apiChangePlan(planId); await loadSubscription(); }
    catch (e: any) { alert(e.message); }
    finally { setChangingPlan(null); }
  };

  const handleCancel = async () => {
    if (!confirm(t('billing.confirmCancel'))) return;
    try { await apiCancelSubscription(); await loadSubscription(); }
    catch (e: any) { alert(e.message); }
  };

  const handleReactivate = async () => {
    try { await apiReactivateSubscription(); await loadSubscription(); }
    catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const currentPlan = subscription?.planId || 'starter';
  const isTrialing = subscription?.status === 'trial';
  const isCancelled = subscription?.status === 'cancelled';

  const planMeta: Record<string, { icon: React.ReactNode; accent: string; bg: string; badge?: string }> = {
    starter: { icon: <Zap className="w-5 h-5" />, accent: 'border-l-blue-500', bg: 'bg-blue-600' },
    professional: { icon: <Sparkles className="w-5 h-5" />, accent: 'border-l-violet-500', bg: 'bg-violet-600', badge: t('billing.recommended') },
    enterprise: { icon: <Crown className="w-5 h-5" />, accent: 'border-l-amber-500', bg: 'bg-amber-600' },
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('billing.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('billing.subtitle')}</p>
        </div>
      </div>

      {/* Current Plan Banner */}
      {subscription && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] text-primary-600 font-semibold uppercase tracking-wider">{t('billing.currentPlan')}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white capitalize mt-0.5">
                {currentPlan}
                {isTrialing && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">{t('billing.trial')}</span>}
                {isCancelled && <span className="ml-2 text-xs font-normal text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{t('billing.cancelled')}</span>}
              </p>
              {isTrialing && subscription.trialEndsAt && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('billing.trialEnds')} {new Date(subscription.trialEndsAt).toLocaleDateString()}</p>
              )}
            </div>
            <div>
              {isCancelled ? (
                <button onClick={handleReactivate} className="btn-primary text-xs !py-1.5 !px-3">{t('billing.reactivate')}</button>
              ) : (
                <button onClick={handleCancel} className="text-xs text-red-500 hover:text-red-700 font-medium">{t('billing.cancelSubscription')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const meta = planMeta[plan.id];
          const isRecommended = !!meta.badge;
          return (
            <div key={plan.id}
              className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-all border-l-4 ${meta.accent} ${
                isCurrent ? 'ring-2 ring-primary-500 shadow-lg' : isRecommended ? 'shadow-md scale-[1.02]' : 'hover:shadow-md'
              }`}
            >
              {/* Header */}
              <div className={`${meta.bg} px-5 py-4 text-white relative`}>
                {meta.badge && (
                  <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-sm text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" />{meta.badge}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">{meta.icon}<h3 className="text-sm font-bold">{plan.name}</h3></div>
                <p className="text-3xl font-extrabold">${plan.price}<span className="text-xs font-normal opacity-60 ml-1">/{t('billing.month')}</span></p>
              </div>

              {/* Features */}
              <div className="p-5">
                <ul className="space-y-2.5 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button disabled className="w-full py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{t('billing.currentPlan')}</button>
                ) : (
                  <button
                    onClick={() => handleChangePlan(plan.id)}
                    disabled={changingPlan !== null}
                    className="btn-primary w-full text-xs !py-2"
                  >
                    {changingPlan === plan.id ? '...' : (PLANS.findIndex(p => p.id === plan.id) > PLANS.findIndex(p => p.id === currentPlan) ? t('billing.upgrade') : t('billing.downgrade'))}
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
