import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, storage } from '../../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateUser } from '../../services/users.service';
import toast from 'react-hot-toast';
import { Globe, Lock, Save, Camera, AtSign, CheckCircle2, XCircle, Loader2, Phone } from 'lucide-react';
import i18n from '../../i18n';
import StudentPortfolio from '../../components/portfolio/StudentPortfolio';
import { apiCheckAuthIdentity } from '../../lib/api';
import AvatarCropper from '../../components/ui/AvatarCropper';

const StudentProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'settings' | 'portfolio'>('settings');

  // Fields
  const [name, setName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [bio, setBio] = useState(profile?.bio || '');
  const [skills, setSkills] = useState(profile?.skills?.join(', ') || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  
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
  const [pwSaving, setPwSaving] = useState(false);

  const handleUpdateProfile = async () => {
    if (!name.trim() || !auth.currentUser) return;
    if (usernameStatus === 'taken') {
      toast.error(t('auth.usernameTaken', 'Этот никнейм уже занят'));
      return;
    }
    setSaving(true);
    try {
      const parsedSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
      await updateProfile(auth.currentUser, { displayName: name.trim(), photoURL: avatarUrl || auth.currentUser.photoURL });
      await updateUser(auth.currentUser.uid, { 
        displayName: name.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        skills: parsedSkills,
        avatarUrl,
        phone: phone.trim()
      });
      toast.success(t('profile.saved'));
    } catch { toast.error(t('profile.saveFailed')); }
    finally { setSaving(false); }
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
    toast.success(`Language: ${lang === 'ru' ? 'Русский' : 'English'}`);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('profile.title')}</h1>
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-8">
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'settings' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t('profile.settings', 'Settings')}
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'portfolio' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t('profile.portfolio', 'Portfolio')}
        </button>
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Avatar & Basic Info */}
          <div className="card p-6">
            <div className="flex items-center gap-6 mb-6">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg shrink-0">
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
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{t('profile.change', 'Change')}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('profile.displayName')}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input mb-4" />
                
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('auth.username', 'Никнейм')}</label>
                <div className="relative mb-2">
                  <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="input pl-11 pr-11" placeholder="john_doe" />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
                {usernameStatus === 'taken' && <p className="text-xs text-red-500 mt-1 mb-2">{t('auth.usernameTaken', 'Этот никнейм уже занят')}</p>}
                
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{profile?.email}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('profile.bio', 'Bio')}</label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="input min-h-[100px]"
                  placeholder={t('profile.bioPlaceholder', 'Tell us about yourself...')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('profile.skills', 'Skills (comma separated)')}</label>
                <input
                  type="text"
                  value={skills}
                  onChange={e => setSkills(e.target.value)}
                  className="input"
                  placeholder="e.g. JavaScript, Design, Python"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {t('profile.phone', 'Телефон')}
                  <span className="text-xs text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="input"
                  placeholder={t('profile.phonePlaceholder', '+996 XXX XXX XXX')}
                />
              </div>
              <div className="pt-4 flex justify-end">
                <button onClick={handleUpdateProfile} disabled={saving} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />{saving ? '...' : t('profile.save')}
                </button>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="font-semibold text-slate-900 dark:text-white">{t('profile.language')}</h3>
            </div>
            <div className="flex gap-2">
              {['ru', 'en'].map(lang => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    i18n.language === lang
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {lang === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}
                </button>
              ))}
            </div>
          </div>

          {/* Password */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">{t('profile.changePassword')}</h3>
            </div>
            <div className="space-y-3 max-w-sm">
              <input type="password" placeholder={t('profile.currentPassword')} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="input" />
              <input type="password" placeholder={t('profile.newPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} className="input" />
              <button onClick={handleChangePassword} disabled={pwSaving} className="btn-primary w-full">{pwSaving ? '...' : t('profile.changePassword')}</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'portfolio' && (
        <StudentPortfolio uid={profile?.uid || ''} />
      )}

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

