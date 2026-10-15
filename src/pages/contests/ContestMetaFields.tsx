import React from 'react';
import { useTranslation } from 'react-i18next';
import { CONTEST_KIND_LABELS, JUDGING_MODE_LABELS, type ContestKind, type JudgingMode } from '../../lib/contests';
import type { MetaForm } from './contestForm';
import { Field, Label } from './ui';
import { inputCls } from './uiStyles';

/** Поля «паспорта» конкурса — общие для создания и вкладки «Обзор». */
const ContestMetaFields: React.FC<{ form: MetaForm; setForm: React.Dispatch<React.SetStateAction<MetaForm>>; disabled?: boolean }> = ({ form, setForm, disabled }) => {
  const { t } = useTranslation();
  const set = (k: keyof MetaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field label={t('contests.title', 'Название')}>
        <input autoFocus value={form.title} onChange={set('title')} placeholder="Келечек инженерлери — 2026" className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('contests.kind', 'Тип')}>
          <select value={form.kind} onChange={set('kind')} className={inputCls}>
            {(Object.keys(CONTEST_KIND_LABELS) as ContestKind[]).map((k) => <option key={k} value={k}>{CONTEST_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label={t('contests.season', 'Сезон / год')}>
          <input value={form.season} onChange={set('season')} className={inputCls} />
        </Field>
      </div>
      <Field label={t('contests.theme', 'Тема')}>
        <input value={form.theme} onChange={set('theme')} placeholder={t('contests.themePh', 'напр. Инженерные и робототехнические проекты')} className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('contests.date', 'Дата проведения')}>
          <input type="date" value={form.eventDate} onChange={set('eventDate')} className={inputCls} />
        </Field>
        <Field label={t('contests.prizeFund', 'Призовой фонд')}>
          <input type="number" min={0} inputMode="numeric" value={form.prizeFund} onChange={set('prizeFund')} className={inputCls} />
        </Field>
      </div>
      <Field label={t('contests.venue', 'Место проведения')}>
        <input value={form.venue} onChange={set('venue')} className={inputCls} />
      </Field>
      <Field label={t('contests.description', 'Описание')}>
        <textarea rows={3} value={form.description} onChange={set('description')} className={inputCls} />
      </Field>
      <div>
        <Label>{t('contests.judgingMode', 'Как работает жюри')}</Label>
        <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(JUDGING_MODE_LABELS) as JudgingMode[]).map((m) => {
            const on = form.judgingMode === m;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} disabled={disabled}
                onClick={() => setForm((f) => ({ ...f, judgingMode: m }))}
                className={`text-left rounded-2xl border px-4 py-3 transition-colors ${on ? 'border-slate-900 dark:border-white bg-slate-900/[0.03] dark:bg-white/[0.06]' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'} disabled:opacity-60`}>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{JUDGING_MODE_LABELS[m].title}</span>
                <span className="block text-[12px] text-slate-500 dark:text-slate-500 dark:text-slate-400 mt-0.5">{JUDGING_MODE_LABELS[m].hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
};

export default ContestMetaFields;
