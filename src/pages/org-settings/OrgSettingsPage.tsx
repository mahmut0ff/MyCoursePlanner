import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import {
  Save, Building2, GraduationCap, Check, Bell, Lock, Palette, BarChart3,
} from 'lucide-react';
import type { OrgSettings } from '../../types';

type Tab = 'general' | 'academic' | 'notifications' | 'security' | 'branding' | 'limits';

const TABS: { id: Tab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'general', icon: Building2, labelKey: 'org.settings.general' },
  { id: 'academic', icon: GraduationCap, labelKey: 'org.settings.academic' },
  { id: 'notifications', icon: Bell, labelKey: 'org.settings.notifications' },
  { id: 'security', icon: Lock, labelKey: 'org.settings.security' },
  { id: 'branding', icon: Palette, labelKey: 'org.settings.branding' },
  { id: 'limits', icon: BarChart3, labelKey: 'org.settings.limits' },
];

/* ════════════════════════════════════ GENERAL ════════════════════════════════════ */
const GeneralTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.general')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgName')}</label>
            <input value={settings.name} onChange={(e) => update('name', e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.timezone')}</label>
              <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="input">
                <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.language')}</label>
              <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className="input">
                <option value="ru">🇷🇺 Русский</option>
                <option value="en">🇬🇧 English</option>
                <option value="kg">🇰🇬 Кыргызча</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ ACADEMIC ════════════════════════════════════ */
const AcademicTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.academic')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearStart')}</label>
              <input type="date" value={settings.academicYearStart || ''} onChange={(e) => update('academicYearStart', e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearEnd')}</label>
              <input type="date" value={settings.academicYearEnd || ''} onChange={(e) => update('academicYearEnd', e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.gradingScale')}</label>
              <select value={settings.gradingScale || 'percentage'} onChange={(e) => update('gradingScale', e.target.value)} className="input">
                <option value="percentage">{t('org.settings.scalePercentage')}</option>
                <option value="letter">{t('org.settings.scaleLetter')}</option>
                <option value="points">{t('org.settings.scalePoints')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.passingScore')}</label>
              <input type="number" min={0} max={100} value={settings.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} className="input" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ NOTIFICATIONS ════════════════════════════════════ */
const NotificationsTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  const notifs = [
    { key: 'emailNotifications', label: t('org.settings.emailNotifications'), desc: t('org.settings.emailNotificationsDesc') },
    { key: 'pushNotifications', label: t('org.settings.pushNotifications'), desc: t('org.settings.pushNotificationsDesc') },
  ];
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('org.settings.notifications')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('org.settings.notificationsDesc')}</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {notifs.map((n) => (
            <div key={n.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{n.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{n.desc}</p>
              </div>
              <button
                onClick={() => update(n.key, !(settings as any)[n.key])}
                className={`relative w-11 h-6 rounded-full transition-colors ${(settings as any)[n.key] ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(settings as any)[n.key] ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ SECURITY ════════════════════════════════════ */
const SecurityTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.security')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.sessionTimeout')}</label>
            <div className="flex items-center gap-2">
              <select value={settings.sessionTimeoutMinutes ?? 60} onChange={(e) => update('sessionTimeoutMinutes', Number(e.target.value))} className="input">
                <option value={15}>15 {t('org.settings.minutes')}</option>
                <option value={30}>30 {t('org.settings.minutes')}</option>
                <option value={60}>60 {t('org.settings.minutes')}</option>
                <option value={120}>120 {t('org.settings.minutes')}</option>
                <option value={480}>8 {t('org.settings.hours')}</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{t('org.settings.requireTwoFactor')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.settings.requireTwoFactorDesc')}</p>
              </div>
              <button
                onClick={() => update('requireTwoFactor', !settings.requireTwoFactor)}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.requireTwoFactor ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.requireTwoFactor ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ BRANDING ════════════════════════════════════ */
const BrandingTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.branding')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.logoUrl')}</label>
            <input value={settings.logo || ''} onChange={(e) => update('logo', e.target.value)} className="input" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.primaryColor')}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              <input type="text" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="input text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgDescription')}</label>
            <textarea value={settings.description || ''} onChange={(e) => update('description', e.target.value)} className="input min-h-[80px]"
              placeholder={t('org.settings.orgDescriptionPlaceholder')} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ LIMITS ════════════════════════════════════ */
const LimitsTab: React.FC<{ settings: OrgSettings }> = ({ settings }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.limits')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.limitsDesc')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{settings.maxStudents ?? '∞'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.maxStudents')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{settings.maxTeachers ?? '∞'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.maxTeachers')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{settings.storageUsedMb ?? 0} MB</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.storageUsed')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ MAIN PAGE ════════════════════════════════════ */
const OrgSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');

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

  const renderTab = () => {
    switch (activeTab) {
      case 'general': return <GeneralTab settings={settings} update={update} />;
      case 'academic': return <AcademicTab settings={settings} update={update} />;
      case 'notifications': return <NotificationsTab settings={settings} update={update} />;
      case 'security': return <SecurityTab settings={settings} update={update} />;
      case 'branding': return <BrandingTab settings={settings} update={update} />;
      case 'limits': return <LimitsTab settings={settings} />;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.settings')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('org.settings.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'btn-primary'}`}>
          {saved ? <><Check className="w-4 h-4" />{t('org.settings.saved')}</> : saving ? '...' : <><Save className="w-4 h-4" />{t('org.settings.save')}</>}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Tabbed layout like AdminSettingsPage */}
      <div className="flex gap-6 min-h-[calc(100vh-14rem)]">
        {/* Left sidebar tabs */}
        <div className="w-52 shrink-0">
          <nav className="space-y-0.5 sticky top-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {renderTab()}
        </div>
      </div>
    </div>
  );
};

export default OrgSettingsPage;
