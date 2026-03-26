import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MapPin, Users, BookOpen, Mail, Phone, ArrowLeft, Building2,
  Wifi, CalendarDays, UserPlus, CheckCircle, Clock, Image, FolderOpen,
  Globe, MessageCircle, Send, LogIn, ExternalLink, AlertCircle,
} from 'lucide-react';
import { apiGetPublicOrgProfile, apiPublicJoin } from '../../lib/api';

const PublicOrgProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiGetPublicOrgProfile(undefined, slug)
      .then((data: any) => setOrg(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleJoin = async () => {
    if (!profile) return;
    if (!slug) return;
    setJoining(true);
    try {
      const result = await apiPublicJoin(slug);
      setJoinStatus(result.status);
      if (result.status === 'already_member') {
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    } catch (e) {
      setJoinStatus('error');
    } finally {
      setJoining(false);
    }
  };

  // Social link helpers
  const socialLinks = org?.contactLinks || {};
  const hasSocials = socialLinks.telegram || socialLinks.whatsapp || socialLinks.instagram || socialLinks.website;
  const hasContacts = org?.contactEmail || org?.contactPhone || hasSocials;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-gray-950 gap-4 p-4">
        <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('directory.notFound', 'Организация не найдена')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">{t('directory.notFoundDesc', 'Страница недоступна или организация не существует.')}</p>
        <button onClick={() => navigate('/directory')} className="text-violet-600 hover:underline text-sm mt-2">
          ← {t('directory.backToList', 'Вернуться к каталогу')}
        </button>
      </div>
    );
  }

  // Join status messages
  const statusMessages: Record<string, { text: string; icon: React.ElementType; color: string }> = {
    already_member: { text: t('directory.alreadyMember', 'Вы уже в этой организации. Переходим...'), icon: CheckCircle, color: 'text-blue-600 dark:text-blue-400' },
    pending: { text: t('directory.pending', 'Заявка отправлена! Ожидайте подтверждения от администратора.'), icon: Clock, color: 'text-amber-600 dark:text-amber-400' },
    org_unavailable: { text: t('directory.orgUnavailable', 'Организация временно недоступна'), icon: AlertCircle, color: 'text-red-500' },
    org_not_found: { text: t('directory.orgNotFound', 'Организация не найдена'), icon: AlertCircle, color: 'text-red-500' },
    error: { text: t('directory.joinError', 'Ошибка при отправке заявки'), icon: AlertCircle, color: 'text-red-500' },
  };

  const renderCTA = () => {
    if (joinStatus && statusMessages[joinStatus]) {
      const status = statusMessages[joinStatus];
      const Icon = status.icon;
      return (
        <div className={`flex items-center gap-2 font-medium ${status.color}`}>
          <Icon className="w-5 h-5" />
          <span className="text-sm">{status.text}</span>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Link
            to={`/register?orgSlug=${slug}`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition text-sm"
          >
            <UserPlus className="w-4 h-4" />
            {t('directory.signUpJoin', 'Зарегистрироваться и вступить')}
          </Link>
          <Link
            to={`/login?orgSlug=${slug}`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-gray-700 text-slate-700 dark:text-white border border-slate-200 dark:border-gray-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-gray-600 transition text-sm"
          >
            <LogIn className="w-4 h-4" />
            {t('directory.loginJoin', 'Войти и вступить')}
          </Link>
        </div>
      );
    }

    return (
      <button
        onClick={handleJoin}
        disabled={joining}
        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition disabled:opacity-50 text-sm"
      >
        {joining ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <UserPlus className="w-4 h-4" />
        )}
        {t('directory.joinOrg', 'Подать заявку')}
      </button>
    );
  };

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
              <div className="flex-1 min-w-0">
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
                {renderCTA()}
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

        {/* ═══ Contacts & Social Links ═══ */}
        {hasContacts && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 mt-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-violet-500" /> {t('directory.contactTitle', 'Контакты')}
            </h3>
            <div className="flex flex-wrap gap-3">
              {org.contactEmail && (
                <a href={`mailto:${org.contactEmail}`} className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">{org.contactEmail}</span>
                </a>
              )}
              {org.contactPhone && (
                <a href={`tel:${org.contactPhone}`} className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="group-hover:text-green-600 dark:group-hover:text-green-400 transition">{org.contactPhone}</span>
                </a>
              )}
              {socialLinks.telegram && (
                <a href={`https://t.me/${socialLinks.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Send className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="group-hover:text-blue-500 transition">Telegram</span>
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              )}
              {socialLinks.whatsapp && (
                <a href={`https://wa.me/${socialLinks.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-green-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="group-hover:text-green-600 transition">WhatsApp</span>
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              )}
              {socialLinks.instagram && (
                <a href={`https://instagram.com/${socialLinks.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-pink-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </div>
                  <span className="group-hover:text-pink-600 transition">Instagram</span>
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              )}
              {socialLinks.website && (
                <a href={socialLinks.website.startsWith('http') ? socialLinks.website : `https://${socialLinks.website}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition group">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">{t('directory.website', 'Веб-сайт')}</span>
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* ═══ Bottom CTA (mobile-friendly sticky) ═══ */}
        {!joinStatus && !profile && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-gray-700 p-4 sm:hidden z-50">
            <div className="flex gap-2">
              <Link
                to={`/register?orgSlug=${slug}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-medium text-sm"
              >
                <UserPlus className="w-4 h-4" />
                {t('directory.signUp', 'Регистрация')}
              </Link>
              <Link
                to={`/login?orgSlug=${slug}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-white rounded-xl font-medium text-sm"
              >
                <LogIn className="w-4 h-4" />
                {t('directory.login', 'Войти')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicOrgProfilePage;
