import React from 'react';
import { useTranslation } from 'react-i18next';
import { CONTEST_KIND_LABELS, type ContestKind } from '../../lib/contests';
import type { MetaForm } from './contestForm';
import { Field } from './ui';
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
    </fieldset>
  );
};

export default ContestMetaFields;
