import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, storage } from '../../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateUser } from '../../services/users.service';
import { isIssuedLoginEmail } from '../../lib/loginEmail';
import toast from 'react-hot-toast';
import { Globe, Lock, Save, Camera, AtSign, CheckCircle2, XCircle, Loader2, Phone } from 'lucide-react';
import i18n from '../../i18n';

import { apiCheckAuthIdentity, apiGetGamification } from '../../lib/api';
import AvatarCropper from '../../components/ui/AvatarCropper';
import type { GamificationData } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';
import TelegramLinkCard from '../../components/telegram/TelegramLinkCard';
import ActiveRoleCard from '../../components/shared/ActiveRoleCard';
import ActiveOrgCard from '../../components/shared/ActiveOrgCard';
import SidebarCustomizerCard from '../../components/shared/SidebarCustomizerCard';
import NotificationPreferencesCard from '../../components/notifications/NotificationPreferencesCard';
import { UI_LANGUAGES } from '../../lib/locale';
import { isPlausiblePhone } from '../../lib/phone';

const StudentProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { profile, loading } = useAuth();



  // Fields
  const [name, setName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [pinnedBadges, setPinnedBadges] = useState<string[]>(profile?.pinnedBadges || []);
  const [myBadges, setMyBadges] = useState<GamificationData | null>(null);
  
  React.useEffect(() => {
    apiGetGamification().then(setMyBadges).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!username || username === profile?.username || username.length < 3) return setUsernameStatus('idle');
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await apiCheckAuthIdentity({ action: 'check', username });
        setUsernameStatus(res.username ? 'taken' : 'available');
      } catch { setUsernameStatus('idle'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, profile?.username]);

  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleUpdateProfile = async () => {
    if (!auth.currentUser) return;
    // Раньше пустое имя молча отбрасывало сохранение, а «abc» уходило в телефон.
    if (!name.trim()) { toast.error(t('profile.nameRequired', 'Укажите имя')); return; }
    if (!isPlausiblePhone(phone)) { toast.error(t('profile.phoneInvalid', 'Похоже, телефон введён с ошибкой: нужны цифры, 7–15 знаков')); return; }
    if (usernameStatus === 'taken') {
      toast.error(t('auth.usernameTaken', 'Этот никнейм уже занят'));
      return;
    }
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim(), photoURL: avatarUrl || auth.currentUser.photoURL });
      await updateUser(auth.currentUser.uid, { 
        displayName: name.trim(),
        username: username.trim().toLowerCase(),
        avatarUrl,
        phone: phone.trim(),
        pinnedBadges
      });
      toast.success(t('profile.saved'));
    } catch { toast.error(t('profile.saveFailed')); }
    finally { setSaving(false); }
  };

  const togglePinBadge = (badgeId: string) => {
    if (pinnedBadges.includes(badgeId)) {
      setPinnedBadges(prev => prev.filter(id => id !== badgeId));
    } else {
      if (pinnedBadges.length >= 3) {
        toast.error(t('profile.badgesMax', 'Можно закрепить не более 3 бейджей'));
        return;
      }
      setPinnedBadges(prev => [...prev, badgeId]);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || newPw.length < 6) {
      toast.error(t('profile.passwordMinLength'));
      return;
    }
    setPwSaving(true);
    try {
      const user = auth.currentUser!;
      const cred = EmailAuthProvider.credential(user.email!, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      toast.success(t('profile.passwordChanged'));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch { toast.error(t('profile.passwordFailed')); }
    finally { setPwSaving(false); }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    if (file.size > 2 * 1024 * 1024) {
       toast.error(t('profile.fileTooLarge', 'File is too large (max 2MB)'));
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
      toast.success(t('profile.avatarUpdated', 'Avatar updated!'));
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    toast.success(`${t('profile.language')}: ${UI_LANGUAGES.find(l => l.code === lang)?.label || lang}`);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>;
  if (!profile) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('profile.title')}</h1>
      </div>

      {/* Active role switcher — only shows for members holding more than one role */}
      <ActiveOrgCard className="mb-4" />
      <ActiveRoleCard className="mb-4" />

      {
        <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          {/* Avatar & Basic Info */}
          <div className="card p-4">
            <div className="flex items-start gap-4 mb-4">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    profile?.displayName?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="absolute inset-0 bg-black/50 text-white rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera className="w-4 h-4 mb-1" />
                  <span className="text-xs font-medium">{t('profile.change', 'Change')}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <label className="label">{t('profile.displayName')}</label>
                  <PinnedBadgesDisplay badges={pinnedBadges} emptyPlaceholder className="mb-0" />
                </div>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input mb-3" />
                
                <label className="label">{t('auth.username', 'Никнейм')}</label>
                <div className="relative mb-2">
                  <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="input pl-8 pr-8" placeholder={t('profile.usernamePlaceholder', 'aibek_7')} />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {usernameStatus === 'taken' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                </div>
                {usernameStatus === 'taken' && <p className="text-xs text-red-500 mt-1 mb-2">{t('auth.usernameTaken', 'Этот никнейм уже занят')}</p>}
                
                {/* Centre-issued logins (…@student.sabakhub.app, …@tg.sabakhub.app) are service addresses, not a mailbox — hide them. */}
                {isIssuedLoginEmail(profile?.email) ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    {(profile?.email || '').endsWith('@tg.sabakhub.app')
                      ? t('profile.tgLoginHint', 'Вход в систему — по никнейму выше и паролю (или через Telegram).')
                      : t('profile.issuedLoginHint', 'Вход по логину «{{login}}» и паролю, который выдал центр.', { login: (profile?.email || '').split('@')[0] })}
                  </p>
                ) : (
                  <>
                    <label className="label">{t('teacherSettings.emailLabel', 'Email')}</label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="email" value={profile?.email || ''} readOnly className="input pl-8 cursor-not-allowed" />
                    </div>
                  </>
                )}
                
                <label className="label flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {t('profile.phone', 'Телефон')}
                  <span className="text-xs text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="input"
                    placeholder={t('profile.phonePlaceholder', '+996 XXX XXX XXX')}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="pt-3 flex justify-end">
                <button onClick={handleUpdateProfile} disabled={saving} className="btn-primary inline-flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" />{saving ? '...' : t('profile.save')}
                </button>
              </div>
            </div>
          </div>

          {/* ----- Pinned Badges ----- */}
          {myBadges && myBadges.badges.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('profile.pinnedBadges', 'Закрепленные бейджи')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('profile.pinnedBadgesHint', 'Выберите до 3 любимых бейджей, чтобы они отображались рядом с вашим аватаром.')}</p>
              
              <div className="flex flex-wrap gap-2">
                {myBadges.badgeDetails?.map(badge => {
                  const isPinned = pinnedBadges.includes(badge.id);
                  return (
                    <button
                      key={badge.id}
                      onClick={() => togglePinBadge(badge.id)}
                      className={`relative w-11 h-11 rounded-lg border flex items-center justify-center text-xl transition-colors ${
                        isPinned 
                          ? 'border-primary-600 ring-1 ring-primary-600 bg-primary-50 dark:bg-primary-950 dark:border-primary-500 dark:ring-primary-500'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer grayscale-[50%] opacity-80'
                      }`}
                      title={badge.title}
                    >
                      {badge.icon}
                      {isPinned && (
                        <div className="absolute -top-1.5 -right-1.5 bg-primary-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                           ★
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="text-right mt-3">
                 <button onClick={handleUpdateProfile} disabled={saving} className="btn-primary inline-flex items-center justify-center gap-1.5 ml-auto">
                   <Save className="w-3.5 h-3.5" /> {t('profile.save', 'Сохранить')}
                 </button>
              </div>
            </div>
          )}

          {/* Password */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('profile.changePassword')}</h3>
            </div>
            <div className="space-y-3 max-w-sm">
              <input type="password" placeholder={t('profile.currentPassword')} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="input" />
              <input type="password" placeholder={t('profile.newPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} className="input" />
              <input type="password" placeholder={t('teacherSettings.confirmPw', 'Подтвердите пароль')} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input" />
              <button 
                onClick={handleChangePassword} 
                disabled={pwSaving || !currentPw || !newPw || newPw !== confirmPw} 
                className="btn-primary w-full"
              >
                {pwSaving ? '...' : t('profile.changePassword')}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Language */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('profile.language')}</h3>
            </div>
            <div className="flex gap-2">
              {UI_LANGUAGES.map(({ code: lang, label, flag }) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={`h-8 px-3 rounded-md border text-sm font-medium transition-colors ${
                    i18n.language === lang
                      ? 'bg-primary-100 dark:bg-primary-950 border-primary-200 dark:border-primary-900 text-slate-900 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {flag} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Telegram Link */}
          <TelegramLinkCard />

          {/* Уведомления — тот же блок, что на /notifications; раньше жил ещё в /teacher-settings. */}
          <NotificationPreferencesCard />

          <SidebarCustomizerCard />
        </div>

        </div>
      }

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

export default StudentProfilePage;

