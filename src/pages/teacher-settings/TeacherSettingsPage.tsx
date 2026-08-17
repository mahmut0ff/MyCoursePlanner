import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetTeacherSettings, apiUpdateTeacherSettings } from '../../lib/api';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, storage } from '../../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateUser } from '../../services/users.service';
import AvatarCropper from '../../components/ui/AvatarCropper';
import ActiveRoleCard from '../../components/shared/ActiveRoleCard';
import ActiveOrgCard from '../../components/shared/ActiveOrgCard';
import SidebarCustomizerCard from '../../components/shared/SidebarCustomizerCard';
import NotificationPreferencesCard from '../../components/notifications/NotificationPreferencesCard';
import {
  User, Globe, Bell, Lock, Save, Loader2, CheckCircle2, Eye, EyeOff, Phone, Camera,
} from 'lucide-react';

type Tab = 'profile' | 'language' | 'notifications' | 'security';

const TeacherSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Profile
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [email] = useState(profile?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Language
  const [language, setLanguage] = useState('ru');

  useEffect(() => {
    apiGetTeacherSettings()
      .then((data: any) => {
        if (data.language) setLanguage(data.language);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiUpdateTeacherSettings({
        displayName,
        phone: phone.trim(),
        language,
      });
      setSuccess(t('common.saved') || 'Saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    if (file.size > 2 * 1024 * 1024) {
       setError(t('profile.fileTooLarge', 'File is too large (max 2MB)'));
       return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => setCropImageSrc(reader.result?.toString() || null));
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropImageSrc(null);
    if (!auth.currentUser) return;
    setAvatarLoading(true);
    try {
      const ref = storageRef(storage, `avatars/${auth.currentUser.uid}_${Date.now()}`);
      await uploadBytes(ref, croppedBlob);
      const url = await getDownloadURL(ref);
      setAvatarUrl(url);
      await updateProfile(auth.currentUser, { photoURL: url });
      await updateUser(auth.currentUser.uid, { avatarUrl: url });
      setSuccess(t('profile.avatarUpdated', 'Avatar updated!'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(t('common.error'));
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || newPw.length < 6) {
      setError(t('profile.passwordMinLength'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const user = auth.currentUser!;
      const cred = EmailAuthProvider.credential(user.email!, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setSuccess(t('profile.passwordChanged'));
      setTimeout(() => setSuccess(''), 3000);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e: any) {
      setError(t('profile.passwordFailed'));
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t('teacherSettings.profile'), icon: <User className="w-4 h-4" /> },
    { key: 'language', label: t('teacherSettings.language'), icon: <Globe className="w-4 h-4" /> },
    { key: 'notifications', label: t('teacherSettings.notifications'), icon: <Bell className="w-4 h-4" /> },
    { key: 'security', label: t('teacherSettings.security'), icon: <Lock className="w-4 h-4" /> },
  ];

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{t('teacherSettings.title')}</h1>

      {success && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{success}
        </div>
      )}
      {error && <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}

      {/* Active role switcher — only shows for members holding more than one role */}
      <ActiveOrgCard className="mb-6" />
      <ActiveRoleCard className="mb-6" />
      <SidebarCustomizerCard className="mb-6" />

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 md:w-56 shrink-0 hide-scrollbar pt-1 px-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">
          {activeTab === 'profile' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.profileInfo')}</h2>
              
              <div className="flex items-center gap-6 mb-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      displayName?.[0]?.toUpperCase() || '?'
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarLoading}
                    className="absolute inset-0 bg-black/50 text-white rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">{t('profile.change', 'Change')}</span>
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.displayName')}</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
                </div>
                {/* Telegram-registered accounts use a service email and log in by username — show the login, not the address. */}
                {(profile?.email || '').endsWith('@tg.sabakhub.app') ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('profile.loginLabel', 'Логин для входа')}</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" value={profile?.username || ''} readOnly className="input pl-11 bg-slate-100 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('profile.tgLoginHint', 'Вход в систему — по этому логину и паролю (или через Telegram).')}</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.emailLabel')}</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" value={email} readOnly className="input pl-11 bg-slate-100 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {t('profile.phone', 'Телефон')}
                    <span className="text-xs text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span>
                  </label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('profile.phonePlaceholder', '+996 XXX XXX XXX')} className="input" />
                </div>
                
              </div>
              <button onClick={handleSave} disabled={saving} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.languageSettings')}</h2>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.appLanguage')}</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
                  <option value="ru">🇷🇺 Русский</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="kg">🇰🇬 Кыргызча</option>
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
            // Ровно тот же блок, что и на /notifications: набор настроек один,
            // и две его копии неминуемо разъехались бы. Прежние четыре тумблера
            // (email/push/приглашения/результаты) писались в собственные поля
            // teacherSettings, которых доставка уведомлений не читает вовсе, —
            // то есть выключали ровно ничего.
            <NotificationPreferencesCard collapsible={false} />
          )}

          {activeTab === 'security' && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.changePw')}</h2>
              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.currentPw')}</label>
                  <input type={showCurrent ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="input pr-10" />
                  <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.newPw')}</label>
                  <input type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input pr-10" />
                  <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.confirmPw')}</label>
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="input" />
                </div>
              </div>
              <button onClick={handleChangePassword} disabled={saving || !currentPw || !newPw || newPw !== confirmPw} className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {t('teacherSettings.updatePw')}
              </button>
            </div>
          )}
        </div>
      </div>

      {cropImageSrc && (
        <AvatarCropper
          imageSrc={cropImageSrc}
          onCropCancel={() => setCropImageSrc(null)}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};

export default TeacherSettingsPage;
