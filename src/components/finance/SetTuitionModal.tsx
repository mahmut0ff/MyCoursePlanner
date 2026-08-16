import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgePercent, Loader2, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiSetStudentTuition, orgGetCourses } from '../../lib/api';
import { TUITION_ALL_COURSES } from '../../lib/tuition';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';
import type { Course } from '../../types';

interface Props {
  /** Кому назначаем цену. Один id — та же форма, просто без «Выбрано: N». */
  studentIds: string[];
  /** Имя, когда студент один: подпись «кому» важнее числа. */
  studentLabel?: string;
  /** Курс зафиксирован — открыто из строки начисления или карточки студента. */
  courseId?: string;
  /** Текущая договорная цена, если она уже задана: поле открывается с ней. */
  initialAmount?: number | null;
  /** Месяц 'YYYY-MM', к неоплаченным начислениям которого можно применить сумму. */
  period: string;
  /** Человекочитаемый месяц для подписи галочки («август 2026»). */
  periodLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * «Сумма оплаты» — договорная цена студента за курс.
 *
 * Цена курса при этом никуда не девается: она остаётся прайсом (значением по
 * умолчанию и базой, от которой считается скидка). Здесь задаётся то, что
 * студент платит НА САМОМ ДЕЛЕ, и дальше все начисления — ручное «Начислить за
 * месяц», месячный крон, автосчёт при зачислении в группу — берут именно эту
 * сумму. Долг считается от неё же: он и есть «начислено минус оплачено».
 *
 * ── Почему галочка «применить к неоплаченным» включена по умолчанию ──
 * Менеджер, поставивший цену 15-го числа, ждёт увидеть её в текущем месяце. Без
 * применения он записывает 4000 и тут же видит в списке 5000 — и справедливо
 * решает, что не сохранилось. Трогаем при этом РОВНО неоплаченные начисления:
 * погашенный счёт не воскрешаем в долг задним числом, а списанный оставляем
 * списанным.
 *
 * ── Почему по умолчанию ВСЕ месяцы, а не выбранный ──
 * Долг копится по разным месяцам. Применяя цену к одному месяцу, мы оставляли
 * июньский и июльский счета по цене курса — и долг студента складывался из
 * прайса, который к нему никогда не относился. «Только за месяц» осталось
 * рядом: цена может начать действовать с сентября, а долг за июль — остаться
 * прежним. Разовая правка суммы ОДНОГО счёта живёт не здесь, а в
 * EditPlanAmountModal.
 */
const SetTuitionModal: React.FC<Props> = ({
  studentIds, studentLabel, courseId: fixedCourseId, initialAmount, period, periodLabel, onClose, onSuccess,
}) => {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState(fixedCourseId || '');
  const [amount, setAmount] = useState(
    initialAmount === null || initialAmount === undefined ? '' : String(initialAmount)
  );
  const [applyToUnpaid, setApplyToUnpaid] = useState(true);
  /** Куда применять: во все неоплаченные месяцы или только в выбранный. */
  const [applyScope, setApplyScope] = useState<'all' | 'period'>('all');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  useEffect(() => {
    orgGetCourses()
      .then((data: Course[]) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
  }, []);

  /**
   * Архивные и черновые курсы не предлагаем — по ним не продают. Уже выбранный
   * оставляем в списке всегда, иначе он молча исчез бы из select вместе с
   * привязкой (то же правило, что в CreatePaymentPlanModal).
   */
  const visibleCourses = useMemo(
    () => courses.filter(c => (c.status !== 'archived' && c.status !== 'draft') || c.id === courseId),
    [courses, courseId]
  );

  const selectedCourse = courses.find(c => c.id === courseId);
  const coursePrice = typeof selectedCourse?.price === 'number' ? selectedCourse.price : null;

  const value = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(value) && value >= 0;
  const canSubmit = !!courseId && amountValid && busy === null;
  // Снимать нечего, пока не выбран курс: сброс адресуется паре «студент × курс».
  const canClear = !!courseId && busy === null;

  const discount = amountValid && coursePrice !== null ? Math.max(0, coursePrice - value) : 0;
  const surcharge = amountValid && coursePrice !== null ? Math.max(0, value - coursePrice) : 0;

  /** Отчёт сервера человеческим языком: что применилось и что он не тронул. */
  const report = (res: any, main: string) => {
    toast.success(main);
    if (res?.updatedPlans > 0) {
      toast(t('finances.tuitionPlansUpdated', 'Обновлено начислений: {{n}}', { n: res.updatedPlans }), { icon: 'ℹ️' });
    }
    if (res?.skippedPlans > 0) {
      // Ниже уже принятых денег сумму не опускают нигде: это возврат, а не скидка.
      toast(t('finances.tuitionPlansSkipped', 'Пропущено начислений (оплачено больше новой суммы): {{n}}', { n: res.skippedPlans }), { icon: '⚠️' });
    }
    if (res?.skippedStudents > 0) {
      toast(t('finances.tuitionStudentsSkipped', 'Пропущено студентов: {{n}}', { n: res.skippedStudents }), { icon: '⚠️' });
    }
    if (res?.noCourses) {
      toast(t('finances.tuitionNoCourses', 'У выбранных студентов нет активных групп — цену ставить не за что'), { icon: '⚠️' });
    }
  };

  const submit = async (clear: boolean) => {
    setBusy(clear ? 'clear' : 'save');
    try {
      const res = await apiSetStudentTuition({
        studentIds,
        courseId,
        amount: clear ? null : value,
        applyToUnpaid: clear ? false : applyToUnpaid,
        applyScope,
        period,
      });
      report(
        res,
        clear
          ? t('finances.tuitionCleared', 'Договорная цена снята — снова по цене курса')
          : t('finances.tuitionSaved', 'Сумма оплаты сохранена')
      );
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('finances.error', 'Ошибка'));
    } finally {
      setBusy(null);
    }
  };

  const inputCls = 'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => { if (!busy) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BadgePercent className="w-5 h-5 text-emerald-600" />
              {t('finances.tuitionTitle', 'Сумма оплаты')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {studentLabel || t('finances.tuitionSelected', 'Выбрано студентов: {{n}}', { n: studentIds.length })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <p className="text-xs text-slate-500">
            {t('finances.tuitionHint', 'Столько студент платит за этот курс. Сумма сохраняется и применяется ко всем следующим начислениям — цена курса на него больше не влияет.')}
          </p>

          {!fixedCourseId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('finances.course', 'Курс')} *
              </label>
              <select value={courseId} onChange={e => setCourseId(e.target.value)} className={inputCls} disabled={busy !== null}>
                <option value="">{t('finances.selectCourse', 'Выберите курс...')}</option>
                {visibleCourses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}{typeof c.price === 'number' ? ` — ${formatMoney(c.price)}` : ''}
                  </option>
                ))}
                {/* Разворачивается сервером в курсы каждого студента: на скольких
                    курсах он учится, менеджер держать в голове не обязан. */}
                <option value={TUITION_ALL_COURSES}>{t('finances.tuitionAllCourses', 'Все курсы студента')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('finances.tuitionAmount', 'Платит за период')} ({CURRENCY_SUFFIX}) *
            </label>
            <input
              type="number" min="0" step="1" autoFocus
              value={amount} onChange={e => setAmount(e.target.value)}
              disabled={busy !== null}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
              placeholder="0"
            />
            {coursePrice !== null && discount > 0 ? (
              <p className="text-xs text-emerald-600 font-medium mt-1">
                {t('finances.discount', 'Скидка')}: {formatMoney(discount)}
                <span className="text-slate-400 font-normal"> · {t('finances.coursePrice', 'Цена курса')} {formatMoney(coursePrice)}</span>
              </p>
            ) : coursePrice !== null && surcharge > 0 ? (
              <p className="text-xs text-amber-600 font-medium mt-1">
                {t('finances.surcharge', 'Выше прайса')}: {formatMoney(surcharge)}
                <span className="text-slate-400 font-normal"> · {t('finances.coursePrice', 'Цена курса')} {formatMoney(coursePrice)}</span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                {/* Ноль — заданная цена, а не пустое поле: так живёт стипендиат. */}
                {t('finances.tuitionZeroHint', 'Ноль — тоже цена: по такому студенту начисления не выставляются.')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyToUnpaid}
                onChange={e => setApplyToUnpaid(e.target.checked)}
                disabled={busy !== null}
                className="w-4 h-4 mt-0.5 accent-emerald-500 shrink-0"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t('finances.tuitionApply', 'Применить к неоплаченным начислениям')}
                <span className="block text-[11px] text-slate-400">
                  {t('finances.tuitionApplyHint', 'Оплаченные и списанные счета не трогаем.')}
                </span>
              </span>
            </label>

            {/* Область применения. Показывается только когда есть что применять:
                при снятой галочке выбор месяца ни на что не влияет и был бы
                ложным органом управления. */}
            {applyToUnpaid && (
              <div className="ml-7 space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio" name="tuition-scope" value="all"
                    checked={applyScope === 'all'}
                    onChange={() => setApplyScope('all')}
                    disabled={busy !== null}
                    className="w-3.5 h-3.5 mt-0.5 accent-emerald-500 shrink-0"
                  />
                  <span className="text-[13px] text-slate-700 dark:text-slate-300">
                    {t('finances.tuitionScopeAll', 'За все месяцы')}
                    <span className="block text-[11px] text-slate-400">
                      {t('finances.tuitionScopeAllHint', 'Весь долг студента по этому курсу пересчитается по его сумме.')}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio" name="tuition-scope" value="period"
                    checked={applyScope === 'period'}
                    onChange={() => setApplyScope('period')}
                    disabled={busy !== null}
                    className="w-3.5 h-3.5 mt-0.5 accent-emerald-500 shrink-0"
                  />
                  <span className="text-[13px] text-slate-700 dark:text-slate-300">
                    {t('finances.tuitionScopePeriod', 'Только за {{month}}', { month: periodLabel })}
                    <span className="block text-[11px] text-slate-400">
                      {t('finances.tuitionScopePeriodHint', 'Долг за прошлые месяцы останется прежним.')}
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          {/* Сброс — это не «удалить», а «вернуть на цену курса»: обратимо и
              называется тем, что делает. */}
          <button
            onClick={() => submit(true)}
            disabled={!canClear}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-40 transition-colors"
            title={t('finances.tuitionClearHint', 'Убрать договорную цену и вернуть студента на цену курса')}
          >
            {busy === 'clear' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {t('finances.tuitionClear', 'По цене курса')}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy !== null} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              {t('finances.cancel', 'Отмена')}
            </button>
            <button
              onClick={() => submit(false)}
              disabled={!canSubmit}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all inline-flex items-center gap-2"
            >
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('finances.save', 'Сохранить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetTuitionModal;
