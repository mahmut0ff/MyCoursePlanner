import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  User, Globe, Bell, Lock, Save, Loader2, CheckCircle2, Eye, EyeOff,
} from 'lucide-react';

type Tab = 'profile' | 'language' | 'notifications' | 'security';

const TeacherSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  // Profile
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [email] = useState(profile?.email || '');

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Notifications
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [inviteNotif, setInviteNotif] = useState(true);
  const [resultNotif, setResultNotif] = useState(true);

  // Language
  const [language, setLanguage] = useState('ru');

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccess(t('common.saved') || 'Saved');
      setTimeout(() => setSuccess(''), 3000);
    }, 500);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t('teacherSettings.profile'), icon: <User className="w-4 h-4" /> },
    { key: 'language', label: t('teacherSettings.language'), icon: <Globe className="w-4 h-4" /> },
    { key: 'notifications', label: t('teacherSettings.notifications'), icon: <Bell className="w-4 h-4" /> },
    { key: 'security', label: t('teacherSettings.security'), icon: <Lock className="w-4 h-4" /> },
  ];

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{t('teacherSettings.title')}</h1>

      {success && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{success}
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">
          {activeTab === 'profile' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.profileInfo')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.displayName')}</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.emailLabel')}</label>
                  <input value={email} readOnly className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.languageSettings')}</h2>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.appLanguage')}</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                  <option value="ru">🇷🇺 Русский</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="kk">🇰🇿 Қазақша</option>
                </select>
              </div>
              <button onClick={handleSave} disabled={saving} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.notifSettings')}</h2>
              <div className="space-y-4">
                {[
                  { label: t('teacherSettings.emailNotif'), desc: t('teacherSettings.emailNotifDesc'), value: emailNotif, set: setEmailNotif },
                  { label: t('teacherSettings.pushNotif'), desc: t('teacherSettings.pushNotifDesc'), value: pushNotif, set: setPushNotif },
                  { label: t('teacherSettings.inviteNotif'), desc: t('teacherSettings.inviteNotifDesc'), value: inviteNotif, set: setInviteNotif },
                  { label: t('teacherSettings.resultNotif'), desc: t('teacherSettings.resultNotifDesc'), value: resultNotif, set: setResultNotif },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                    </div>
                    <Toggle checked={item.value} onChange={item.set} />
                  </div>
                ))}
              </div>
              <button onClick={handleSave} disabled={saving} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.changePw')}</h2>
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.currentPw')}</label>
                  <input type={showCurrent ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white pr-10" />
                  <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.newPw')}</label>
                  <input type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white pr-10" />
                  <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.confirmPw')}</label>
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving || !currentPw || !newPw || newPw !== confirmPw} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {t('teacherSettings.updatePw')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherSettingsPage;
