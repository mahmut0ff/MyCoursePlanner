import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiGetSubscription, apiGetBillingHistory, apiCancelSubscription, apiReactivateSubscription, apiCreatePayment } from '../../lib/api';
import toast from 'react-hot-toast';
import { Check, Crown, BookOpen, Shield, Clock, AlertTriangle, Receipt, History, Gift, RefreshCw, Zap } from 'lucide-react';

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;

  const currentPlan = subscription?.planId || 'starter';
  const isTrialing = subscription?.status === 'trial';
  const isCancelled = subscription?.status === 'cancelled';
  const isActive = subscription?.status === 'active';

  const localPlans = [
    {
      id: 'starter', name: t('landing.planBasic'), price: 1990, icon: BookOpen, userRange: t('billing.upTo5', 'До 5 учеников'),
      features: [t('landing.planBasicF1'), t('landing.planBasicF2'), t('landing.planBasicF3'), t('landing.planBasicF4')],
    },
    {
      id: 'professional', name: t('landing.planPro'), price: 4990, icon: Crown, userRange: t('billing.upTo30', '5–30 учеников'),
      features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
    },
    {
      id: 'enterprise', name: t('landing.planEnt'), price: 14900, icon: Shield, userRange: t('billing.unlimited', '30+ учеников'),
      features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
    },
  ];

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
    if (s === 'pending') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    if (s === 'failed') return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
  };

  const currentPlanData = localPlans.find(p => p.id === currentPlan);
  const lastPayment = billingHistory.payments.find(p => p.status === 'completed');

  // Status badge
  const statusBadge = () => {
    if (isGifted) return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"><Gift className="w-3.5 h-3.5" /> Подарен</span>;
    if (isActive) return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"><Check className="w-3.5 h-3.5" /> {t('billing.active', 'Активен')}</span>;
    if (isTrialing) return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"><Clock className="w-3.5 h-3.5" /> {t('billing.trial')}</span>;
    if (isCancelled) return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/40">{t('billing.cancelled')}</span>;
    if (isExpired) return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/40"><AlertTriangle className="w-3.5 h-3.5" /> {t('billing.expired', 'Истёк')}</span>;
    return null;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ╔═══════════════════════════════════════════╗ */}
      {/* ║  CURRENT PLAN SUMMARY CARD                ║ */}
      {/* ╚═══════════════════════════════════════════╝ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        {/* Top row: title + status */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('billing.currentPlan', 'Текущий план')}</h2>
          {statusBadge()}
        </div>

        {/* Info columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-5">
          {/* Plan */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('billing.plan', 'Тариф')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white capitalize">{currentPlanData?.name || currentPlan}</p>
          </div>

          {/* Monthly price */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('billing.monthly', 'В месяц')}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {isGifted ? t('billing.free', 'Бесплатно') : `${(currentPlanData?.price || 0).toLocaleString()} ₸`}
            </p>
          </div>

          {/* Next billing / Trial end */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              {isTrialing ? t('billing.trialEndsLabel', 'Конец Trial') : t('billing.nextBilling', 'След. оплата')}
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {isGifted ? '∞' :
                isTrialing && subscription?.trialEndsAt
                  ? new Date(subscription.trialEndsAt).toLocaleDateString()
                  : subscription?.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : '—'}
            </p>
          </div>

          {/* Last payment */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('billing.lastPayment', 'Посл. оплата')}</p>
            <p className={`text-lg font-bold ${lastPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              {lastPayment
                ? `${new Date(lastPayment.createdAt).toLocaleDateString()}`
                : '—'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
          {isCancelled ? (
            <button onClick={handleReactivate} className="h-9 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              {t('billing.reactivate')}
            </button>
          ) : !isGifted && !isExpired && (
            <button onClick={handleCancel} className="h-9 px-4 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              {t('billing.cancelSubscription')}
            </button>
          )}
          <button onClick={() => { loadSubscription(); loadHistory(); }} className="h-9 px-4 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />{t('billing.refresh', 'Обновить')}
          </button>
        </div>
      </div>

      {/* ─── Expired Alert ─── */}
      {isExpired && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-200">{t('billing.expiredTitle', 'Пробный период закончился')}</h3>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('billing.expiredDesc', 'Выберите тариф и оплатите для продолжения работы. Все ваши данные сохранены.')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Trial Countdown ─── */}
      {isTrialing && trialDaysLeft !== null && trialDaysLeft > 0 && (
        <div className={`rounded-2xl p-5 border ${
          trialDaysLeft <= 3 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
          : trialDaysLeft <= 7 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40'
        }`}>
          <div className="flex items-center gap-3">
            <Clock className={`w-5 h-5 ${trialDaysLeft <= 3 ? 'text-red-500' : trialDaysLeft <= 7 ? 'text-amber-500' : 'text-blue-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('billing.trialCountdown', 'Пробный период')}</p>
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
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <Gift className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">🎁 {t('billing.giftedPlan', 'Подаренный тариф')}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{t('billing.giftedDesc', 'Ваш тариф предоставлен бесплатно без ограничения по времени.')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════════╗ */}
      {/* ║  PLAN CARDS                               ║ */}
      {/* ╚═══════════════════════════════════════════╝ */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">{t('billing.yourPlan', 'Выберите тариф')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {localPlans.map((plan) => {
            const isCurrent = plan.id === currentPlan && !isExpired;
            const isUpgrade = localPlans.findIndex(p => p.id === plan.id) > localPlans.findIndex(p => p.id === currentPlan);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-5 transition-all ${
                  isCurrent
                    ? 'border-slate-900 dark:border-white bg-white dark:bg-slate-800 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
                }`}
              >
                {/* Current plan label */}
                {isCurrent && (
                  <div className="absolute -top-3 right-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    {t('billing.currentPlan', 'Текущий план')}
                  </div>
                )}

                {/* Plan header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <plan.icon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                    <p className="text-[11px] text-slate-400">{plan.userRange}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{plan.price.toLocaleString()}</span>
                  <span className="text-sm text-slate-400 ml-1">₸/{t('landing.perMonth', 'мес')}</span>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-5">
                  {plan.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Action */}
                {isCurrent ? (
                  <button disabled className="w-full h-9 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-default">
                    {t('billing.currentPlan', 'Текущий план')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleChangePlan(plan.id)}
                    disabled={changingPlan !== null}
                    className="w-full h-9 rounded-lg text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {changingPlan === plan.id ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        {isExpired ? t('billing.subscribe', 'Оплатить') : isUpgrade ? t('billing.upgrade') : t('billing.downgrade')}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ╔═══════════════════════════════════════════╗ */}
      {/* ║  BILLING HISTORY                          ║ */}
      {/* ╚═══════════════════════════════════════════╝ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('billing.history', 'История биллинга')}</h2>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" />
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
