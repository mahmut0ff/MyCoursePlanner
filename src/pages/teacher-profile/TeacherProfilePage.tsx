import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetTeacherProfile, apiUpdateTeacherProfile } from '../../lib/api';
import { Save, User, Briefcase, BookOpen, Link2, Plus, X, Loader2, CheckCircle2 } from 'lucide-react';

interface SocialLink {
  platform: string;
  url: string;
}

const TeacherProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [bio, setBio] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [experience, setExperience] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    apiGetTeacherProfile()
      .then((data: any) => {
        setBio(data.bio || '');
        setSpecialization(data.specialization || '');
        setExperience(data.experience || '');
        setSocialLinks(data.socialLinks || []);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiUpdateTeacherProfile({ bio, specialization, experience, socialLinks });
      setSuccess(t('teacher.profileSaved'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const addLink = () => setSocialLinks([...socialLinks, { platform: '', url: '' }]);
  const removeLink = (i: number) => setSocialLinks(socialLinks.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: 'platform' | 'url', val: string) => {
    const copy = [...socialLinks];
    copy[i] = { ...copy[i], [field]: val };
    setSocialLinks(copy);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('teacher.profileTitle')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('teacher.profileSubtitle')}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('common.save')}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}
      {success && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{success}
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 h-24 relative">
          <div className="absolute -bottom-8 left-6">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
              {profile?.displayName?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </div>
        <div className="pt-12 px-6 pb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{profile?.displayName}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
          {profile?.organizationId && profile?.organizationName && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-full font-medium">
              {profile.organizationName}
            </span>
          )}
        </div>
      </div>

      {/* Form Sections */}
      <div className="space-y-5">
        {/* Bio */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.bio')}</h3>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder={t('teacher.bioPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
          />
        </div>

        {/* Specialization */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.specialization')}</h3>
          </div>
          <input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder={t('teacher.specializationPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        {/* Experience */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.experience')}</h3>
          </div>
          <textarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            rows={3}
            placeholder={t('teacher.experiencePlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
          />
        </div>

        {/* Social Links */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.socialLinks')}</h3>
            </div>
            <button onClick={addLink} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" />{t('common.create')}
            </button>
          </div>
          {socialLinks.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">{t('teacher.noSocialLinks')}</p>
          ) : (
            <div className="space-y-2">
              {socialLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={link.platform}
                    onChange={(e) => updateLink(i, 'platform', e.target.value)}
                    placeholder={t('teacher.platformPlaceholder')}
                    className="w-32 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white"
                  />
                  <input
                    value={link.url}
                    onChange={(e) => updateLink(i, 'url', e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white"
                  />
                  <button onClick={() => removeLink(i)} className="p-1 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherProfilePage;
