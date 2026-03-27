import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MapPin, Users, BookOpen, Mail, Phone, ArrowLeft, Building2,
  Wifi, UserPlus, CheckCircle, Clock, Image, FolderOpen,
  Globe, MessageCircle, Send, LogIn, ExternalLink, AlertCircle, ChevronDown,
} from 'lucide-react';
import { apiGetPublicOrgProfile, apiPublicJoin, apiGetAIManagerSettings } from '../../lib/api';
import { AIAssistantChat } from '../../components/ui/AIAssistantChat';

/* ═══════════════════════════════════════════════ */
/*  Scroll Animation Hook                          */
/* ═══════════════════════════════════════════════ */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Section({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  Page Component                                 */
/* ═══════════════════════════════════════════════ */
const PublicOrgProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [aiSettings, setAiSettings] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    apiGetPublicOrgProfile(undefined, slug)
      .then((data: any) => {
        setOrg(data);
        return apiGetAIManagerSettings(data.id);
      })
      .then((res: any) => {
        if (res && res.data) {
          setAiSettings(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleJoin = useCallback(async () => {
    if (!profile || !slug) return;
    setJoining(true);
    try {
      const result = await apiPublicJoin(slug);
      setJoinStatus(result.status);
      if (result.status === 'already_member') {
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    } catch {
      setJoinStatus('error');
    } finally {
      setJoining(false);
    }
  }, [profile, slug, navigate]);

  // Group branches by city
  const branchesByCity = React.useMemo(() => {
    if (!org?.branches) return {};
    return org.branches.reduce((acc: Record<string, any[]>, b: any) => {
      const city = b.city || t('directory.unknownCity', 'Другие');
      if (!acc[city]) acc[city] = [];
      acc[city].push(b);
      return acc;
    }, {});
  }, [org, t]);

  // All branches with coords for map
  const branchesWithCoords = React.useMemo(() => {
    if (!org?.branches) return [];
    return org.branches.filter((b: any) => b.latitude && b.longitude);
  }, [org]);

  const socialLinks = org?.contactLinks || {};
  const hasSocials = socialLinks.telegram || socialLinks.whatsapp || socialLinks.instagram || socialLinks.website;
  const hasContacts = org?.contactEmail || org?.contactPhone || hasSocials;
  const cities = org?.branchCities || [];

  /* ═══ Loading ═══ */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ═══ Not Found ═══ */
  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-gray-950 gap-4 p-4">
        <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('directory.notFound', 'Организация не найдена')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">{t('directory.notFoundDesc', 'Страница недоступна или организация не существует.')}</p>
        <button onClick={() => navigate(-1)} className="text-sky-600 hover:underline text-sm mt-2">
          ← {t('directory.backToList', 'Вернуться к каталогу')}
        </button>
      </div>
    );
  }

  /* ═══ Status Messages ═══ */
  const statusConfig: Record<string, { text: string; icon: React.ElementType; color: string; bg: string }> = {
    already_member: { text: t('directory.alreadyMember', 'Вы уже студент ✓'), icon: CheckCircle, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
    pending: { text: t('directory.pending', 'Заявка отправлена ⏳'), icon: Clock, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
    org_unavailable: { text: t('directory.orgUnavailable', 'Организация временно недоступна'), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    org_not_found: { text: t('directory.orgNotFound', 'Организация не найдена'), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    error: { text: t('directory.joinError', 'Ошибка при отправке заявки'), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  };

  /* ═══ CTA Render ═══ */
  const renderCTA = (sticky = false) => {
    if (joinStatus && statusConfig[joinStatus]) {
      const s = statusConfig[joinStatus];
      const Icon = s.icon;
      return (
        <div className={`flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl border font-semibold ${s.bg} ${s.color} ${sticky ? 'w-full' : ''}`}>
          <Icon className="w-5 h-5" />
          <span className="text-sm">{s.text}</span>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className={`flex flex-col sm:flex-row gap-2.5 ${sticky ? 'w-full' : 'w-full sm:w-auto'}`}>
          <Link
            to={`/register?orgSlug=${slug}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-2xl font-semibold hover:from-sky-700 hover:to-indigo-700 transition-all text-sm shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            {t('directory.signUpJoin', 'Зарегистрироваться и вступить')}
          </Link>
          <Link
            to={`/login?orgSlug=${slug}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-gray-700 text-slate-700 dark:text-white border border-slate-200 dark:border-gray-600 rounded-2xl font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-all text-sm hover:scale-[1.02] active:scale-[0.98]"
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
        className={`flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-2xl font-bold hover:from-sky-700 hover:to-indigo-700 transition-all disabled:opacity-50 text-base shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:scale-[1.02] active:scale-[0.98] ${sticky ? 'w-full' : ''}`}
      >
        {joining ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <UserPlus className="w-5 h-5" />
        )}
        {t('directory.joinOrg', 'Вступить в организацию')}
      </button>
    );
  };

  /* ═══ Google Maps embed URL ═══ */
  const getMapUrl = () => {
    if (branchesWithCoords.length === 0) return null;
    if (branchesWithCoords.length === 1) {
      const b = branchesWithCoords[0];
      return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${b.latitude},${b.longitude}&zoom=15`;
    }
    // Center on first branch
    const b = branchesWithCoords[0];
    return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${b.latitude},${b.longitude}&zoom=12`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">

      {/* ═══════════════════════════════════════ */}
      {/*  HEADER (Clean Professional HH Style)    */}
      {/* ═══════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 pt-6 pb-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          {/* Back */}
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mb-6">
            <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Общий каталог')}
          </button>

          {/* Top Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{org.name}</h1>
              
              <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
                {cities.length > 0 && (
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {cities.join(', ')}</span>
                )}
                {org.isOnline && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-500">
                    <Wifi className="w-4 h-4" /> {t('directory.online', 'Есть онлайн-формат')}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <FolderOpen className="w-4 h-4" /> {org.courses?.length || 0} {t('directory.coursesCount', 'курсов')}
                </span>
                {(org.branchesCount || 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" /> {org.branchesCount} {t('directory.branchCount', 'филиалов')}
                  </span>
                )}
              </div>
            </div>

            {/* Logo */}
            <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center border border-slate-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-2">
              {org.logo ? (
                <img src={org.logo} alt={org.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-12 h-12 text-slate-200 dark:text-gray-600" />
              )}
            </div>
          </div>

          {/* Subjects */}
          {org.subjects?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {org.subjects.map((s: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-slate-300 rounded text-xs font-medium border border-slate-200 dark:border-gray-700">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* CTA Row */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {renderCTA()}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  MAIN CONTENT                            */}
      {/* ═══════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── ABOUT ── */}
        {org.description && (
          <Section delay={100}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                {t('directory.about', 'О компании')}
              </h2>
              <div className={`text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line text-sm md:text-base ${!descExpanded ? 'line-clamp-4' : ''}`}>
                {org.description}
              </div>
              {org.description.length > 250 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-2 text-blue-600 dark:text-blue-400 text-sm hover:underline font-medium"
                >
                  {descExpanded ? t('common.less', 'Скрыть описание') : t('common.more', 'Показать описание полностью')}
                </button>
              )}
            </div>
          </Section>
        )}

        {/* ── COURSES ── */}
        <Section delay={200}>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t('directory.coursesTitle', 'Доступные курсы и программы')}
            </h2>
            {org.courses?.length > 0 ? (
              <div className="flex flex-col gap-3">
                {org.courses.map((c: any, i: number) => (
                  <div
                    key={c.id}
                    className="p-5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                  >
                    <h4 className="text-lg font-semibold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline mb-2">{c.title}</h4>
                    {c.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 md:line-clamp-3 leading-relaxed mb-3">
                        {c.description}
                      </p>
                    )}
                    {c.subject && (
                      <span className="inline-block px-2.5 py-1 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded text-xs font-medium">
                        {c.subject}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('directory.noCourses', 'В данный момент курсы не добавлены.')}</p>
            )}
          </div>
        </Section>

        {/* ── BRANCHES ── */}
        {Object.keys(branchesByCity).length > 0 && (
          <Section delay={300}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                {t('directory.branches', 'Филиалы и классы')} <span className="text-slate-400 font-normal text-base">{org.branches?.length || 0}</span>
              </h2>

              <div className="space-y-6">
                {Object.entries(branchesByCity).map(([city, cityBranches]: [string, any]) => (
                  <div key={city} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-5 py-4">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-gray-700">
                      {city}
                    </h3>
                    <div className="space-y-5">
                      {cityBranches.map((b: any, idx: number) => (
                        <div key={b.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-800 dark:text-slate-200">{b.name}</h4>
                            {b.address && (
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{b.address}</p>
                            )}
                            {(b.contactName || b.phone || b.whatsapp) && (
                              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                                {b.contactName && <span className="block">{t('directory.manager', 'Менеджер')}: {b.contactName}</span>}
                                {b.phone && <span className="inline-block mr-3">📞 <a href={`tel:${b.phone}`} className="hover:text-blue-600">{b.phone}</a></span>}
                                {b.whatsapp && <span className="inline-block">💬 <a href={`https://wa.me/${b.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">WhatsApp</a></span>}
                              </div>
                            )}
                          </div>
                          {b.latitude && b.longitude && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
                            >
                              <MapPin className="w-4 h-4" /> Показать на карте
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── MAP ── */}
        {branchesWithCoords.length > 0 && (
          <Section delay={400}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                {t('directory.map', 'Адреса на карте')}
              </h2>
              <div className="w-full h-[350px] bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden relative">
                {getMapUrl() ? (
                  <iframe
                    src={getMapUrl()!}
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Branch locations"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <MapPin className="w-8 h-8" />
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ── GALLERY ── */}
        {org.photos?.length > 0 && (
          <Section delay={500}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                {t('directory.photos', 'Фотографии центра')}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {org.photos.map((url: string, i: number) => (
                  <div key={i} className="aspect-w-4 aspect-h-3 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── CONTACTS ── */}
        {hasContacts && (
          <Section delay={600}>
            <div className="bg-slate-50 dark:bg-gray-800/50 p-6 rounded-lg border border-slate-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                {t('directory.contactTitle', 'Контакты')}
              </h2>
              
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                {org.contactPhone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <a href={`tel:${org.contactPhone}`} className="hover:text-blue-600">{org.contactPhone}</a>
                  </div>
                )}
                {org.contactEmail && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <a href={`mailto:${org.contactEmail}`} className="hover:text-blue-600">{org.contactEmail}</a>
                  </div>
                )}
                {socialLinks.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <a href={socialLinks.website.startsWith('http') ? socialLinks.website : `https://${socialLinks.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline">
                      {socialLinks.website}
                    </a>
                  </div>
                )}
                {socialLinks.whatsapp && (
                  <div className="flex items-center gap-3 mt-4">
                    <MessageCircle className="w-4 h-4 text-green-500" />
                    <a href={`https://wa.me/${socialLinks.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 font-medium hover:underline">
                      Написать в WhatsApp
                    </a>
                  </div>
                )}
                {socialLinks.telegram && (
                  <div className="flex items-center gap-3">
                    <Send className="w-4 h-4 text-blue-500" />
                    <a href={`https://t.me/${socialLinks.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">
                      Написать в Telegram
                    </a>
                  </div>
                )}
                {/* социальные сети  */}
                {socialLinks.instagram && (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 text-pink-500 flex items-center justify-center">📷</div>
                    <a href={`https://instagram.com/${socialLinks.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 font-medium hover:underline">
                      Instagram
                    </a>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  STICKY CTA (mobile)                     */}
      {/* ═══════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-gray-700 p-3 sm:hidden z-40 safe-area-bottom">
        {renderCTA(true)}
      </div>

      {aiSettings?.isActive && (
        <AIAssistantChat organizationId={org.id} settings={aiSettings} />
      )}
    </div>
  );
};

export default PublicOrgProfilePage;
