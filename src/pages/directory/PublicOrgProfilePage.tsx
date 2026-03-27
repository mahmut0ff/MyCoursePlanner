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
    Promise.all([
      apiGetPublicOrgProfile(undefined, slug)
        .then((data: any) => setOrg(data))
        .catch(() => {}),
      apiGetAIManagerSettings(slug)
        .then((res: any) => setAiSettings(res.data))
        .catch(() => {})
    ]).finally(() => setLoading(false));
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
      {/*  COMPACT HEADER                          */}
      {/* ═══════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {/* Back */}
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 transition mb-4">
            <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Назад')}
          </button>

          {/* Logo + Name + Meta */}
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-md">
              {org.logo ? (
                <img src={org.logo} alt={org.name} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <Building2 className="w-9 h-9 text-sky-600 dark:text-sky-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{org.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {cities.length > 0 && (
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {cities.join(' • ')}</span>
                )}
                {(org.branchesCount || 0) > 0 && (
                  <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {org.branchesCount} {t('directory.branchCount', 'филиалов')}</span>
                )}
                {org.isOnline && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Wifi className="w-3.5 h-3.5" /> {t('directory.online', 'Онлайн')}</span>
                )}
              </div>
              {/* Subjects */}
              {org.subjects?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {org.subjects.map((s: string, i: number) => (
                    <span key={i} className="px-2.5 py-0.5 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 rounded-md text-[11px] font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { value: org.studentsCount || 0, label: t('directory.students', 'Студенты'), icon: Users },
              { value: org.teachersCount || 0, label: t('directory.teachers', 'Преподаватели'), icon: BookOpen },
              { value: org.courses?.length || 0, label: t('directory.courses', 'Курсы'), icon: FolderOpen },
            ].map((s, i) => (
              <div key={i} className="text-center p-2.5 rounded-xl bg-slate-50 dark:bg-gray-800">
                <s.icon className="w-4 h-4 text-sky-500 mx-auto mb-0.5" />
                <p className="text-lg font-extrabold text-slate-900 dark:text-white">{s.value}</p>
                <p className="text-[10px] text-slate-400 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-5">
            {renderCTA()}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-32 space-y-6 mt-6">

        {/* ═══════════════════════════════════════ */}
        {/*  3. ABOUT SECTION                       */}
        {/* ═══════════════════════════════════════ */}
        {org.description && (
          <Section delay={100}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-500" /> {t('directory.about', 'О нас')}
              </h2>
              <p className={`text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line ${!descExpanded ? 'line-clamp-4' : ''}`}>
                {org.description}
              </p>
              {org.description.length > 200 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-2 text-sky-600 dark:text-sky-400 text-sm font-medium hover:underline flex items-center gap-1"
                >
                  {descExpanded ? t('common.less', 'Свернуть') : t('common.more', 'Подробнее')}
                  <ChevronDown className={`w-4 h-4 transition-transform ${descExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Working hours + address inline */}
              {(org.workingHours || org.address) && (
                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-gray-700 flex flex-wrap gap-6">
                  {org.workingHours && (
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-sky-400 mt-0.5" />
                      <div>
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{t('directory.workingHours', 'Рабочие часы')}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{org.workingHours}</p>
                      </div>
                    </div>
                  )}
                  {org.address && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-sky-400 mt-0.5" />
                      <div>
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{t('directory.address', 'Адрес')}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{org.address}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ═══════════════════════════════════════ */}
        {/*  4. COURSES                              */}
        {/* ═══════════════════════════════════════ */}
        <Section delay={200}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-sky-500" /> {t('directory.coursesTitle', 'Программы и курсы')}
            </h2>
            {org.courses?.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {org.courses.map((c: any, i: number) => (
                  <div
                    key={c.id}
                    className="group bg-gradient-to-br from-slate-50 to-white dark:from-gray-700/40 dark:to-gray-700/20 rounded-xl p-5 border border-slate-100 dark:border-gray-600/50 hover:border-sky-200 dark:hover:border-sky-800 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-default"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-1.5">{c.title}</h4>
                    {c.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{c.description}</p>
                    )}
                    {c.subject && (
                      <span className="inline-block mt-3 px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        {c.subject}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('directory.noCourses', 'Курсы скоро появятся')}</p>
              </div>
            )}
          </div>
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/*  5. BRANCHES BY CITY                     */}
        {/* ═══════════════════════════════════════ */}
        {Object.keys(branchesByCity).length > 0 && (
          <Section delay={300}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-500" /> {t('directory.branches', 'Филиалы')}
                <span className="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2.5 py-0.5 rounded-full text-xs font-bold ml-1">
                  {org.branches?.length || 0}
                </span>
              </h2>

              <div className="space-y-8">
                {Object.entries(branchesByCity).map(([city, cityBranches]: [string, any]) => (
                  <div key={city}>
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="w-4 h-4 text-sky-500" />
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        {city}
                      </h3>
                      <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-gray-700 px-2 py-0.5 rounded-full font-medium">
                        {cityBranches.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {cityBranches.map((b: any, idx: number) => (
                        <div
                          key={b.id}
                          className="group bg-gradient-to-br from-slate-50 to-white dark:from-gray-700/40 dark:to-gray-700/20 rounded-xl p-5 border border-slate-100 dark:border-gray-600/50 hover:border-sky-200 dark:hover:border-sky-800 hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
                          style={{ animationDelay: `${idx * 80}ms` }}
                        >
                          {/* Branch name + map link */}
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-900 dark:text-white">{b.name}</h4>
                            {b.latitude && b.longitude && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-sky-100 dark:hover:bg-sky-900/40 transition"
                              >
                                <MapPin className="w-3 h-3" /> Карта <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          {b.address && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{b.address}</p>
                          )}

                          {/* Manager contact card */}
                          {(b.contactName || b.phone || b.whatsapp) && (
                            <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-slate-100 dark:border-gray-700/50 space-y-2">
                              {b.contactName && (
                                <div className="flex items-center gap-2 text-sm">
                                  <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                                    <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                                  </div>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{b.contactName}</span>
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t('directory.manager', 'Менеджер')}</span>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 mt-1">
                                {b.phone && (
                                  <a
                                    href={`tel:${b.phone}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-gray-700/40 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-600 dark:hover:text-sky-400 transition"
                                  >
                                    <Phone className="w-3 h-3" /> {t('directory.call', 'Позвонить')}
                                  </a>
                                )}
                                {b.whatsapp && (
                                  <a
                                    href={`https://wa.me/${b.whatsapp.replace(/[^0-9]/g, '')}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition"
                                  >
                                    <MessageCircle className="w-3 h-3" /> WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
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

        {/* ═══════════════════════════════════════ */}
        {/*  6. GOOGLE MAP                           */}
        {/* ═══════════════════════════════════════ */}
        {branchesWithCoords.length > 0 && (
          <Section delay={400}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-sky-500" /> {t('directory.map', 'На карте')}
                </h2>
              </div>
              <div className="relative w-full h-[300px] sm:h-[400px]">
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
              {/* Address list under map */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {branchesWithCoords.map((b: any) => (
                  <a
                    key={b.id}
                    href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700/40 transition text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400"
                  >
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{b.name}{b.address ? ` — ${b.address}` : ''}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40" />
                  </a>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ═══════════════════════════════════════ */}
        {/*  7. PHOTO GALLERY                        */}
        {/* ═══════════════════════════════════════ */}
        {org.photos?.length > 0 && (
          <Section delay={500}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Image className="w-5 h-5 text-sky-500" /> {t('directory.photos', 'Фотогалерея')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {org.photos.map((url: string, i: number) => (
                  <img key={i} src={url} alt="" className="w-full h-36 sm:h-44 object-cover rounded-xl shadow-sm hover:scale-[1.03] transition-transform duration-300 cursor-pointer" />
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ═══════════════════════════════════════ */}
        {/*  8. CONTACTS                             */}
        {/* ═══════════════════════════════════════ */}
        {hasContacts && (
          <Section delay={600}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200/60 dark:border-gray-700/50 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                <Mail className="w-5 h-5 text-sky-500" /> {t('directory.contactTitle', 'Контакты')}
              </h2>

              {/* Primary contact actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                {org.contactPhone && (
                  <a href={`tel:${org.contactPhone}`}
                    className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border border-green-200 dark:border-green-800/40 rounded-2xl hover:shadow-md hover:scale-[1.02] transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                      <Phone className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-green-600/70 dark:text-green-400/70 font-semibold">{t('directory.call', 'Позвонить')}</p>
                      <p className="text-sm font-bold text-green-800 dark:text-green-300">{org.contactPhone}</p>
                    </div>
                  </a>
                )}
                {socialLinks.whatsapp && (
                  <a href={`https://wa.me/${socialLinks.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border border-green-200 dark:border-green-800/40 rounded-2xl hover:shadow-md hover:scale-[1.02] transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-green-600/70 dark:text-green-400/70 font-semibold">WhatsApp</p>
                      <p className="text-sm font-bold text-green-800 dark:text-green-300">{t('directory.writeNow', 'Написать сейчас')}</p>
                    </div>
                  </a>
                )}
              </div>

              {/* Secondary contacts */}
              <div className="flex flex-wrap gap-3">
                {org.contactEmail && (
                  <a href={`mailto:${org.contactEmail}`} className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition group">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <span className="group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">{org.contactEmail}</span>
                  </a>
                )}
                {socialLinks.telegram && (
                  <a href={`https://t.me/${socialLinks.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Send className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="group-hover:text-blue-500 transition">Telegram</span>
                  </a>
                )}
                {socialLinks.instagram && (
                  <a href={`https://instagram.com/${socialLinks.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-pink-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </div>
                    <span className="group-hover:text-pink-600 transition">Instagram</span>
                  </a>
                )}
                {socialLinks.website && (
                  <a href={socialLinks.website.startsWith('http') ? socialLinks.website : `https://${socialLinks.website}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-gray-700/40 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <span className="group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">{t('directory.website', 'Веб-сайт')}</span>
                  </a>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Empty state: no branches, no courses, no contacts */}
        {!org.courses?.length && Object.keys(branchesByCity).length === 0 && !hasContacts && (
          <Section delay={200}>
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('directory.noDetails', 'Подробная информация скоро появится')}</p>
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
