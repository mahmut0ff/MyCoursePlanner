import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import { Settings, Save, Building2 } from 'lucide-react';
import type { OrgSettings } from '../../types';

const OrgSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    orgGetSettings().then((s) => setSettings(s)).finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: any) => setSettings((s) => s ? { ...s, [key]: value } : s);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await orgUpdateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  if (loading || !settings) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.settings')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.settings.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
          <Save className="w-4 h-4" />{saved ? t('org.settings.saved') : saving ? '...' : t('org.settings.save')}
        </button>
      </div>

      <div className="space-y-6">
        {/* General */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-primary-500" />{t('org.settings.general')}</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgName')}</label>
              <input value={settings.name} onChange={(e) => update('name', e.target.value)} className="input text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.timezone')}</label>
                <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="input text-sm">
                  <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                  <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                  <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.language')}</label>
                <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className="input text-sm">
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="kg">Кыргызча</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Academic */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Settings className="w-4 h-4 text-primary-500" />{t('org.settings.academic')}</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearStart')}</label>
                <input type="date" value={settings.academicYearStart || ''} onChange={(e) => update('academicYearStart', e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearEnd')}</label>
                <input type="date" value={settings.academicYearEnd || ''} onChange={(e) => update('academicYearEnd', e.target.value)} className="input text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.gradingScale')}</label>
                <select value={settings.gradingScale || 'percentage'} onChange={(e) => update('gradingScale', e.target.value)} className="input text-sm">
                  <option value="percentage">{t('org.settings.scalePercentage')}</option>
                  <option value="letter">{t('org.settings.scaleLetter')}</option>
                  <option value="points">{t('org.settings.scalePoints')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.passingScore')}</label>
                <input type="number" min={0} max={100} value={settings.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} className="input text-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgSettingsPage;
