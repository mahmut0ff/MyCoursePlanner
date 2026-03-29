import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { auth, storage } from '../../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { apiGetTeacherProfile, apiUpdateTeacherProfile } from '../../lib/api';
import AvatarCropper from '../../components/ui/AvatarCropper';
import { Save, User, Briefcase, BookOpen, Link2, Plus, X, Loader2, CheckCircle2, Eye, EyeOff, GraduationCap, Award, MapPin, Tag, Camera, FileText, Upload, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [previewMode, setPreviewMode] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [experience, setExperience] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [education, setEducation] = useState('');
  const [certificates, setCertificates] = useState('');
  const [subjects, setSubjects] = useState('');
  const [city, setCity] = useState('');

  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const resumeInputRef = React.useRef<HTMLInputElement>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

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
      const refArea = storageRef(storage, `avatars/teacher_${auth.currentUser.uid}_${Date.now()}`);
      await uploadBytes(refArea, croppedBlob);
      const url = await getDownloadURL(refArea);
      setAvatarUrl(url);
      await updateProfile(auth.currentUser, { photoURL: url });
      // Saving to Firestore happens when they click "Save"
      toast.success(t('profile.avatarUpdated', 'Avatar updated! Click Save below to persist your new profile.'));
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    if (file.type !== 'application/pdf') {
      toast.error('Только PDF файлы разрешены');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
       toast.error('Файл слишком большой (макс 5MB)');
       return;
    }
    
    setResumeLoading(true);
    try {
      const refArea = storageRef(storage, `resumes/teacher_${auth.currentUser.uid}_${Date.now()}.pdf`);
      await uploadBytes(refArea, file);
      const url = await getDownloadURL(refArea);
      setResumeUrl(url);
      setResumeFileName(file.name);
      toast.success('Резюме загружено! Нажмите "Сохранить" чтобы обновить профиль.');
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      if (resumeInputRef.current) resumeInputRef.current.value = '';
      setResumeLoading(false);
    }
  };

  useEffect(() => {
    apiGetTeacherProfile()
      .then((data: any) => {
        setBio(data.bio || '');
        setSpecialization(data.specialization || '');
        setExperience(data.experience || '');
        setSocialLinks(data.socialLinks || []);
        setAvatarUrl(data.avatarUrl || '');
        setEducation(data.education || '');
        setCertificates(data.certificates || '');
        setSubjects(data.subjects || '');
        setCity(data.city || '');
        setResumeUrl(data.resumeUrl || '');
        setResumeFileName(data.resumeFileName || '');
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiUpdateTeacherProfile({ bio, specialization, experience, socialLinks, avatarUrl, education, certificates, subjects, city, resumeUrl, resumeFileName });
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

  const subjectsArr = subjects ? subjects.split(',').map(s => s.trim()).filter(Boolean) : [];

  /* ═════════════════════ PREVIEW MODE ═════════════════════ */
  if (previewMode) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('teacher.previewTitle')}</h1>
          <button onClick={() => setPreviewMode(false)} className="btn-secondary text-sm flex items-center gap-2">
            <EyeOff className="w-4 h-4" />{t('teacher.exitPreview')}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-slate-700 h-24 relative">
            <div className="absolute -bottom-10 left-6">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800" />
              ) : (
                <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center text-2xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
          </div>
          <div className="pt-14 px-6 pb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{profile?.displayName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{specialization || t('teacher.noSpecialization')}</p>
            {city && <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{city}</p>}
            {subjectsArr.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {subjectsArr.map((s, i) => <span key={i} className="text-[11px] px-2 py-0.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-full font-medium">{s}</span>)}
              </div>
            )}
            {bio && <p className="text-sm text-slate-600 dark:text-slate-300 mt-4 leading-relaxed">{bio}</p>}
            {experience && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{t('teacher.experience')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{experience}</p>
              </div>
            )}
            {education && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{t('teacher.education')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{education}</p>
              </div>
            )}
            {certificates && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{t('teacher.certificates')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{certificates}</p>
              </div>
            )}
            {resumeUrl && (
              <div className="mt-6 flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white mb-0.5">Прикрепленное резюме</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{resumeFileName || 'resume.pdf'}</p>
                  </div>
                </div>
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary text-xs flex items-center gap-2 whitespace-nowrap shrink-0 ml-4"
                >
                  <FileText className="w-4 h-4" />
                  Открыть PDF
                </a>
              </div>
            )}
            {socialLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {socialLinks.map((l, i) => l.url && (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-primary-600 dark:text-primary-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    {l.platform || l.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════ EDIT MODE ═════════════════════ */
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('teacher.profileTitle')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('teacher.profileSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewMode(true)} className="btn-secondary text-sm flex items-center gap-2">
            <Eye className="w-4 h-4" />{t('teacher.preview')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}
      {success && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{success}
        </div>
      )}

      {/* Profile Card with Avatar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-24 relative">
          <div className="absolute -bottom-10 left-6">
            <div className="relative group">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800" />
              ) : (
                <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center text-2xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
                className="absolute inset-0 bg-black/50 text-white rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ring-4 ring-white dark:ring-slate-800"
              >
                {avatarLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
              </button>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" />
            </div>
          </div>
        </div>
        <div className="pt-14 px-6 pb-6">
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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.bio')}</h3>
          </div>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder={t('teacher.bioPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none" />
        </div>

        {/* Specialization + City */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.specialization')}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder={t('teacher.specializationPlaceholder')}
              className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400" />
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('teacher.cityPlaceholder')}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-9 pr-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400" />
            </div>
          </div>
        </div>

        {/* Subjects / Tags */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.subjects')}</h3>
          </div>
          <input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder={t('teacher.subjectsPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400" />
          {subjectsArr.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {subjectsArr.map((s, i) => <span key={i} className="text-[11px] px-2 py-0.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-full font-medium">{s}</span>)}
            </div>
          )}
        </div>

        {/* Experience */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.experience')}</h3>
          </div>
          <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={3} placeholder={t('teacher.experiencePlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none" />
        </div>

        {/* Education */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.education')}</h3>
          </div>
          <textarea value={education} onChange={(e) => setEducation(e.target.value)} rows={3} placeholder={t('teacher.educationPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none" />
        </div>

        {/* Certificates */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.certificates')}</h3>
          </div>
          <textarea value={certificates} onChange={(e) => setCertificates(e.target.value)} rows={3} placeholder={t('teacher.certificatesPlaceholder')}
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none" />
        </div>

        {/* Resume Uploader */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Резюме (PDF)</h3>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
            {resumeUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <a href={resumeUrl} target="_blank" rel="noreferrer" className="block text-sm font-medium text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate">
                    {resumeFileName || 'Резюме.pdf'}
                  </a>
                  <p className="text-xs text-slate-500">Документ загружен</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Нет резюме</p>
                  <p className="text-xs text-slate-500">Загрузите файл до 5MB</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <input type="file" accept="application/pdf" ref={resumeInputRef} onChange={handleResumeChange} className="hidden" />
              {resumeUrl && (
                <button
                  onClick={() => { setResumeUrl(''); setResumeFileName(''); }}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => resumeInputRef.current?.click()}
                disabled={resumeLoading}
                className="btn-secondary text-xs flex items-center gap-2"
              >
                {resumeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {resumeUrl ? 'Заменить' : 'Загрузить PDF'}
              </button>
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
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
            <div className="space-y-3">
              {socialLinks.map((link, i) => (
                <div key={i} className="flex items-start sm:items-center gap-2 w-full">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input value={link.platform} onChange={(e) => updateLink(i, 'platform', e.target.value)} placeholder={t('teacher.platformPlaceholder')}
                      className="w-full sm:col-span-1 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                    <input value={link.url} onChange={(e) => updateLink(i, 'url', e.target.value)} placeholder="https://..."
                      className="w-full sm:col-span-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white" />
                  </div>
                  <button onClick={() => removeLink(i)} className="p-2 mt-0.5 sm:mt-0 text-slate-400 hover:text-red-500 bg-slate-50 dark:bg-slate-700/50 rounded-lg shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ))}
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

export default TeacherProfilePage;
