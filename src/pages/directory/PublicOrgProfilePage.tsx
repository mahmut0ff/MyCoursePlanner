import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MapPin, Mail, Phone, ArrowLeft, Building2,
  UserPlus, CheckCircle, Clock, FolderOpen,
  Globe, MessageCircle, Send, LogIn, AlertCircle,
  FileText, Image as ImageIcon, Map, PhoneCall, LayoutList,
  CameraOff, ChevronRight, ExternalLink, Sparkles
} from 'lucide-react';
import { apiGetPublicOrgProfile, apiPublicJoin, apiGetAIManagerSettings } from '../../lib/api';
import { AIAssistantChat } from '../../components/ui/AIAssistantChat';

/* ═══ Scroll Animation ═══ */
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

/* ═══ Cover Color ═══ */
const coverColors = [
  'from-blue-600 via-indigo-600 to-violet-700',
  'from-emerald-600 via-teal-600 to-cyan-700',
  'from-rose-600 via-pink-600 to-fuchsia-700',
  'from-violet-600 via-purple-600 to-indigo-700',
  'from-sky-600 via-blue-600 to-indigo-700',
];
function getCoverColor(id: string = '') {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return coverColors[sum % coverColors.length];
}

/* ═══ Page ═══ */
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
        if (res && res.data) setAiSettings(res.data);
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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ═══ Not Found ═══ */
  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 p-4">
        <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('directory.notFound', 'Организация не найдена')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">{t('directory.notFoundDesc', 'Страница недоступна или организация не существует.')}</p>
        <button onClick={() => navigate(-1)} className="text-indigo-600 hover:underline text-sm mt-2">
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
  const renderCTA = (full = false) => {
    if (joinStatus && statusConfig[joinStatus]) {
      const s = statusConfig[joinStatus];
      const Icon = s.icon;
      return (
        <div className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl border font-semibold ${s.bg} ${s.color} ${full ? 'w-full' : ''}`}>
          <Icon className="w-5 h-5" />
          <span className="text-sm">{s.text}</span>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className={`flex flex-col gap-2.5 ${full ? 'w-full' : 'w-full sm:w-auto'}`}>
          <Link
            to={`/register?orgSlug=${slug}${requestedRole === 'teacher' ? '&role=teacher' : ''}`}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all text-sm shadow-sm active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            {requestedRole === 'teacher' ? t('directory.signUpJoinTeacher', 'Регистрация для преподавателей') : t('directory.signUpJoin', 'Зарегистрироваться и вступить')}
          </Link>
          <Link
            to={`/login?orgSlug=${slug}${requestedRole === 'teacher' ? '&role=teacher' : ''}`}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-sm active:scale-[0.98]"
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
        className={`flex items-center justify-center gap-2.5 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 text-sm shadow-sm active:scale-[0.98] ${full ? 'w-full' : ''}`}
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

  /* ═══ Map URL ═══ */
  const getMapUrl = () => {
    if (branchesWithCoords.length === 0) return null;
    const b = branchesWithCoords[0];
    return `https://www.openstreetmap.org/export/embed.html?bbox=${Number(b.longitude) - 0.02},${Number(b.latitude) - 0.015},${Number(b.longitude) + 0.02},${Number(b.latitude) + 0.015}&layer=mapnik&marker=${b.latitude},${b.longitude}`;
  };

  /* ═══ Empty State ═══ */
  const EmptyState = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1 text-center">{title}</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-xs">{desc}</p>
    </div>
  );

  /* ═══ Contact Row ═══ */
  const ContactRow = ({ href, icon: Icon, label, value, hoverBorder }: { href: string; icon: any; label: string; value: string; hoverBorder: string }) => (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:${hoverBorder} transition-all group`}>
      <div className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <Icon className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="overflow-hidden flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{value}</p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );

  return (
    <div className="space-y-6 pb-20 lg:pb-6">

      {/* ═══ Cover + Profile Header ═══ */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${getCoverColor(org.id)}`}>
        {/* Decorative overlays */}
        <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_80%_20%,white_0%,transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_20%_80%,white_0%,transparent_40%)]" />
        
        <div className="relative z-10 p-6 sm:p-8">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white rounded-xl text-sm font-medium transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t('common.back', 'Назад')}</span>
            </button>

            {/* Desktop CTA (on cover) */}
            <div className="hidden lg:block">
              {renderCTA()}
            </div>
          </div>

          {/* Profile info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
            {/* Logo */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border-4 border-white/30 flex items-center justify-center overflow-hidden p-2 shrink-0">
              {org.logo ? (
                <img src={org.logo} alt={org.name} className="w-full h-full object-contain rounded-xl" />
              ) : (
                <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              )}
            </div>

            {/* Text */}
            <div className="text-center sm:text-left pb-1 flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 drop-shadow-sm">{org.name}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1.5 text-sm text-white/80">
                {cities.length > 0 && (
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {cities.join(', ')}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" /> {org.courses?.length || 0} {t('directory.coursesCount', 'курсов')}
                </span>
                {(org.branchesCount || 0) > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> {org.branchesCount} {t('directory.branchCount', 'филиалов')}
                  </span>
                )}
              </div>

              {/* Subject tags */}
              {org.subjects?.length > 0 && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                  {org.subjects.map((s: string, i: number) => (
                    <span key={i} className="px-2.5 py-0.5 bg-white/15 backdrop-blur-sm text-white rounded-md text-xs font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CTA for tablet (between cover and content) ═══ */}
      <div className="hidden sm:block lg:hidden">
        {renderCTA(true)}
      </div>

      {/* ═══ MAIN CONTENT + SIDEBAR ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        
        {/* ── Main Column ── */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* ABOUT */}
          <Section delay={100}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                {t('directory.about', 'О компании')}
              </h2>
              {org.description ? (
                <div>
                  <div className={`text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm ${!descExpanded ? 'line-clamp-4' : ''}`}>
                    {org.description}
                  </div>
                  {org.description.length > 250 && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="mt-3 text-indigo-600 dark:text-indigo-400 text-sm hover:underline font-medium"
                    >
                      {descExpanded ? t('common.less', 'Скрыть') : t('common.more', 'Читать полностью')}
                    </button>
                  )}
                </div>
              ) : (
                <EmptyState icon={FileText} title="Нет описания" desc="Организация пока не добавила информацию о себе." />
              )}
            </div>
          </Section>

          {/* COURSES */}
          <Section delay={200}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-violet-500" />
                {t('directory.coursesTitle', 'Курсы и программы')}
              </h2>
              {org.courses?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {org.courses.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-4 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-700/60 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">{c.title}</h4>
                          {c.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">{c.description}</p>
                          )}
                          {c.subject && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-[11px] font-medium border border-slate-200/80 dark:border-slate-600">
                              {c.subject}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5 group-hover:text-indigo-500 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={LayoutList} title="Курсы не добавлены" desc="Открытых курсов пока нет." />
              )}
            </div>
          </Section>

          {/* BRANCHES */}
          <Section delay={300}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-500" />
                {t('directory.branches', 'Филиалы')}
                {org.branches?.length > 0 && <span className="text-slate-400 font-normal text-sm ml-1">{org.branches.length}</span>}
              </h2>

              {Object.keys(branchesByCity).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(branchesByCity).map(([city, cityBranches]: [string, any]) => (
                    <div key={city}>
                      <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" /> {city}
                      </h3>
                      <div className="space-y-2">
                        {cityBranches.map((b: any) => (
                          <div key={b.id} className="p-3.5 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-700/60 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{b.name}</h4>
                            {b.address && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{b.address}</p>}
                            <div className="mt-2.5 flex flex-wrap gap-3">
                              {b.phone && (
                                <a href={`tel:${b.phone}`} className="flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 font-medium transition-colors">
                                  <Phone className="w-3 h-3" /> {b.phone}
                                </a>
                              )}
                              {b.latitude && b.longitude && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400 font-medium"
                                >
                                  <Map className="w-3 h-3" /> Карта
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
                <EmptyState icon={Map} title="Нет филиалов" desc="Адреса учебных центров не указаны." />
              )}
            </div>
          </Section>

          {/* GALLERY */}
          <Section delay={400}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-500" />
                {t('directory.photos', 'Фотографии')}
              </h2>
              {org.photos?.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {org.photos.map((url: string, i: number) => (
                    <div key={i} className="aspect-[4/3] border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={CameraOff} title="Нет фотографий" desc="Фотографии пока не загружены." />
              )}
            </div>
          </Section>
        </div>

        {/* ── Sidebar ── */}
        <div>
          <div className="sticky top-4 space-y-4">
            
            {/* CTA (desktop sidebar) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 hidden lg:block">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('directory.actions', 'Действия')}</h3>
              </div>
              {renderCTA(true)}
            </div>

            {/* Contacts */}
            <Section delay={500}>
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-sky-500" />
                  {t('directory.contactTitle', 'Контакты')}
                </h2>
                
                {hasContacts ? (
                  <div className="flex flex-col gap-2.5">
                    {org.contactPhone && (
                      <ContactRow href={`tel:${org.contactPhone}`} icon={Phone} label="Телефон" value={org.contactPhone} hoverBorder="border-sky-300" />
                    )}
                    {org.contactEmail && (
                      <ContactRow href={`mailto:${org.contactEmail}`} icon={Mail} label="Почта" value={org.contactEmail} hoverBorder="border-indigo-300" />
                    )}
                    {socialLinks.website && (
                      <ContactRow href={socialLinks.website.startsWith('http') ? socialLinks.website : `https://${socialLinks.website}`} icon={Globe} label="Веб-сайт" value={socialLinks.website} hoverBorder="border-emerald-300" />
                    )}
                    {socialLinks.whatsapp && (
                      <ContactRow href={`https://wa.me/${socialLinks.whatsapp.replace(/[^0-9]/g, '')}`} icon={MessageCircle} label="WhatsApp" value="Написать" hoverBorder="border-green-400" />
                    )}
                    {socialLinks.telegram && (
                      <ContactRow href={`https://t.me/${socialLinks.telegram.replace(/^@/, '')}`} icon={Send} label="Telegram" value="Написать" hoverBorder="border-blue-300" />
                    )}
                    {socialLinks.instagram && (
                      <ContactRow href={`https://instagram.com/${socialLinks.instagram.replace(/^@/, '')}`} icon={ImageIcon} label="Instagram" value="Перейти" hoverBorder="border-pink-300" />
                    )}
                  </div>
                ) : (
                  <EmptyState icon={Mail} title="Контакты не указаны" desc="Контактные данные пока не добавлены." />
                )}
              </div>
            </Section>

            {/* Map */}
            {org.branches?.length > 0 && (
              <Section delay={600}>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Map className="w-4 h-4 text-rose-500" />
                    {t('directory.map', 'Карта')}
                  </h2>
                  <div className="w-full h-[220px] bg-slate-50 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden relative">
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
                      <EmptyState icon={MapPin} title="Карта" desc="Нет координат." />
                    )}
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Sticky Mobile CTA ═══ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-700/50 p-4 sm:hidden z-40 safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        {renderCTA(true)}
      </div>

      {aiSettings?.isActive && (
        <AIAssistantChat organizationId={org.id} settings={aiSettings} />
      )}
    </div>
  );
};

export default PublicOrgProfilePage;
