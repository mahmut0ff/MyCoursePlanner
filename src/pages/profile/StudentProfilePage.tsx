import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../services/auth.service';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { Globe, Lock, LogOut, Save } from 'lucide-react';
import i18n from '../../i18n';

const StudentProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [name, setName] = useState(profile?.displayName || '');
  const [saving, setSaving] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleUpdateName = async () => {
    if (!name.trim() || !auth.currentUser) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
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

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    toast.success(`Language: ${lang === 'ru' ? 'Русский' : 'English'}`);
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">{t('profile.title')}</h1>

      {/* Avatar & Name */}
      <div className="card p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg">
            {profile?.displayName?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{profile?.displayName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            <span className="badge-blue text-xs mt-1 inline-block">Student</span>
          </div>
        </div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('profile.displayName')}</label>
        <div className="flex gap-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="input flex-1" />
          <button onClick={handleUpdateName} disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save className="w-4 h-4" />{saving ? '...' : t('profile.save')}
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="card p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
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
      <div className="card p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('profile.changePassword')}</h3>
        </div>
        <div className="space-y-3">
          <input type="password" placeholder={t('profile.currentPassword')} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="input" />
          <input type="password" placeholder={t('profile.newPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} className="input" />
          <button onClick={handleChangePassword} disabled={pwSaving} className="btn-primary w-full">{pwSaving ? '...' : t('profile.changePassword')}</button>
        </div>
      </div>

      {/* Logout */}
      <button onClick={() => signOut()} className="w-full card p-4 flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
        <LogOut className="w-5 h-5" />{t('common.logout')}
      </button>
    </div>
  );
};

export default StudentProfilePage;
