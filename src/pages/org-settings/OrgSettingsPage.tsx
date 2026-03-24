import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import {
  Save, Building2, GraduationCap, Check, Bell, Lock, Palette, BarChart3,
  Globe, Database, User, Shield, Eye, EyeOff,
} from 'lucide-react';
import type { OrgSettings } from '../../types';

type Tab = 'profile' | 'general' | 'academic' | 'branding' | 'notifications' | 'localization' | 'security' | 'data' | 'limits';

const TABS: { id: Tab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'profile', icon: User, labelKey: 'org.settings.profileTab' },
  { id: 'general', icon: Building2, labelKey: 'org.settings.general' },
  { id: 'academic', icon: GraduationCap, labelKey: 'org.settings.academic' },
  { id: 'branding', icon: Palette, labelKey: 'org.settings.branding' },
  { id: 'notifications', icon: Bell, labelKey: 'org.settings.notifications' },
  { id: 'localization', icon: Globe, labelKey: 'org.settings.localizationTab' },
  { id: 'security', icon: Lock, labelKey: 'org.settings.security' },
  { id: 'data', icon: Database, labelKey: 'org.settings.dataTab' },
  { id: 'limits', icon: BarChart3, labelKey: 'org.settings.limits' },
];

/* ════════════════════════════════════ PROFILE ════════════════════════════════════ */
const ProfileTab: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [form, setForm] = useState({
    firstName: profile?.displayName?.split(' ')[0] || '',
    lastName: profile?.displayName?.split(' ').slice(1).join(' ') || '',
    email: profile?.email || '',
    phone: '',
  });
  const [pw, setPw] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 bg-primary-600 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-white/10">
          {profile?.displayName?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{profile?.displayName}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 mt-1 capitalize">{profile?.role?.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.firstName')}</label>
            <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.lastName')}</label>
            <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.emailLabel')}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.phone')}</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="+996 XXX XXX XXX" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('org.settings.saveChanges')}</button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Shield className="w-4 h-4" />{t('org.settings.changePassword')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.currentPassword')}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="input pr-10" placeholder={t('org.settings.enterCurrentPassword')} />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.newPassword')}</label>
              <input type="password" value={pw.newPw} onChange={(e) => setPw({ ...pw, newPw: e.target.value })} className="input" placeholder={t('org.settings.enterNewPassword')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.confirmNewPassword')}</label>
              <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="input" placeholder={t('org.settings.confirmNewPassword')} />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm">{t('org.settings.updatePassword')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
          
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{t('org.settings.isOnline', 'Формат обучения')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.settings.isOnlineDesc', 'Отметьте, если центр проводит обучение в онлайн-формате')}</p>
              </div>
              <button
                onClick={() => update('isOnline', !settings.isOnline)}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.isOnline ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.isOnline ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
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
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="h-16 mx-auto mb-2 object-contain" />
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">{t('org.settings.dropLogo')}</p>
              )}
            </div>
            <input value={settings.logo || ''} onChange={(e) => update('logo', e.target.value)} className="input mt-2" placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.primaryColor')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                <input type="text" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="input text-sm font-mono" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgDescription')}</label>
            <textarea value={settings.description || ''} onChange={(e) => update('description', e.target.value)} className="input min-h-[80px]"
              placeholder={t('org.settings.orgDescriptionPlaceholder')} />
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('org.settings.saveChanges')}</button>
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

/* ════════════════════════════════════ LOCALIZATION ════════════════════════════════════ */
const LocalizationTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  const langs = [
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'kg', label: 'Кыргызча', flag: '🇰🇬' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.languageSettings')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.defaultLanguage')}</label>
            <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className="input">
              {langs.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('org.settings.enabledLanguages')}</label>
            <div className="flex gap-3">
              {langs.map((l) => (
                <label key={l.code} className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-600 hover:border-primary-300 dark:hover:border-primary-600 transition-colors">
                  <input type="checkbox" defaultChecked className="accent-primary-500 w-4 h-4" />
                  <span className="text-lg">{l.flag}</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{l.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.timezone')}</label>
            <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="input">
              <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
              <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
              <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('org.settings.saveChanges')}</button>
          </div>
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
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.securitySettings')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.sessionTimeout')}</label>
            <div className="flex items-center gap-2">
              <select value={settings.sessionTimeoutMinutes ?? 60} onChange={(e) => update('sessionTimeoutMinutes', Number(e.target.value))} className="input">
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={120}>120</option>
                <option value={480}>480</option>
              </select>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t('org.settings.minutes')}</span>
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

          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('org.settings.saveChanges')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ DATA MANAGEMENT ════════════════════════════════════ */
const DataTab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.exportData')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.exportDataDesc')}</p>
        <div className="flex gap-3">
          <button className="btn-secondary text-sm">{t('org.settings.exportStudents')}</button>
          <button className="btn-secondary text-sm">{t('org.settings.exportTeachers')}</button>
          <button className="btn-secondary text-sm">{t('org.settings.exportResults')}</button>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.backup')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.backupDesc')}</p>
        <button className="btn-primary text-sm">{t('org.settings.createBackup')}</button>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">{t('org.settings.dangerZone')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.dangerZoneDesc')}</p>
        <button className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">{t('org.settings.deleteOrg')}</button>
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
  const [activeTab, setActiveTab] = useState<Tab>('profile');

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
      case 'profile': return <ProfileTab />;
      case 'general': return <GeneralTab settings={settings} update={update} />;
      case 'academic': return <AcademicTab settings={settings} update={update} />;
      case 'branding': return <BrandingTab settings={settings} update={update} />;
      case 'notifications': return <NotificationsTab settings={settings} update={update} />;
      case 'localization': return <LocalizationTab settings={settings} update={update} />;
      case 'security': return <SecurityTab settings={settings} update={update} />;
      case 'data': return <DataTab />;
      case 'limits': return <LimitsTab settings={settings} />;
    }
  };

  return (
    <div>
      {/* Header with save */}
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

      {/* Tabbed layout – same structure as AdminSettingsPage */}
      <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
        {/* Left sidebar tabs */}
        <div className="w-56 shrink-0">
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
