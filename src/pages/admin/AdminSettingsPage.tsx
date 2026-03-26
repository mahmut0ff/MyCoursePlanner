import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  User, Users, Palette, Bell, Puzzle, CreditCard, Mail,
  Globe, Shield, Database, Save, Eye, EyeOff,
} from 'lucide-react';

type Tab =
  | 'profile'
  | 'users'
  | 'branding'
  | 'notifications'
  | 'integrations'
  | 'billing'
  | 'emailTemplates'
  | 'localization'
  | 'security'
  | 'data';

const TABS: { id: Tab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'profile', icon: User, labelKey: 'admin.settings.profile' },
  { id: 'users', icon: Users, labelKey: 'admin.settings.usersRoles' },
  { id: 'branding', icon: Palette, labelKey: 'admin.settings.branding' },
  { id: 'notifications', icon: Bell, labelKey: 'admin.settings.notifications' },
  { id: 'integrations', icon: Puzzle, labelKey: 'admin.settings.integrationsTab' },
  { id: 'billing', icon: CreditCard, labelKey: 'admin.settings.subscriptionBilling' },
  { id: 'emailTemplates', icon: Mail, labelKey: 'admin.settings.emailTemplates' },
  { id: 'localization', icon: Globe, labelKey: 'admin.settings.localization' },
  { id: 'security', icon: Shield, labelKey: 'admin.settings.security' },
  { id: 'data', icon: Database, labelKey: 'admin.settings.dataManagement' },
];

/* ════════════════════════════════════════════════ */
/*  PROFILE TAB                                    */
/* ════════════════════════════════════════════════ */
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
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-lg ring-2 ring-white/10" />
        ) : (
          <div className="w-14 h-14 bg-emerald-600 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-white/10">
            {profile?.displayName?.[0]?.toUpperCase() || '?'}
          </div>
        )}
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.firstName')}</label>
            <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.lastName')}</label>
            <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.emailLabel')}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.phone')}</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="+996 XXX XXX XXX" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('admin.settings.saveChanges')}</button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Shield className="w-4 h-4" />{t('admin.settings.changePassword')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.currentPassword')}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="input pr-10" placeholder={t('admin.settings.enterCurrentPassword')} />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.newPassword')}</label>
              <input type="password" value={pw.newPw} onChange={(e) => setPw({ ...pw, newPw: e.target.value })} className="input" placeholder={t('admin.settings.enterNewPassword')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.confirmNewPassword')}</label>
              <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="input" placeholder={t('admin.settings.confirmNewPassword')} />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm">{t('admin.settings.updatePassword')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  USERS & ROLES TAB                              */
/* ════════════════════════════════════════════════ */
const UsersRolesTab: React.FC = () => {
  const { t } = useTranslation();
  const roles = [
    { name: 'super_admin', users: 1, permissions: 'Full access', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
    { name: 'admin', users: 5, permissions: 'Organization management', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' },
    { name: 'teacher', users: 20, permissions: 'Lessons, exams, rooms', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    { name: 'student', users: 150, permissions: 'Take exams, view results', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('admin.settings.rolesPermissions')}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {roles.map((r) => (
            <div key={r.name} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium capitalize ${r.color}`}>{r.name.replace('_', ' ')}</span>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{r.permissions}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500 dark:text-slate-400">{r.users} {t('admin.settings.usersCount')}</span>
                <button className="btn-secondary text-xs">{t('common.edit')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  BRANDING TAB                                   */
/* ════════════════════════════════════════════════ */
const BrandingTab: React.FC = () => {
  const { t } = useTranslation();
  const [brand, setBrand] = useState({ name: 'Planula', primaryColor: '#6366f1', accentColor: '#10b981' });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.settings.platformBranding')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.platformName')}</label>
            <input type="text" value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.logo')}</label>
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">{t('admin.settings.dropLogo')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.primaryColor')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                <input type="text" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} className="input text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.accentColor')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                <input type="text" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} className="input text-sm font-mono" />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('admin.settings.saveChanges')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  NOTIFICATIONS TAB                              */
/* ════════════════════════════════════════════════ */
const NotificationsTab: React.FC = () => {
  const { t } = useTranslation();
  const [notifs, setNotifs] = useState([
    { id: 'new_user', enabled: true },
    { id: 'new_org', enabled: true },
    { id: 'payment', enabled: true },
    { id: 'exam_completed', enabled: false },
    { id: 'system_error', enabled: true },
    { id: 'trial_expiring', enabled: true },
  ]);

  const toggleNotif = (id: string) => setNotifs(notifs.map((n) => n.id === id ? { ...n, enabled: !n.enabled } : n));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('admin.settings.emailNotifications')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('admin.settings.emailNotificationsDesc')}</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {notifs.map((n) => (
            <div key={n.id} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{t(`admin.settings.notif_${n.id}`)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t(`admin.settings.notif_${n.id}_desc`)}</p>
              </div>
              <button
                onClick={() => toggleNotif(n.id)}
                className={`relative w-11 h-6 rounded-full transition-colors ${n.enabled ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${n.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  INTEGRATIONS TAB                               */
/* ════════════════════════════════════════════════ */
const IntegrationsTab: React.FC = () => {
  const { t } = useTranslation();
  const integrations = [
    { id: 'google_oauth', name: 'Google OAuth', status: true, icon: '🔐' },
    { id: 'freedom_pay', name: 'Freedom Pay', status: false, icon: '💳' },
    { id: 'sendgrid', name: 'SendGrid', status: false, icon: '📧' },
    { id: 'telegram', name: 'Telegram Bot', status: false, icon: '🤖' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('admin.settings.connectedServices')}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {integrations.map((i) => (
            <div key={i.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-xl">{i.icon}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{i.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{i.status ? t('admin.settings.connected') : t('admin.settings.notConnected')}</p>
              </div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${i.status ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{i.status ? t('common.active') : t('common.disabled')}</span>
              <button className="btn-secondary text-xs">{i.status ? t('admin.settings.configure') : t('admin.settings.connect')}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  SUBSCRIPTION BILLING TAB                       */
/* ════════════════════════════════════════════════ */
const BillingTab: React.FC = () => {
  const { t } = useTranslation();
  const plans = [
    { id: 'starter', name: 'Starter', price: 39, students: 50, teachers: 5 },
    { id: 'professional', name: 'Professional', price: 79, students: 200, teachers: 20 },
    { id: 'enterprise', name: 'Enterprise', price: 199, students: -1, teachers: -1 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('admin.settings.planManagement')}</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.settings.planName')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.settings.priceMonth')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.settings.students')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.settings.teachers')}</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {plans.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{p.name}</td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">${p.price}/mo</td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{p.students === -1 ? '∞' : p.students}</td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{p.teachers === -1 ? '∞' : p.teachers}</td>
                <td className="px-6 py-4 text-right"><button className="btn-secondary text-xs">{t('common.edit')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  EMAIL TEMPLATES TAB                            */
/* ════════════════════════════════════════════════ */
const EmailTemplatesTab: React.FC = () => {
  const { t } = useTranslation();
  const templates = [
    { id: 'welcome', subject: 'Welcome to Planula' },
    { id: 'password_reset', subject: 'Password Reset Request' },
    { id: 'exam_invite', subject: 'You\'re Invited to an Exam' },
    { id: 'trial_expiring', subject: 'Your Trial is Expiring Soon' },
    { id: 'payment_success', subject: 'Payment Confirmation' },
    { id: 'subscription_cancelled', subject: 'Subscription Cancelled' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('admin.settings.emailTemplatesTitle')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('admin.settings.emailTemplatesDesc')}</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{t(`admin.settings.tpl_${tmpl.id}`)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{tmpl.id}</p>
              </div>
              <button className="btn-secondary text-xs">{t('common.edit')}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  LOCALIZATION TAB                               */
/* ════════════════════════════════════════════════ */
const LocalizationTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [tz, setTz] = useState('Asia/Bishkek');
  const [currency, setCurrency] = useState('KGS');
  const [defaultLang, setDefaultLang] = useState(i18n.language || 'ru');

  const langs = [
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'kg', label: 'Кыргызча', flag: '🇰🇬' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.settings.languageSettings')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.defaultLanguage')}</label>
            <select value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)} className="input">
              {langs.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('admin.settings.enabledLanguages')}</label>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.timezone')}</label>
              <select value={tz} onChange={(e) => setTz(e.target.value)} className="input">
                <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.currency')}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
                <option value="KGS">KGS (сом)</option>
                <option value="USD">USD ($)</option>
                <option value="RUB">RUB (₽)</option>
                <option value="KZT">KZT (₸)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('admin.settings.saveChanges')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  SECURITY TAB                                   */
/* ════════════════════════════════════════════════ */
const SecurityTab: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    sessionTimeout: 30,
    minPasswordLength: 8,
    require2FA: false,
    allowSocialLogin: true,
    maxLoginAttempts: 5,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.settings.securitySettings')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.sessionTimeout')}</label>
              <div className="flex items-center gap-2">
                <input type="number" value={settings.sessionTimeout} onChange={(e) => setSettings({ ...settings, sessionTimeout: +e.target.value })} className="input" />
                <span className="text-sm text-slate-500 dark:text-slate-400">{t('admin.settings.minutes')}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.minPasswordLength')}</label>
              <input type="number" value={settings.minPasswordLength} onChange={(e) => setSettings({ ...settings, minPasswordLength: +e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.settings.maxLoginAttempts')}</label>
              <input type="number" value={settings.maxLoginAttempts} onChange={(e) => setSettings({ ...settings, maxLoginAttempts: +e.target.value })} className="input" />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {([
              { key: 'require2FA', label: t('admin.settings.require2FA'), desc: t('admin.settings.require2FADesc') },
              { key: 'allowSocialLogin', label: t('admin.settings.allowSocialLogin'), desc: t('admin.settings.allowSocialLoginDesc') },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, [item.key]: !settings[item.key] })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings[item.key] ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[item.key] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" />{t('admin.settings.saveChanges')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  DATA MANAGEMENT TAB                            */
/* ════════════════════════════════════════════════ */
const DataManagementTab: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.settings.exportData')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('admin.settings.exportDataDesc')}</p>
        <div className="flex gap-3">
          <button className="btn-secondary text-sm">{t('admin.settings.exportUsers')}</button>
          <button className="btn-secondary text-sm">{t('admin.settings.exportOrgs')}</button>
          <button className="btn-secondary text-sm">{t('admin.settings.exportExams')}</button>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('admin.settings.backup')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('admin.settings.backupDesc')}</p>
        <button className="btn-primary text-sm">{t('admin.settings.createBackup')}</button>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">{t('admin.settings.dangerZone')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('admin.settings.dangerZoneDesc')}</p>
        <button className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">{t('admin.settings.purgeData')}</button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════ */
/*  MAIN PAGE                                      */
/* ════════════════════════════════════════════════ */
const TAB_COMPONENTS: Record<Tab, React.FC> = {
  profile: ProfileTab,
  users: UsersRolesTab,
  branding: BrandingTab,
  notifications: NotificationsTab,
  integrations: IntegrationsTab,
  billing: BillingTab,
  emailTemplates: EmailTemplatesTab,
  localization: LocalizationTab,
  security: SecurityTab,
  data: DataManagementTab,
};

const AdminSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-[calc(100vh-8rem)]">
      {/* Mobile: horizontal scrollable tabs */}
      <div className="md:hidden overflow-x-auto -mx-2 px-2 pb-2">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical sidebar tabs */}
      <div className="hidden md:block w-56 shrink-0">
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
        <ActiveComponent />
      </div>
    </div>
  );
};

export default AdminSettingsPage;
