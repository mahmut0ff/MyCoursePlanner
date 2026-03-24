import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MapPin, Users, BookOpen, Mail, Phone, ArrowLeft, Building2,
  Wifi, CalendarDays, UserPlus, CheckCircle, Clock, Image, FolderOpen,
} from 'lucide-react';
import { apiGetPublicOrgProfile, apiApplyToOrg } from '../../lib/api';

const PublicOrgProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!slugOrId) return;
    apiGetPublicOrgProfile(slugOrId, slugOrId)
      .then((data: any) => setOrg(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slugOrId]);

  const handleApply = async () => {
    if (!org || !profile) {
      navigate('/register');
      return;
    }
    setApplying(true);
    try {
      await apiApplyToOrg(org.id, 'student');
      setApplied(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-gray-950 gap-4">
        <Building2 className="w-16 h-16 text-slate-300" />
        <p className="text-slate-500 text-lg">{t('directory.notFound', 'Организация не найдена')}</p>
        <button onClick={() => navigate('/directory')} className="text-violet-600 hover:underline text-sm">
          ← {t('directory.backToList', 'Вернуться к каталогу')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      {/* Banner */}
      <div className="relative h-48 sm:h-56 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 overflow-hidden">
        {org.banner && (
          <img src={org.banner} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute top-4 left-4">
          <button onClick={() => navigate('/directory')} className="flex items-center gap-1 text-white/80 hover:text-white text-sm bg-black/20 px-3 py-1.5 rounded-lg backdrop-blur-sm">
            <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Назад')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-16 relative z-10 pb-16">
        {/* ═══ Hero Card ═══ */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg">
                {org.logo ? (
                  <img src={org.logo} alt={org.name} className="w-20 h-20 object-cover rounded-2xl" />
                ) : (
                  <Building2 className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{org.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {org.city && (
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {org.city}{org.country && `, ${org.country}`}</span>
                  )}
                  {org.isOnline && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><Wifi className="w-4 h-4" /> {t('directory.online', 'Онлайн')}</span>
                  )}
                  {org.createdAt && (
                    <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" /> {new Date(org.createdAt).getFullYear()}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {applied ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle className="w-5 h-5" />
                    {t('directory.applied', 'Заявка отправлена')}
                  </div>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition disabled:opacity-50"
                  >
                    {applying ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {t('directory.apply', 'Подать заявку')}
                  </button>
                )}
              </div>
            </div>

            {/* Subjects Tags */}
            {org.subjects?.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {org.subjects.map((s: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              {[
                { icon: Users, label: t('directory.students', 'Студенты'), value: org.studentsCount },
                { icon: BookOpen, label: t('directory.teachers', 'Преподаватели'), value: org.teachersCount },
                { icon: FolderOpen, label: t('directory.courses', 'Курсы'), value: org.courses?.length || 0 },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-xl bg-slate-50 dark:bg-gray-700/30">
                  <s.icon className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value || 0}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Description ═══ */}
        {org.description && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-500" /> {t('directory.about', 'Об организации')}
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{org.description}</p>
          </div>
        )}

        {/* ═══ Working Hours & Address ═══ */}
        {(org.workingHours || org.address) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-500" /> {t('directory.schedule', 'Расписание и адрес')}
            </h3>
            <div className="space-y-3">
              {org.workingHours && (
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-0.5">{t('directory.workingHours', 'Рабочие часы')}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{org.workingHours}</p>
                  </div>
                </div>
              )}
              {org.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-0.5">{t('directory.address', 'Адрес')}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{org.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Courses ═══ */}
        {org.courses?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-violet-500" /> {t('directory.coursesTitle', 'Программы и курсы')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {org.courses.map((c: any) => (
                <div key={c.id} className="bg-slate-50 dark:bg-gray-700/30 rounded-xl p-4">
                  <h4 className="font-medium text-slate-900 dark:text-white text-sm mb-1">{c.title}</h4>
                  {c.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{c.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Photo Gallery ═══ */}
        {org.photos?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Image className="w-4 h-4 text-violet-500" /> {t('directory.photos', 'Фотогалерея')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {org.photos.map((url: string, i: number) => (
                <img key={i} src={url} alt="" className="w-full h-32 sm:h-40 object-cover rounded-xl shadow-sm" />
              ))}
            </div>
          </div>
        )}

        {/* ═══ Contacts ═══ */}
        {(org.contactEmail || org.contactPhone) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4 text-violet-500" /> {t('directory.contactTitle', 'Контакты')}
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
              {org.contactEmail && (
                <a href={`mailto:${org.contactEmail}`} className="flex items-center gap-2.5 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 transition">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  {org.contactEmail}
                </a>
              )}
              {org.contactPhone && (
                <a href={`tel:${org.contactPhone}`} className="flex items-center gap-2.5 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 transition">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  {org.contactPhone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicOrgProfilePage;
