import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Percent, Trash2, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiDeleteCompensationRule, apiSaveCompensationRule } from '../../../lib/api';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import type { CompensationRule, PayComponent } from '../../../types';
import {
  bpToPercentInput,
  componentKindLabel,
  formatMinor,
  minorToSomInput,
  percentInputToBp,
  somInputToMinor,
  type Translate,
} from '../payrollFormat';

interface Props {
  teacherId: string;
  teacherName: string;
  /** Действующая ставка или null, если её ещё нет. */
  rule: CompensationRule | null;
  /** Сколько собрано по его группам за выбранный месяц — для живого примера. */
  baseMinor: number;
  onClose: () => void;
  onSaved: () => void;
}

type RateKind = PayComponent['kind'];

/**
 * Ставка преподавателя: ОДИН вид оплаты и одно число.
 *
 * Прежний редактор спрашивал название ставки, месяц начала, месяц конца, список
 * компонентов и по галочке на каждый курс и каждую группу — восемь решений там,
 * где у директора в голове одно: «Азизе — двадцать процентов». Всё, кроме этого
 * одного, удалено:
 *
 * — НАЗВАНИЕ: ставку опознают по человеку, а не по подписи «Оклад + 20%».
 * — СРОК ДЕЙСТВИЯ: ставка действует сейчас. Прошлые месяцы защищает не дата, а
 *   замороженная ведомость, которая не пересчитывается после утверждения.
 * — ОБЛАСТЬ ДЕЙСТВИЯ: процент считается по группам, где преподаватель числится.
 *   Забытая галочка больше не может дать честный ноль.
 * — ФИЛИАЛ: ставка одна на человека. Один преподаватель ведёт группы в разных
 *   филиалах, и филиальная ставка означала лишь одно — часть его групп молча не
 *   начислялась. Где именно заработаны деньги, показывает разбивка в карточке,
 *   а не вторая ставка.
 */
const RateModal: React.FC<Props> = ({ teacherId, teacherName, rule, baseMinor, onClose, onSaved }) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;

  const existing = rule?.components?.[0];
  const [kind, setKind] = useState<RateKind>(
    existing?.kind === 'salary' ? 'salary' : 'percent_revenue',
  );
  const [percent, setPercent] = useState(
    existing?.kind === 'percent_revenue' ? bpToPercentInput(existing.percentBp) : '',
  );
  const [amount, setAmount] = useState(
    existing?.kind === 'salary' ? minorToSomInput(existing.amountMinor) : '',
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  /** Живой пример: сколько вышло бы на деньгах ВЫБРАННОГО месяца. */
  const preview = useMemo(() => {
    if (kind === 'salary') return somInputToMinor(amount);
    const bp = percentInputToBp(percent);
    if (bp === null) return null;
    // Та же арифметика, что на сервере: целый числитель, одно деление.
    return Math.round((baseMinor * bp) / 10000);
  }, [kind, amount, percent, baseMinor]);

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
    setError('');
    const { components, error: componentsError } = buildComponents();
    if (componentsError || !components) {
      setError(componentsError || '');
      return;
    }
    setSaving(true);
    try {
      await apiSaveCompensationRule({ teacherId, components });
      toast.success(t('payroll.ruleSaved', 'Ставка сохранена'));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      await apiDeleteCompensationRule(rule.id);
      toast.success(t('payroll.ruleDeleted', 'Ставка убрана'));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || t('payroll.deleteFailed', 'Не удалось убрать ставку'));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('payroll.rateTitle', 'Ставка преподавателя')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{teacherName || teacherId}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label={t('payroll.close', 'Закрыть')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
          )}

          {/* Два вида оплаты — переключателем, а не списком: выбор ровно один. */}
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
              {/* База названа буквально: «от полученных», не «от выставленных».
                  Это разные числа, и путаница здесь стоит денег. */}
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {t(
                  'payroll.percentBaseHint',
                  'Считается от денег, которые студенты его групп РЕАЛЬНО заплатили в выбранном месяце, а не от выставленных счетов. Возвраты уменьшают базу.',
                )}
              </p>
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
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {t(
                  'payroll.salaryHint',
                  'Начисляется целиком за месяц и не зависит от оплат студентов.',
                )}
              </p>
            </div>
          )}

          {/* Живой пример на деньгах выбранного месяца: процент в вакууме ничего
              не говорит, а «20% с 150 000 = 30 000» проверяется взглядом. */}
          {kind === 'percent_revenue' && preview !== null && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-300">
              {t('payroll.ratePreview', 'На деньгах этого месяца: {{percent}} от {{base}} = {{result}}', {
                percent: `${percent}%`,
                base: formatMinor(baseMinor),
                result: formatMinor(preview),
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0">
          {rule ? (
            confirmDelete ? (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-sm font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />{t('payroll.rateDeleteConfirm', 'Точно убрать?')}
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="text-sm font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />{t('payroll.rateDelete', 'Убрать ставку')}
              </button>
            )
          ) : <span />}

          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
              {t('payroll.cancel', 'Отмена')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.save', 'Сохранить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateModal;
