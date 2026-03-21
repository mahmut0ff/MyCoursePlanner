import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import { Save, Building2, GraduationCap, Check } from 'lucide-react';
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

      <div className="space-y-4">
        {/* General */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-primary-500" />{t('org.settings.general')}</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.orgName')}</label>
              <input value={settings.name} onChange={(e) => update('name', e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.timezone')}</label>
                <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className={inputClass}>
                  <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                  <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                  <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.language')}</label>
                <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className={inputClass}>
                  <option value="ru">Русский</option><option value="en">English</option><option value="kg">Кыргызча</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Academic */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-primary-500" />{t('org.settings.academic')}</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.yearStart')}</label>
                <input type="date" value={settings.academicYearStart || ''} onChange={(e) => update('academicYearStart', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.yearEnd')}</label>
                <input type="date" value={settings.academicYearEnd || ''} onChange={(e) => update('academicYearEnd', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.gradingScale')}</label>
                <select value={settings.gradingScale || 'percentage'} onChange={(e) => update('gradingScale', e.target.value)} className={inputClass}>
                  <option value="percentage">{t('org.settings.scalePercentage')}</option>
                  <option value="letter">{t('org.settings.scaleLetter')}</option>
                  <option value="points">{t('org.settings.scalePoints')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('org.settings.passingScore')}</label>
                <input type="number" min={0} max={100} value={settings.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} className={inputClass} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgSettingsPage;
