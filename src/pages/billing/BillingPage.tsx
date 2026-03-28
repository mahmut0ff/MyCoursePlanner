import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiGetSubscription, apiGetBillingHistory, apiCancelSubscription, apiReactivateSubscription, apiCreatePayment } from '../../lib/api';
import toast from 'react-hot-toast';
import { Check, Crown, CreditCard, BookOpen, Shield, Clock, AlertTriangle, Receipt, History, Gift } from 'lucide-react';

const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  useAuth();
  const { trialDaysLeft, isExpired, isGifted } = usePlanGate();
  const [subscription, setSubscription] = useState<any>(null);
  const [billingHistory, setBillingHistory] = useState<{ payments: any[]; logs: any[] }>({ payments: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { loadSubscription(); loadHistory(); }, []);

  const loadSubscription = async () => {
    try { setSubscription(await apiGetSubscription()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await apiGetBillingHistory();
      if (data?.payments || data?.logs) {
        setBillingHistory({ payments: data.payments || [], logs: data.logs || [] });
      }
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const handleChangePlan = async (planId: string) => {
    setChangingPlan(planId);
    try {
      const kgsPrices: Record<string, number> = { starter: 1990, professional: 4990, enterprise: 14900 };
      const result = await apiCreatePayment({ planId, amount: kgsPrices[planId] || 1990 });
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setChangingPlan(null); }
  };

  const handleCancel = async () => {
    if (!confirm(t('billing.confirmCancel'))) return;
    try { await apiCancelSubscription(); await loadSubscription(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleReactivate = async () => {
    try { await apiReactivateSubscription(); await loadSubscription(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const currentPlan = subscription?.planId || 'starter';
  const isTrialing = subscription?.status === 'trial';
  const isCancelled = subscription?.status === 'cancelled';

  const localPlans = [
    {
      id: 'starter', name: t('landing.planBasic'), price: 1990, popular: false, icon: BookOpen,
      features: [t('landing.planBasicF1'), t('landing.planBasicF2'), t('landing.planBasicF3'), t('landing.planBasicF4')],
    },
    {
      id: 'professional', name: t('landing.planPro'), price: 4990, popular: true, icon: Crown,
      features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
    },
    {
      id: 'enterprise', name: t('landing.planEnt'), price: 14900, popular: false, icon: Shield,
      features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
    },
  ];

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
    if (s === 'pending') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    if (s === 'failed') return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
  };

  return (
    <div className="max-w-6xl mx-auto">
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

      {/* ─── Expired Alert ─── */}
      {isExpired && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-200">{t('billing.expiredTitle', 'Пробный период закончился')}</h3>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('billing.expiredDesc', 'Выберите тариф и оплатите для продолжения работы. Все ваши данные сохранены.')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Trial Countdown Card ─── */}
      {isTrialing && trialDaysLeft !== null && trialDaysLeft > 0 && (
        <div className={`rounded-xl p-5 mb-6 border ${
          trialDaysLeft <= 3 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
          : trialDaysLeft <= 7 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40'
        }`}>
          <div className="flex items-center gap-3">
            <Clock className={`w-5 h-5 ${trialDaysLeft <= 3 ? 'text-red-500' : trialDaysLeft <= 7 ? 'text-amber-500' : 'text-blue-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('billing.trialCountdown', 'Пробный период')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('billing.trialCountdownDesc', 'Осталось {{days}} {{dayWord}}. После этого нужно оплатить тариф.', {
                  days: trialDaysLeft,
                  dayWord: trialDaysLeft === 1 ? 'день' : trialDaysLeft < 5 ? 'дня' : 'дней'
                })}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-black ${trialDaysLeft <= 3 ? 'text-red-600' : trialDaysLeft <= 7 ? 'text-amber-600' : 'text-blue-600'}`}>{trialDaysLeft}</p>
              <p className="text-[10px] text-slate-400 uppercase">{trialDaysLeft === 1 ? 'день' : trialDaysLeft < 5 ? 'дня' : 'дней'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Gifted Plan Banner ─── */}
      {isGifted && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-3">
            <Gift className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">🎁 {t('billing.giftedPlan', 'Подаренный тариф')}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{t('billing.giftedDesc', 'Ваш тариф предоставлен бесплатно без ограничения по времени.')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current Plan Banner */}
      {subscription && !isExpired && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] text-primary-600 font-semibold uppercase tracking-wider">{t('billing.currentPlan')}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white capitalize mt-0.5">
                {localPlans.find(p => p.id === currentPlan)?.name || currentPlan}
                {isTrialing && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">{t('billing.trial')}</span>}
                {isCancelled && <span className="ml-2 text-xs font-normal text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{t('billing.cancelled')}</span>}
                {isGifted && <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">🎁 Подарен</span>}
              </p>
              {isTrialing && subscription.trialEndsAt && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('billing.trialEnds')} {new Date(subscription.trialEndsAt).toLocaleDateString()}</p>
              )}
              {subscription.currentPeriodEnd && subscription.status === 'active' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('billing.periodEnd', 'Оплачено до')}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</p>
              )}
            </div>
            <div className="flex gap-3">
              {isCancelled ? (
                <button onClick={handleReactivate} className="btn-primary text-xs !py-2 !px-4">{t('billing.reactivate')}</button>
              ) : !isGifted && (
                <button onClick={handleCancel} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1">{t('billing.cancelSubscription')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-5xl mx-auto">
        {localPlans.map((plan) => {
          const isCurrent = plan.id === currentPlan && !isExpired;
          return (
            <div key={plan.id} className={`relative rounded-3xl p-8 border transition-all hover:shadow-xl ${plan.popular ? 'bg-primary-600 border-primary-600 text-white shadow-2xl shadow-primary-500/30 md:scale-105 z-10' : 'bg-white border-slate-200 hover:shadow-slate-200/50 dark:bg-slate-800 dark:border-slate-700'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                  {t('landing.popular')}
                </div>
              )}
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${plan.popular ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  <plan.icon className={`w-6 h-6 ${plan.popular ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} />
                </div>
                <h3 className={`text-xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h3>
              </div>
              <div className="mb-8">
                <span className={`text-5xl font-extrabold tracking-tight ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.price.toLocaleString()}</span>
                <span className={`text-sm ml-2 ${plan.popular ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{t('landing.currency')}/{t('landing.perMonth')}</span>
              </div>
              <ul className="space-y-4 mb-10">
                {plan.features.map((f, i) => (
                  <li key={i} className={`flex items-start gap-3 text-sm ${plan.popular ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'}`}>
                    <Check className={`w-5 h-5 shrink-0 mt-0.5 ${plan.popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${plan.popular ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{t('billing.currentPlan')}</button>
              ) : (
                <button
                  onClick={() => handleChangePlan(plan.id)}
                  disabled={changingPlan !== null}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${plan.popular ? 'bg-white text-primary-700 hover:bg-slate-50 shadow-lg shadow-white/20' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20'}`}
                >
                  {changingPlan === plan.id ? '...' : isExpired ? t('billing.subscribe', 'Оплатить') : (localPlans.findIndex(p => p.id === plan.id) > localPlans.findIndex(p => p.id === currentPlan) ? t('billing.upgrade') : t('billing.downgrade'))}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ Billing History ═══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <History className="w-4 h-4 text-primary-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('billing.history', 'История биллинга')}</h2>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
          </div>
        ) : (
          <>
            {/* Payments table */}
            {billingHistory.payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                      <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.date', 'Дата')}</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.plan', 'Тариф')}</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.amount', 'Сумма')}</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.statusLabel', 'Статус')}</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.orderId', 'ID заказа')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {billingHistory.payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{new Date(p.createdAt).toLocaleDateString()} <span className="text-slate-400 text-[10px]">{new Date(p.createdAt).toLocaleTimeString()}</span></td>
                        <td className="px-5 py-3 capitalize font-medium text-slate-800 dark:text-slate-200">{p.planId}</td>
                        <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{Number(p.amount).toLocaleString()} {p.currency || 'KGS'}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(p.status)}`}>{p.status === 'completed' ? t('billing.paid', 'Оплачено') : p.status === 'pending' ? t('billing.pendingStatus', 'Ожидание') : t('billing.failedStatus', 'Ошибка')}</span>
                        </td>
                        <td className="px-5 py-3 text-[10px] text-slate-400 font-mono">{p.orderId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10">
                <Receipt className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">{t('billing.noHistory', 'Пока нет платежей')}</p>
              </div>
            )}

            {/* Subscription change logs */}
            {billingHistory.logs.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-700">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('billing.changelog', 'Журнал изменений')}</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {billingHistory.logs.map((log: any) => (
                    <div key={log.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${log.action === 'plan_changed' ? 'bg-blue-500' : log.action === 'plan_gifted' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-slate-700 dark:text-slate-300">
                        {log.action === 'plan_changed' ? t('billing.planChanged', 'Смена тарифа') : log.action === 'plan_gifted' ? '🎁 ' + t('billing.planGifted', 'Тариф подарен') : t('billing.subCancelled', 'Отмена подписки')}
                        {log.metadata?.newPlan && <span className="font-medium capitalize ml-1">→ {log.metadata.newPlan}</span>}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400">{log.actorName} · {new Date(log.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BillingPage;
