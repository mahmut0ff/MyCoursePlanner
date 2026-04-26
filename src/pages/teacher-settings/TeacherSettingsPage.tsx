import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetTeacherSettings, apiUpdateTeacherSettings } from '../../lib/api';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, storage } from '../../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateUser } from '../../services/users.service';
import AvatarCropper from '../../components/ui/AvatarCropper';
import {
  User, Globe, Bell, Lock, Save, Loader2, CheckCircle2, Eye, EyeOff, Phone, Camera,
  FileText, Trash2, Upload
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

  // Resume
  const [resumeUrl, setResumeUrl] = useState(profile?.resumeUrl || '');
  const [resumeFileName, setResumeFileName] = useState(profile?.resumeFileName || '');
  const [resumeLoading, setResumeLoading] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    apiGetTeacherSettings()
      .then((data: any) => {
        if (data.language) setLanguage(data.language);
        if (data.emailNotif !== undefined) setEmailNotif(data.emailNotif);
        if (data.pushNotif !== undefined) setPushNotif(data.pushNotif);
        if (data.inviteNotif !== undefined) setInviteNotif(data.inviteNotif);
        if (data.resultNotif !== undefined) setResultNotif(data.resultNotif);
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
        emailNotif,
        pushNotif,
        inviteNotif,
        resultNotif,
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

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    if (file.type !== 'application/pdf') {
       setError(t('profile.pdfOnly', 'Only PDF files are allowed'));
       return;
    }
    if (file.size > 5 * 1024 * 1024) {
       setError(t('profile.fileTooLarge', 'File is too large (max 5MB)'));
       return;
    }
    
    setResumeLoading(true);
    try {
      const ref = storageRef(storage, `resumes/${auth.currentUser.uid}_${Date.now()}.pdf`);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      setResumeUrl(url);
      setResumeFileName(file.name);
      await updateUser(auth.currentUser.uid, { resumeUrl: url, resumeFileName: file.name });
      setSuccess(t('profile.resumeUpdated', 'Resume uploaded!'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(t('common.error'));
    } finally {
      setResumeLoading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  const handleRemoveResume = async () => {
    if (!auth.currentUser) return;
    setResumeLoading(true);
    try {
      setResumeUrl('');
      setResumeFileName('');
      await updateUser(auth.currentUser.uid, { resumeUrl: '', resumeFileName: '' });
      setSuccess(t('profile.resumeRemoved', 'Resume removed'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(t('common.error'));
    } finally {
      setResumeLoading(false);
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  );

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
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teacherSettings.emailLabel')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="email" value={email} readOnly className="input pl-11 bg-slate-100 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {t('profile.phone', 'Телефон')}
                    <span className="text-xs text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span>
                  </label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('profile.phonePlaceholder', '+996 XXX XXX XXX')} className="input" />
                </div>
                
                {/* Resume Upload */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {t('profile.resume', 'PDF Резюме')}
                  </label>
                  {resumeUrl ? (
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {resumeFileName || 'Resume.pdf'}
                          </p>
                          <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                            {t('common.view', 'Посмотреть')}
                          </a>
                        </div>
                      </div>
                      <button 
                        onClick={handleRemoveResume}
                        disabled={resumeLoading}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        {resumeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input 
                        type="file" 
                        ref={resumeInputRef} 
                        onChange={handleResumeChange} 
                        accept="application/pdf" 
                        className="hidden" 
                      />
                      <button 
                        onClick={() => resumeInputRef.current?.click()}
                        disabled={resumeLoading}
                        className="w-full flex flex-col items-center justify-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        {resumeLoading ? (
                          <Loader2 className="w-6 h-6 text-primary-500 animate-spin mb-2" />
                        ) : (
                          <Upload className="w-6 h-6 text-slate-400 mb-2" />
                        )}
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {t('profile.uploadPdf', 'Загрузить PDF')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Max 5MB
                        </span>
                      </button>
                    </div>
                  )}
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
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('teacherSettings.notifSettings')}</h2>
              <div className="space-y-3">
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
