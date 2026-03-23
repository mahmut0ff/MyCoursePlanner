import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { vacCreateVacancy } from '../../lib/api';
import { ArrowLeft, Plus, X } from 'lucide-react';
import type { VacancyEmploymentType } from '../../types';

const STEPS = ['info', 'details', 'salary', 'photos', 'preview'] as const;
const EMP_TYPES: { value: VacancyEmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Полная занятость' }, { value: 'part_time', label: 'Частичная занятость' },
  { value: 'contract', label: 'Контракт' }, { value: 'freelance', label: 'Фриланс' },
];
const CURRENCIES = ['KGS', 'USD', 'RUB', 'EUR', 'KZT'];

const VacancyCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', requirements: '', responsibilities: '',
    subject: '', employmentType: 'full_time' as VacancyEmploymentType,
    salaryMin: '', salaryMax: '', salaryCurrency: 'KGS',
    location: { city: '', country: '', address: '', lat: 0, lng: 0, remote: false },
    workConditions: '', benefits: [] as string[], photos: [] as string[],
    contactEmail: '', contactPhone: '', status: 'published' as 'draft' | 'published',
  });
  const [newBenefit, setNewBenefit] = useState('');
  const [newPhoto, setNewPhoto] = useState('');

  const u = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));
  const uLoc = (key: string, val: any) => setForm(f => ({ ...f, location: { ...f.location, [key]: val } }));

  const addBenefit = () => { if (newBenefit.trim()) { u('benefits', [...form.benefits, newBenefit.trim()]); setNewBenefit(''); } };
  const removeBenefit = (i: number) => u('benefits', form.benefits.filter((_, idx) => idx !== i));
  const addPhoto = () => { if (newPhoto.trim()) { u('photos', [...form.photos, newPhoto.trim()]); setNewPhoto(''); } };
  const removePhoto = (i: number) => u('photos', form.photos.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
      };
      await vacCreateVacancy(payload);
      navigate('/org-vacancies');
    } catch (e: any) { setError(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  const canNext = () => {
    if (step === 0) return form.title.trim() && form.subject.trim();
    return true;
  };

  const label = (text: string) => <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">{text}</label>;
  const inputCls = "w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white";

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate('/org-vacancies')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('vacancies.create')}</h1>
      <p className="text-sm text-slate-500 mb-6">{t('vacancies.createDesc')}</p>

      {/* Steps indicator */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${i <= step ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-4">
            <div>{label(t('vacancies.vacancyTitle') + ' *')}<input value={form.title} onChange={e => u('title', e.target.value)} className={inputCls} placeholder={t('vacancies.titlePlaceholder')} autoFocus /></div>
            <div>{label(t('vacancies.subject') + ' *')}<input value={form.subject} onChange={e => u('subject', e.target.value)} className={inputCls} placeholder={t('vacancies.subjectPlaceholder')} /></div>
            <div>{label(t('vacancies.employmentType'))}
              <select value={form.employmentType} onChange={e => u('employmentType', e.target.value)} className={inputCls}>
                {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>{label(t('vacancies.description'))}<textarea value={form.description} onChange={e => u('description', e.target.value)} rows={5} className={inputCls + ' resize-none'} placeholder={t('vacancies.descriptionPlaceholder')} /></div>
          </div>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <div>{label(t('vacancies.requirements'))}<textarea value={form.requirements} onChange={e => u('requirements', e.target.value)} rows={4} className={inputCls + ' resize-none'} placeholder={t('vacancies.requirementsPlaceholder')} /></div>
            <div>{label(t('vacancies.responsibilities'))}<textarea value={form.responsibilities} onChange={e => u('responsibilities', e.target.value)} rows={4} className={inputCls + ' resize-none'} placeholder={t('vacancies.responsibilitiesPlaceholder')} /></div>
            <div>{label(t('vacancies.workConditions'))}<textarea value={form.workConditions} onChange={e => u('workConditions', e.target.value)} rows={3} className={inputCls + ' resize-none'} /></div>
            <div>
              {label(t('vacancies.benefits'))}
              <div className="flex gap-2 mb-2">
                <input value={newBenefit} onChange={e => setNewBenefit(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBenefit()} className={inputCls} placeholder={t('vacancies.addBenefit')} />
                <button onClick={addBenefit} className="bg-primary-500 text-white px-3 rounded-lg shrink-0"><Plus className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">{form.benefits.map((b, i) => (
                <span key={i} className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg flex items-center gap-1">{b}<button onClick={() => removeBenefit(i)}><X className="w-3 h-3" /></button></span>
              ))}</div>
            </div>
          </div>
        )}

        {/* Step 2: Salary & Location */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>{label(t('vacancies.salaryFrom'))}<input type="number" value={form.salaryMin} onChange={e => u('salaryMin', e.target.value)} className={inputCls} placeholder="0" /></div>
              <div>{label(t('vacancies.salaryTo'))}<input type="number" value={form.salaryMax} onChange={e => u('salaryMax', e.target.value)} className={inputCls} placeholder="∞" /></div>
              <div>{label(t('vacancies.currency'))}<select value={form.salaryCurrency} onChange={e => u('salaryCurrency', e.target.value)} className={inputCls}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>{label(t('vacancies.city'))}<input value={form.location.city} onChange={e => uLoc('city', e.target.value)} className={inputCls} /></div>
              <div>{label(t('vacancies.country'))}<input value={form.location.country} onChange={e => uLoc('country', e.target.value)} className={inputCls} /></div>
            </div>
            <div>{label(t('vacancies.address'))}<input value={form.location.address} onChange={e => uLoc('address', e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>{label('Latitude')}<input type="number" step="0.0001" value={form.location.lat || ''} onChange={e => uLoc('lat', parseFloat(e.target.value) || 0)} className={inputCls} /></div>
              <div>{label('Longitude')}<input type="number" step="0.0001" value={form.location.lng || ''} onChange={e => uLoc('lng', parseFloat(e.target.value) || 0)} className={inputCls} /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.location.remote} onChange={e => uLoc('remote', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t('vacancies.allowRemote')}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>{label(t('vacancies.contactEmail'))}<input type="email" value={form.contactEmail} onChange={e => u('contactEmail', e.target.value)} className={inputCls} /></div>
              <div>{label(t('vacancies.contactPhone'))}<input value={form.contactPhone} onChange={e => u('contactPhone', e.target.value)} className={inputCls} /></div>
            </div>
          </div>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              {label(t('vacancies.photos'))}
              <p className="text-[10px] text-slate-400 mb-2">{t('vacancies.photosDesc')}</p>
              <div className="flex gap-2 mb-3">
                <input value={newPhoto} onChange={e => setNewPhoto(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPhoto()} className={inputCls} placeholder="https://..." />
                <button onClick={addPhoto} className="bg-primary-500 text-white px-3 rounded-lg shrink-0"><Plus className="w-4 h-4" /></button>
              </div>
              {form.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.photos.map((url, i) => (
                    <div key={i} className="relative group">
                      <img src={url} alt="" className="w-full h-24 object-cover rounded-lg" />
                      <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>{label(t('vacancies.publishStatus'))}
              <select value={form.status} onChange={e => u('status', e.target.value)} className={inputCls}>
                <option value="published">{t('vacancies.publishNow')}</option>
                <option value="draft">{t('vacancies.saveDraft')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{form.title}</h3>
            <p className="text-sm text-slate-500">{form.subject} · {EMP_TYPES.find(e => e.value === form.employmentType)?.label}</p>
            {(form.salaryMin || form.salaryMax) && <p className="text-sm font-semibold text-emerald-600">{form.salaryMin && `от ${form.salaryMin}`} {form.salaryMax && `до ${form.salaryMax}`} {form.salaryCurrency}</p>}
            {form.location.city && <p className="text-sm text-slate-500">📍 {form.location.city}{form.location.country ? `, ${form.location.country}` : ''}{form.location.remote ? ' · Remote' : ''}</p>}
            {form.description && <div><p className="text-xs font-semibold text-slate-400 uppercase mb-1">{t('vacancies.description')}</p><p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{form.description}</p></div>}
            {form.requirements && <div><p className="text-xs font-semibold text-slate-400 uppercase mb-1">{t('vacancies.requirements')}</p><p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{form.requirements}</p></div>}
            {form.benefits.length > 0 && <div><p className="text-xs font-semibold text-slate-400 uppercase mb-1">{t('vacancies.benefits')}</p><ul className="text-sm text-slate-600 dark:text-slate-300 space-y-0.5">{form.benefits.map((b, i) => <li key={i}>✓ {b}</li>)}</ul></div>}
            {form.photos.length > 0 && <div className="grid grid-cols-4 gap-1">{form.photos.map((u, i) => <img key={i} src={u} alt="" className="w-full h-16 object-cover rounded" />)}</div>}
            <p className="text-xs text-slate-400">{t('vacancies.publishStatus')}: {form.status === 'published' ? '✅ ' + t('vacancies.publishNow') : '📝 ' + t('vacancies.saveDraft')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-4">
        <button onClick={() => step > 0 ? setStep(step - 1) : navigate('/org-vacancies')}
          className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{step === 0 ? t('common.cancel') : t('common.back')}</button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canNext()}
            className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">{t('common.next')}</button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5">
            <Plus className="w-4 h-4" />{saving ? '...' : t('vacancies.publish')}
          </button>
        )}
      </div>
    </div>
  );
};

export default VacancyCreatePage;
