import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Users, BookOpen, Building2, Wifi, ArrowRight } from 'lucide-react';
import { apiGetOrgDirectory } from '../../lib/api';

interface OrgCard {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo: string;
  city: string;
  country: string;
  isOnline: boolean;
  subjects: string[];
  branchCities?: string[];
  branchesCount?: number;
  studentsCount: number;
  teachersCount: number;
}

/* ═══ Scroll-reveal hook ═══ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.05, rootMargin: '0px 0px -30px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

/* ═══ Animated Card wrapper ═══ */
function AnimCard({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${Math.min(index * 70, 350)}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══ Shimmer skeleton ═══ */
const CardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden animate-pulse">
    <div className="p-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-3/4" />
          <div className="h-3 bg-slate-100 dark:bg-slate-700/60 rounded-lg w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full" />
        <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-4/5" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 bg-slate-100 dark:bg-slate-700/50 rounded-full w-16" />
        <div className="h-6 bg-slate-100 dark:bg-slate-700/50 rounded-full w-20" />
      </div>
    </div>
    <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-700/50 flex gap-4">
      <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-20" />
      <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-24" />
    </div>
  </div>
);

/* ═══ Main Page ═══ */
const OrganizationsDirectoryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');

  useEffect(() => {
    apiGetOrgDirectory()
      .then((data: any) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ─── Derive unique cities from branches ─── */
  const uniqueCities = React.useMemo(() => {
    const cities = new Set<string>();
    orgs.forEach(o => {
      if (o.branchCities && o.branchCities.length > 0) {
        o.branchCities.forEach(c => cities.add(c));
      } else if (o.city) {
        cities.add(o.city);
      }
    });
    return Array.from(cities).sort();
  }, [orgs]);

  /* ─── Filtering ─── */
  const filtered = orgs.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q) ||
      o.description?.toLowerCase().includes(q) ||
      o.subjects?.some(s => s.toLowerCase().includes(q)) ||
      o.branchCities?.some(c => c.toLowerCase().includes(q));
    const matchCity = selectedCity === 'all' || (o.branchCities?.includes(selectedCity) || o.city === selectedCity);
    return matchSearch && matchCity;
  });

  /* ─── Build city label for card ─── */
  const getCityLabel = (org: OrgCard) => {
    if (org.branchCities && org.branchCities.length > 0) {
      return org.branchCities.join(' • ');
    }
    return org.city || '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">

      {/* ═══════════════════════════════════════ */}
      {/*  HERO + SEARCH + FILTERS                */}
      {/* ═══════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700" />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full text-sm text-white/90 mb-4 backdrop-blur-sm font-medium">
              <Building2 className="w-4 h-4" />
              {t('directory.badge', 'Каталог организаций')}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              {t('directory.title', 'Найдите свой учебный центр')}
            </h1>
            <p className="mt-3 text-violet-200/80 text-base sm:text-lg max-w-lg mx-auto">
              {t('directory.subtitle', 'Откройте для себя лучшие школы и учебные центры')}
            </p>
          </div>

          {/* ─── Search bar ─── */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-300" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('directory.searchPlaceholder', 'Поиск по названию, городу или предмету...')}
                className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder:text-violet-300/60 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm font-medium"
              />
            </div>

            {/* ─── City chips ─── */}
            {uniqueCities.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                <button
                  onClick={() => setSelectedCity('all')}
                  className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
                    selectedCity === 'all'
                      ? 'bg-white text-violet-700 shadow-lg shadow-black/10 scale-105'
                      : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/10'
                  }`}
                >
                  {t('directory.allCities', 'Все города')}
                </button>
                {uniqueCities.map(city => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
                      selectedCity === city
                        ? 'bg-white text-violet-700 shadow-lg shadow-black/10 scale-105'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {city}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  CARDS GRID                              */}
      {/* ═══════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {search || selectedCity !== 'all'
                ? t('directory.noResults', 'Ничего не найдено')
                : t('directory.empty', 'Организации ещё не добавлены')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {search || selectedCity !== 'all'
                ? t('directory.tryDifferentSearch', 'Попробуйте выбрать другой город или изменить запрос')
                : t('directory.checkBackLater', 'Загляните позже')}
            </p>
            {(search || selectedCity !== 'all') && (
              <button
                onClick={() => { setSearch(''); setSelectedCity('all'); }}
                className="mt-4 text-violet-600 dark:text-violet-400 text-sm font-medium hover:underline"
              >
                {t('directory.clearFilters', 'Сбросить фильтры')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Result count */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedCity !== 'all' && (
                  <span className="text-violet-600 dark:text-violet-400 font-semibold">{selectedCity} · </span>
                )}
                <span className="font-bold text-slate-800 dark:text-slate-200">{filtered.length}</span>{' '}
                {t('directory.orgsFound', 'организаций')}
              </p>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((org, i) => (
                <AnimCard key={org.id} index={i}>
                  <div
                    onClick={() => navigate(`/org/${org.slug || org.id}`)}
                    className="group bg-white dark:bg-gray-800/60 rounded-2xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-violet-200/40 dark:hover:shadow-violet-900/30 hover:border-violet-300 dark:hover:border-violet-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] h-full flex flex-col"
                  >
                    {/* ─── Header: Logo + Name ─── */}
                    <div className="p-5 pb-3">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
                          {org.logo ? (
                            <img src={org.logo} alt={org.name} className="w-16 h-16 object-cover rounded-2xl" />
                          ) : (
                            <Building2 className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <h3 className="font-bold text-base text-slate-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                            {org.name}
                          </h3>
                          {org.isOnline && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-md text-[10px] font-bold uppercase tracking-wider">
                              <Wifi className="w-3 h-3" /> {t('directory.online', 'Онлайн')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ─── Description ─── */}
                    {org.description && (
                      <div className="px-5 pb-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{org.description}</p>
                      </div>
                    )}

                    {/* ─── Geography (KEY FEATURE) ─── */}
                    <div className="px-5 pb-3">
                      <div className="flex items-center gap-2 p-2.5 bg-violet-50/80 dark:bg-violet-900/15 rounded-xl border border-violet-100/60 dark:border-violet-800/30">
                        <MapPin className="w-4 h-4 text-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-violet-800 dark:text-violet-300 truncate">
                            {getCityLabel(org)}
                          </p>
                          {(org.branchesCount ?? 0) > 0 && (
                            <p className="text-[10px] text-violet-500/70 dark:text-violet-400/60 mt-0.5">
                              {org.branchesCount} {t('directory.branchCount', 'филиалов')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ─── Course tags ─── */}
                    {org.subjects?.length > 0 && (
                      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                        {org.subjects.slice(0, 3).map((s, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-slate-100 dark:bg-gray-700/40 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-semibold">
                            {s}
                          </span>
                        ))}
                        {org.subjects.length > 3 && (
                          <span className="px-2 py-1 text-[11px] text-slate-400 font-medium">+{org.subjects.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* ─── Footer: Stats + CTA ─── */}
                    <div className="px-5 py-3.5 border-t border-slate-100 dark:border-gray-700/50 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          <span className="font-bold text-slate-600 dark:text-slate-300">{org.studentsCount || 0}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span className="font-bold text-slate-600 dark:text-slate-300">{org.teachersCount || 0}</span>
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400 group-hover:gap-2 transition-all">
                        {t('directory.details', 'Подробнее')}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </AnimCard>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrganizationsDirectoryPage;
