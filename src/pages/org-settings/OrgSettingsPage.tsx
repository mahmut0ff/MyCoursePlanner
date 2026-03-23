import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import { Save, Building2, GraduationCap, Check, Bell, Lock, Palette, BarChart3 } from 'lucide-react';
import type { OrgSettings } from '../../types';

const OrgSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    orgGetSettings()
      .then(setSettings)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: any) => setSettings((s) => s ? { ...s, [key]: value } : s);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      await orgUpdateSettings(settings);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading || !settings) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const inputClass = "w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white";
  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800">
      <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">{icon}{title}</h3>
    </div>
  );
  const sectionCard = "bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden";
  const labelClass = "block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1";
  const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.settings')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('org.settings.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`!py-1.5 !px-3 text-xs flex items-center gap-1 rounded-lg font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'btn-primary'}`}>
          {saved ? <><Check className="w-3.5 h-3.5" />{t('org.settings.saved')}</> : saving ? '...' : <><Save className="w-3.5 h-3.5" />{t('org.settings.save')}</>}
        </button>
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

      <div className="space-y-3">
        {/* General */}
        <div className={sectionCard}>
          {sectionHeader(<Building2 className="w-3.5 h-3.5 text-primary-500" />, t('org.settings.general'))}
          <div className="p-4 space-y-3">
            <div>
              <label className={labelClass}>{t('org.settings.orgName')}</label>
              <input value={settings.name} onChange={(e) => update('name', e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('org.settings.timezone')}</label>
                <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className={inputClass}>
                  <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                  <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                  <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('org.settings.language')}</label>
                <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className={inputClass}>
                  <option value="ru">Русский</option><option value="en">English</option><option value="kg">Кыргызча</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Academic */}
        <div className={sectionCard}>
          {sectionHeader(<GraduationCap className="w-3.5 h-3.5 text-primary-500" />, t('org.settings.academic'))}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('org.settings.yearStart')}</label>
                <input type="date" value={settings.academicYearStart || ''} onChange={(e) => update('academicYearStart', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('org.settings.yearEnd')}</label>
                <input type="date" value={settings.academicYearEnd || ''} onChange={(e) => update('academicYearEnd', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('org.settings.gradingScale')}</label>
                <select value={settings.gradingScale || 'percentage'} onChange={(e) => update('gradingScale', e.target.value)} className={inputClass}>
                  <option value="percentage">{t('org.settings.scalePercentage')}</option>
                  <option value="letter">{t('org.settings.scaleLetter')}</option>
                  <option value="points">{t('org.settings.scalePoints')}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('org.settings.passingScore')}</label>
                <input type="number" min={0} max={100} value={settings.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className={sectionCard}>
          {sectionHeader(<Bell className="w-3.5 h-3.5 text-amber-500" />, t('org.settings.notifications'))}
          <div className="p-4 space-y-1">
            {toggleRow(t('org.settings.emailNotifications'), settings.emailNotifications ?? true, (v) => update('emailNotifications', v))}
            {toggleRow(t('org.settings.pushNotifications'), settings.pushNotifications ?? false, (v) => update('pushNotifications', v))}
          </div>
        </div>

        {/* Security */}
        <div className={sectionCard}>
          {sectionHeader(<Lock className="w-3.5 h-3.5 text-red-500" />, t('org.settings.security'))}
          <div className="p-4 space-y-3">
            {toggleRow(t('org.settings.requireTwoFactor'), settings.requireTwoFactor ?? false, (v) => update('requireTwoFactor', v))}
            <div>
              <label className={labelClass}>{t('org.settings.sessionTimeout')}</label>
              <select value={settings.sessionTimeoutMinutes ?? 60} onChange={(e) => update('sessionTimeoutMinutes', Number(e.target.value))} className={inputClass}>
                <option value={15}>15 {t('org.settings.minutes')}</option>
                <option value={30}>30 {t('org.settings.minutes')}</option>
                <option value={60}>60 {t('org.settings.minutes')}</option>
                <option value={120}>120 {t('org.settings.minutes')}</option>
                <option value={480}>8 {t('org.settings.hours')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className={sectionCard}>
          {sectionHeader(<Palette className="w-3.5 h-3.5 text-violet-500" />, t('org.settings.branding'))}
          <div className="p-4 space-y-3">
            <div>
              <label className={labelClass}>{t('org.settings.logoUrl')}</label>
              <input value={settings.logo || ''} onChange={(e) => update('logo', e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('org.settings.primaryColor')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer" />
                  <input value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
            <div>
              <label className={labelClass}>{t('org.settings.orgDescription')}</label>
              <textarea value={settings.description || ''} onChange={(e) => update('description', e.target.value)} className={`${inputClass} min-h-[60px]`}
                placeholder={t('org.settings.orgDescriptionPlaceholder')} />
            </div>
          </div>
        </div>

        {/* Limits & Usage */}
        <div className={sectionCard}>
          {sectionHeader(<BarChart3 className="w-3.5 h-3.5 text-emerald-500" />, t('org.settings.limits'))}
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{settings.maxStudents ?? '∞'}</p>
                <p className="text-[10px] text-slate-500 uppercase">{t('org.settings.maxStudents')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{settings.maxTeachers ?? '∞'}</p>
                <p className="text-[10px] text-slate-500 uppercase">{t('org.settings.maxTeachers')}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{settings.storageUsedMb ?? 0} MB</p>
                <p className="text-[10px] text-slate-500 uppercase">{t('org.settings.storageUsed')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgSettingsPage;
