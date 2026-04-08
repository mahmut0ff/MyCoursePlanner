import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MapPin, Mail, Phone, ArrowLeft, Building2,
  UserPlus, CheckCircle, Clock, FolderOpen,
  Globe, MessageCircle, Send, LogIn, AlertCircle,
  FileText, Image as ImageIcon, Map, PhoneCall, LayoutList,
  CameraOff
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
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const requestedRole = searchParams.get('role') || profile?.role || 'student';
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
      const result = await apiPublicJoin(slug, requestedRole);
      setJoinStatus(result.status);
      if (result.status === 'already_member') {
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    } catch {
      setJoinStatus('error');
    } finally {
      setJoining(false);
    }
  }, [profile, slug, navigate, requestedRole]);

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
    already_member: { text: t('directory.alreadyMember', 'Вы уже участник ✓'), icon: CheckCircle, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
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
        <div className={`flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl border font-semibold ${s.bg} ${s.color} ${sticky ? 'w-full' : ''}`}>
          <Icon className="w-5 h-5" />
          <span className="text-sm">{s.text}</span>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className={`flex flex-col gap-2.5 ${sticky ? 'w-full' : 'w-full sm:w-auto'}`}>
          <Link
            to={`/register?orgSlug=${slug}${requestedRole === 'teacher' ? '&role=teacher' : ''}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm shadow-sm active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            {requestedRole === 'teacher' ? t('directory.signUpJoinTeacher', 'Регистрация для преподавателей') : t('directory.signUpJoin', 'Зарегистрироваться и вступить')}
          </Link>
          <Link
            to={`/login?orgSlug=${slug}${requestedRole === 'teacher' ? '&role=teacher' : ''}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-gray-800 text-slate-700 dark:text-white border border-slate-200 dark:border-gray-700 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors text-sm active:scale-[0.98]"
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
        className={`flex items-center justify-center gap-2.5 px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 text-base shadow-sm active:scale-[0.98] ${sticky ? 'w-full' : ''}`}
      >
        {joining ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <UserPlus className="w-5 h-5" />
        )}
        {requestedRole === 'teacher' ? t('directory.joinTeacher', 'Подать заявку (Преподаватель)') : t('directory.joinOrg', 'Вступить в организацию')}
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

  /* ═══ Cover Color ═══ */
  const getCoverColor = (id: string = '') => {
    const colors = [
      'from-blue-600 to-indigo-700',
      'from-emerald-600 to-teal-700',
      'from-rose-600 to-pink-700',
      'from-violet-600 to-fuchsia-700',
      'from-sky-600 to-blue-700',
    ];
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return colors[sum % colors.length];
  };

  /* ═══ Empty State Widget ═══ */
  const EmptyState = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex flex-col items-center justify-center py-10 px-4 bg-white/50 dark:bg-gray-800/30 border border-slate-200 dark:border-gray-700/50 rounded-2xl border-dashed">
      <div className="w-14 h-14 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-slate-100 dark:border-gray-700 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-center">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">{desc}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120]">

      {/* ═══════════════════════════════════════ */}
      {/*  COVER IMAGE & TOP NAV                   */}
      {/* ═══════════════════════════════════════ */}
      <div className={`relative h-48 sm:h-64 bg-gradient-to-r ${getCoverColor(org.id)} overflow-hidden`}>
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.15] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')] mix-blend-overlay"></div>
        {/* Bottom gradient fade for soft blend */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent"></div>

        {/* Back Button (Floating on Cover) */}
        <div className="absolute top-4 sm:top-6 left-4 sm:left-6 z-10">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition-all sm:w-auto sm:px-4 sm:gap-2"
          >
            <ArrowLeft className="w-5 h-5" /> 
            <span className="hidden sm:inline font-medium text-sm">{t('common.back', 'Общий каталог')}</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  PROFILE HEADER                          */}
      {/* ═══════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative -mt-16 sm:-mt-20 z-10 pb-20">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-gray-800 mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative">
            
            {/* Logo */}
            <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 bg-white dark:bg-gray-800 border-4 border-slate-100 dark:border-gray-800 rounded-xl shadow-sm flex items-center justify-center overflow-hidden p-2 -mt-16 sm:-mt-20">
              {org.logo ? (
                <img src={org.logo} alt={org.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-12 h-12 text-slate-300 dark:text-gray-600" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">{org.name}</h1>
              
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                {cities.length > 0 && (
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-rose-500" /> {cities.join(', ')}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-blue-500" /> {org.courses?.length || 0} {t('directory.coursesCount', 'курсов')}
                </span>
                {(org.branchesCount || 0) > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-500" /> {org.branchesCount} {t('directory.branchCount', 'филиалов')}
                  </span>
                )}
              </div>

              {/* Subjects */}
              {org.subjects?.length > 0 && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                  {org.subjects.map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-medium border border-slate-200 dark:border-gray-700">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* CTA Desktop */}
            <div className="hidden sm:block shrink-0 mt-2 sm:mt-0 lg:hidden">
               {renderCTA()}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════ */}
        {/*  MAIN CONTENT & SIDEBAR                  */}
        {/* ═══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* ── Main Column ── */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            
            {/* ── ABOUT ── */}
            <Section delay={100}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-gray-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  {t('directory.about', 'О компании')}
                </h2>
                {org.description ? (
                  <div>
                    <div className={`text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base ${!descExpanded ? 'line-clamp-4' : ''}`}>
                      {org.description}
                    </div>
                    {org.description.length > 250 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="mt-3 text-blue-600 dark:text-blue-400 text-sm hover:underline font-medium"
                      >
                        {descExpanded ? t('common.less', 'Скрыть описание') : t('common.more', 'Читать полностью')}
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState 
                    icon={FileText} 
                    title="Нет описания"
                    desc="Организация пока не добавила информацию о себе. Детали появятся позже."
                  />
                )}
              </div>
            </Section>

            {/* ── COURSES ── */}
            <Section delay={200}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-gray-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                  <LayoutList className="w-5 h-5 text-indigo-500" />
                  {t('directory.coursesTitle', 'Доступные курсы и программы')}
                </h2>
                {org.courses?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {org.courses.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-5 bg-slate-50/50 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700/60 rounded-2xl hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors group"
                      >
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">{c.title}</h4>
                        {c.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                            {c.description}
                          </p>
                        )}
                        {c.subject && (
                          <span className="inline-flex items-center px-2.5 py-1 bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded text-xs font-medium border border-slate-200 dark:border-gray-600">
                            {c.subject}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState 
                    icon={LayoutList} 
                    title="Курсы не добавлены"
                    desc="В данный момент открытых курсов нет. Мы обновим страницу, когда они появятся."
                  />
                )}
              </div>
            </Section>

            {/* ── BRANCHES ── */}
            <Section delay={300}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-gray-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-500" />
                  {t('directory.branches', 'Филиалы и классы')} 
                  {org.branches?.length > 0 && <span className="text-slate-400 font-normal text-base ml-1">{org.branches.length}</span>}
                </h2>

                {Object.keys(branchesByCity).length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(branchesByCity).map(([city, cityBranches]: [string, any]) => (
                      <div key={city} className="bg-slate-50/50 dark:bg-gray-800/30 border border-slate-200 dark:border-gray-700/60 rounded-2xl p-5">
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-500" /> {city}
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {cityBranches.map((b: any) => (
                            <div key={b.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-xl p-4 flex flex-col justify-between">
                              <div>
                                <h4 className="font-semibold text-slate-900 dark:text-white">{b.name}</h4>
                                {b.address && (
                                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{b.address}</p>
                                )}
                              </div>
                              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-gray-700 flex flex-wrap gap-y-2 gap-x-4">
                                {b.phone && (
                                  <a href={`tel:${b.phone}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400">
                                    <Phone className="w-3.5 h-3.5" /> {b.phone}
                                  </a>
                                )}
                                {b.latitude && b.longitude && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    <Map className="w-3.5 h-3.5" /> Открыть карту
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState 
                    icon={Map} 
                    title="Нет филиалов"
                    desc="Организация еще не указала адреса своих учебных центров."
                  />
                )}
              </div>
            </Section>

            {/* ── GALLERY ── */}
            <Section delay={500}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-gray-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-purple-500" />
                  {t('directory.photos', 'Фотографии центра')}
                </h2>
                {org.photos?.length > 0 ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {org.photos.map((url: string, i: number) => (
                      <div key={i} className="aspect-w-4 aspect-h-3 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                        <img src={url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState 
                    icon={CameraOff} 
                    title="Нет фотографий"
                    desc="Автор пока не загрузил фотографии учебных классов или процесса."
                  />
                )}
              </div>
            </Section>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-6 sm:space-y-8">
            <div className="sticky top-24 space-y-6 sm:space-y-8">
              
              {/* Actions Desktop */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-gray-800 hidden lg:block">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                  Действия
                </h3>
                {renderCTA(true)}
              </div>

              {/* ── CONTACTS ── */}
              <Section delay={600}>
                <div className="bg-slate-50 dark:bg-gray-800/80 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-gray-800">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <PhoneCall className="w-5 h-5 text-sky-500" />
                    {t('directory.contactTitle', 'Контакты связи')}
                  </h2>
                  
                  {hasContacts ? (
                    <div className="flex flex-col gap-4">
                      {org.contactPhone && (
                        <a href={`tel:${org.contactPhone}`} className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-sky-300 dark:hover:border-sky-600 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                            <Phone className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Телефон</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{org.contactPhone}</p>
                          </div>
                        </a>
                      )}
                      {org.contactEmail && (
                        <a href={`mailto:${org.contactEmail}`} className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Почта</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={org.contactEmail}>{org.contactEmail}</p>
                          </div>
                        </a>
                      )}
                      {socialLinks.website && (
                        <a href={socialLinks.website.startsWith('http') ? socialLinks.website : `https://${socialLinks.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Веб-сайт</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={socialLinks.website}>{socialLinks.website}</p>
                          </div>
                        </a>
                      )}
                      {socialLinks.whatsapp && (
                        <a href={`https://wa.me/${socialLinks.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-green-400 dark:hover:border-green-600 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                            <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-500" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">WhatsApp</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Написать</p>
                          </div>
                        </a>
                      )}
                      {socialLinks.telegram && (
                        <a href={`https://t.me/${socialLinks.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-500 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <Send className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Telegram</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Написать</p>
                          </div>
                        </a>
                      )}
                      {socialLinks.instagram && (
                        <a href={`https://instagram.com/${socialLinks.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl hover:border-pink-300 dark:hover:border-pink-500 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center shrink-0">
                            <div className="w-5 h-5 text-pink-500 dark:text-pink-400 flex items-center justify-center font-bold">📷</div>
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Instagram</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Перейти</p>
                          </div>
                        </a>
                      )}
                    </div>
                  ) : (
                    <EmptyState 
                      icon={Mail} 
                      title="Контакты не указаны"
                      desc="Организация пока не разместила свои контактные данные."
                    />
                  )}
                </div>
              </Section>

              {/* ── MAP ── */}
              {org.branches?.length > 0 && (
                <Section delay={400}>
                  <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Map className="w-5 h-5 text-rose-500" />
                      {t('directory.map', 'Карта')}
                    </h2>
                    <div className="w-full h-[300px] bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden relative">
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
                        <EmptyState 
                          icon={MapPin} 
                          title="Карта"
                          desc="Нет координат."
                        />
                      )}
                    </div>
                  </div>
                </Section>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  STICKY CTA (mobile)                     */}
      {/* ═══════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-gray-800/50 p-4 lg:hidden z-40 safe-area-bottom shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        {renderCTA(true)}
      </div>

      {aiSettings?.isActive && (
        <AIAssistantChat organizationId={org.id} settings={aiSettings} />
      )}
    </div>
  );
};

export default PublicOrgProfilePage;
