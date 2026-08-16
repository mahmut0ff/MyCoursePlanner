import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Percent, Sparkles, Trash2, UserPlus, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiApplyPayrollDefaultRate,
  apiGetPayrollDefaultRate,
  apiSetPayrollDefaultRate,
} from '../../../lib/api';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import type { PayComponent } from '../../../types';
import {
  bpToPercentInput,
  componentKindLabel,
  describeComponents,
  minorToSomInput,
  percentInputToBp,
  somInputToMinor,
  type Translate,
} from '../payrollFormat';

interface Props {
  /**
   * Сколько преподавателей сейчас начисляются НУЛЁМ: у кого ставки нет вовсе и у
   * кого она мёртвая (устаревший вид оплаты, который движок не считает). Число
   * знает родитель — у него список преподавателей.
   */
  /** Есть ли право менять зарплату; без него карточка только рассказывает. */
  canWrite: boolean;
  /** Раздали ставки — родителю надо перечитать экран. */
  onApplied: () => void;
}

type RateKind = PayComponent['kind'];

/**
 * «Ставка по умолчанию» — как мы обычно платим преподавателю.
 *
 * Зачем это существует: ставка не появляется сама. Заведённый человек живёт в
 * разделе строкой «Ставка не задана», в ведомости получает ноль, и обнаруживают
 * это в день выдачи зарплаты. Умолчание переворачивает порядок: оно выдаётся
 * каждому новому преподавателю в момент заведения, а не когда о нём вспомнили.
 *
 * Карточка держит ТРИ разговора и не смешивает их:
 *   1. что достанется следующему заведённому (само умолчание);
 *   2. разовая догонялка для тех, кто заведён раньше автоматики;
 *   3. мёртвые ставки прежних моделей («за занятие», «за час», «за студента») —
 *      формально ставка есть, начисления нет. Это не гипотеза: у организации
 *      таких большинство, и молчать о них нельзя — иначе экран выглядит
 *      благополучным ровно до дня выплаты.
 */
const DefaultRateCard: React.FC<Props> = ({ canWrite, onApplied }) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;

  const [rate, setRate] = useState<PayComponent[] | null>(null);
  /**
   * Скольким назначит раздача. Число приходит С СЕРВЕРА и считается тем же кодом,
   * что и сама раздача. Считать его на клиенте по списку экрана было ошибкой:
   * там есть уволенные со строками прошлых месяцев и люди без роли
   * преподавателя, поэтому кнопка обещала одно, а раздача делала другое.
   */
  const [teachersWithoutRate, setWithoutRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<RateKind>('percent_revenue');
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmLegacy, setConfirmLegacy] = useState(false);
  /**
   * Сколько мёртвых ставок нашёл сервер при последней раздаче. Держим в
   * состоянии, чтобы отказ от замены не превращался в забвение: число остаётся
   * на виду полоской, пока их действительно не заменят.
   */
  const [legacyCount, setLegacyCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const hasDefault = Boolean(rate && rate.length);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res: any = await apiGetPayrollDefaultRate();
      // null — законное «умолчание не задано», а не сбой.
      setRate(res?.default?.components ?? null);
      setWithoutRate(Number(res?.withoutRate || 0));
      setLegacyCount(Number(res?.legacyRates || 0));
    } catch (e: any) {
      setLoadError(e?.message || t('payroll.loadFailed', 'Не удалось загрузить данные'));
    } finally {
      setLoading(false);
    }
    // `t` намеренно не в зависимостях: загрузчик висит в useEffect, и смена
    // ссылки на переводчик означала бы лишний запрос ради одной строки ошибки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Форма всегда открывается на том, что задано сейчас, а не на прошлом вводе. */
  const startEdit = () => {
    const existing = rate?.[0];
    setKind(existing?.kind === 'salary' ? 'salary' : 'percent_revenue');
    setPercent(existing?.kind === 'percent_revenue' ? bpToPercentInput(existing.percentBp) : '');
    setAmount(existing?.kind === 'salary' ? minorToSomInput(existing.amountMinor) : '');
    setFormError('');
    setEditing(true);
  };

  /** Та же сборка и та же проверка, что в ставке одного человека. */
  const buildComponents = (): { components?: PayComponent[]; error?: string } => {
    if (kind === 'percent_revenue') {
      const percentBp = percentInputToBp(percent);
      if (percentBp === null) return { error: t('payroll.badPercent', 'Укажите процент от 0,01 до 100') };
      return { components: [{ kind: 'percent_revenue', percentBp, base: 'collected' }] };
    }
    const amountMinor = somInputToMinor(amount);
    if (amountMinor === null) return { error: t('payroll.badAmount', 'Укажите сумму больше нуля') };
    return { components: [{ kind: 'salary', amountMinor }] };
  };

  const handleSave = async () => {
    setFormError('');
    const { components, error } = buildComponents();
    if (error || !components) {
      setFormError(error || '');
      return;
    }
    setSaving(true);
    try {
      await apiSetPayrollDefaultRate(components);
      setRate(components);
      setEditing(false);
      toast.success(t('payroll.defaultRateSaved', 'Ставка по умолчанию сохранена'));
    } catch (e: any) {
      setFormError(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Убрать умолчание. Уже выданные ставки при этом НЕ трогаются: это отдельные
   * документы, а не ссылки на настройку. Меняется только то, что достанется
   * следующему заведённому человеку.
   */
  const handleClear = async () => {
    setBusy(true);
    try {
      await apiSetPayrollDefaultRate(null);
      setRate(null);
      setEditing(false);
      setConfirmClear(false);
      toast.success(t('payroll.defaultRateCleared', 'Умолчание убрано'));
    } catch (e: any) {
      toast.error(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const openApply = () => {
    if (!hasDefault) {
      toast.error(t('payroll.applyDefaultNoRate', 'Сначала задайте ставку по умолчанию'));
      return;
    }
    if (teachersWithoutRate <= 0) {
      toast(t('payroll.applyDefaultNobody', 'Все преподаватели уже со ставкой'));
      return;
    }
    setConfirmApply(true);
  };

  /**
   * Раздача умолчания. Два прохода, а не один, потому что мёртвая ставка — это
   * чужое решение, пусть и переставшее работать: первый вызов трогает только
   * тех, у кого ставки нет вовсе, и заодно приносит число мёртвых. Заменяем их
   * вторым вызовом и только после явного «да».
   */
  const runApply = async (replaceLegacy: boolean) => {
    setBusy(true);
    try {
      const res = await apiApplyPayrollDefaultRate(replaceLegacy ? { replaceLegacy: true } : {});
      const created = Number(res?.created || 0);
      const legacy = Number(res?.legacyRates || 0);
      setConfirmApply(false);
      setConfirmLegacy(false);
      setLegacyCount(replaceLegacy ? 0 : legacy);

      if (created > 0) {
        toast.success(t('payroll.applyDefaultDone', 'Ставка назначена: {{count}}', { count: created }));
      } else if (!(legacy > 0 && !replaceLegacy)) {
        // Молчим только в одном случае: не создано ничего, потому что все «без
        // ставки» на самом деле с мёртвой. Тост «все уже со ставкой» там был бы
        // формально верен и по сути неправдой — сразу спрашиваем про замену.
        toast(t('payroll.applyDefaultNobody', 'Все преподаватели уже со ставкой'));
      }
      if (!replaceLegacy && legacy > 0) setConfirmLegacy(true);
      // Перечитываем СВОИ числа тоже: экран обновит родитель, а «скольким ещё
      // назначить» живёт здесь и иначе осталось бы прежним до перезагрузки.
      await load();
      onApplied();
    } catch (e: any) {
      toast.error(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const legacyMessage = t(
    'payroll.applyDefaultLegacy',
    'Ещё у {{count}} преподавателей стоит устаревший вид оплаты — он не начисляется. Заменить и его.',
    { count: legacyCount },
  );

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('payroll.defaultRateTitle', 'Ставка по умолчанию')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">
            {t(
              'payroll.defaultRateHint',
              'Её получит каждый новый преподаватель в момент заведения. Уже выданные ставки не меняются.',
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-5 w-56 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-red-500">
          <span>{loadError}</span>
          <button onClick={load} className="text-sm font-medium underline shrink-0">
            {t('payroll.retry', 'Повторить')}
          </button>
        </div>
      ) : (
        <>
          {/* Умолчание словами. «Не задана» — не нейтральное состояние, а
              предупреждение: следующий заведённый человек начислится нулём. */}
          {hasDefault ? (
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {describeComponents(rate ?? [], tr)}
            </p>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t(
                'payroll.defaultRateNone',
                'Не задана — новые преподаватели заводятся без ставки и начисляются нулём.',
              )}
            </p>
          )}

          {canWrite && editing && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              {formError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{formError}</div>
              )}

              {/* Тот же выбор, что в ставке человека: два вида оплаты и одно
                  число. Умолчание не может быть богаче того, что оно выдаёт. */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('payroll.rateKindLabel', 'Как платим')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['percent_revenue', 'salary'] as RateKind[]).map(option => {
                    const active = kind === option;
                    const Icon = option === 'percent_revenue' ? Percent : Wallet;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setKind(option)}
                        aria-pressed={active}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {componentKindLabel(option, tr)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {kind === 'percent_revenue' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('payroll.percentField', 'Процент')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={percent}
                      onChange={e => setPercent(e.target.value)}
                      placeholder="20"
                      className="w-32 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('payroll.amountField', 'Сумма за месяц')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="30000"
                      className="w-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                    />
                    <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
                >
                  {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.save', 'Сохранить')}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50"
                >
                  {t('payroll.cancel', 'Отмена')}
                </button>
              </div>
            </div>
          )}

          {canWrite && !editing && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={startEdit}
                disabled={busy}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              >
                {hasDefault
                  ? t('payroll.defaultRateChange', 'Изменить')
                  : t('payroll.defaultRateSet', 'Задать')}
              </button>

              {/* Догонялка для заведённых раньше автоматики. Число на кнопке —
                  сколько человек прямо сейчас начисляются нулём. */}
              <button
                onClick={openApply}
                // `loading` в условии обязателен: пока число не приехало, оно
                // равно нулю, и клик ответил бы «все преподаватели уже со
                // ставкой» — сообщение, которое звучит как проверенный факт.
                disabled={busy || loading}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {t('payroll.applyDefault', 'Назначить всем без ставки')}
                {teachersWithoutRate > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {teachersWithoutRate}
                  </span>
                )}
              </button>

              {hasDefault && (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={busy}
                  className="text-sm font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50 flex items-center gap-1.5 px-2 py-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('payroll.defaultRateClear', 'Убрать умолчание')}
                </button>
              )}
            </div>
          )}

          {/* Мёртвые ставки, о которых сказал сервер. Полоска не исчезает после
              отказа: «ставка вроде есть, а денег не будет» обязано оставаться
              видимым, пока это правда. */}
          {legacyCount > 0 && canWrite && (
            <button
              type="button"
              onClick={() => setConfirmLegacy(true)}
              disabled={busy}
              className="w-full flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-left text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{legacyMessage}</span>
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmClear}
        busy={busy}
        title={t('payroll.defaultRateClear', 'Убрать умолчание')}
        message={t(
          'payroll.defaultRateClearConfirm',
          'Новые преподаватели снова будут заводиться без ставки и начисляться нулём. Уже выданные ставки останутся как есть.',
        )}
        onConfirm={handleClear}
        onClose={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={confirmApply}
        busy={busy}
        title={t('payroll.applyDefault', 'Назначить всем без ставки')}
        message={(
          <div className="space-y-2">
            <p>
              {t(
                'payroll.applyDefaultConfirm',
                'Ставка по умолчанию будет назначена преподавателям без ставки: {{count}}. У остальных ничего не изменится.',
                { count: teachersWithoutRate },
              )}
            </p>
            {/* Что именно раздаём — словами: раздача идёт молча по всей
                организации, и увидеть ставку надо ДО, а не в ведомости. */}
            {hasDefault && (
              <p className="text-slate-500">{describeComponents(rate ?? [], tr)}</p>
            )}
          </div>
        )}
        onConfirm={() => runApply(false)}
        onClose={() => setConfirmApply(false)}
      />

      <ConfirmDialog
        open={confirmLegacy}
        busy={busy}
        title={t('payroll.applyDefaultLegacyTitle', 'Устаревшие ставки')}
        message={legacyMessage}
        onConfirm={() => runApply(true)}
        onClose={() => setConfirmLegacy(false)}
      />
    </div>
  );
};

export default DefaultRateCard;
