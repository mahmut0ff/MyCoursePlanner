import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Building2, Wifi } from 'lucide-react';
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
  <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-gray-800 animate-pulse flex flex-col sm:flex-row gap-6">
    <div className="flex-1 space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-gray-800 sm:hidden" />
        <div className="h-6 bg-slate-100 dark:bg-gray-800 rounded-lg w-1/3" />
      </div>
      <div className="h-4 bg-slate-50 dark:bg-gray-800/80 rounded w-1/4" />
      <div className="space-y-2 pt-2">
        <div className="h-3 bg-slate-50 dark:bg-gray-800/50 rounded w-full" />
        <div className="h-3 bg-slate-50 dark:bg-gray-800/50 rounded w-5/6" />
      </div>
      <div className="flex gap-2 pt-4">
        <div className="h-6 w-16 bg-slate-100 dark:bg-gray-800 rounded-full" />
        <div className="h-6 w-20 bg-slate-100 dark:bg-gray-800 rounded-full" />
      </div>
    </div>
    <div className="hidden sm:block w-32 h-32 bg-slate-50 dark:bg-gray-800 rounded-2xl shrink-0" />
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
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">

      {/* ═══════════════════════════════════════ */}
      {/*  HEADER (simple search bar)              */}
      {/* ═══════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <Building2 className="w-6 h-6 text-blue-600" />
            <span className="text-slate-900 dark:text-white font-bold text-lg">{t('directory.badge', 'Каталог')}</span>
          </div>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('directory.searchPlaceholder', 'Профессия, курс или учебный центр')}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-md text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
        </div>
        
        {/* Category strips */}
        <div className="w-full border-t border-slate-100 dark:border-gray-800 bg-[#F8FAFC] dark:bg-gray-900/50">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedCity('all')}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap border ${
                  selectedCity === 'all'
                    ? 'bg-blue-600 border-blue-600 text-white font-medium shadow-sm'
                    : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {t('directory.allCities', 'Все регионы')}
              </button>
              {uniqueCities.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap border ${
                    selectedCity === city
                      ? 'bg-blue-600 border-blue-600 text-white font-medium shadow-sm'
                      : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/*  LISTING CONTAINER                       */}
      {/* ═══════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {loading ? (
          <div className="flex flex-col gap-6">
            {[...Array(5)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="text-center py-20 bg-white/50 dark:bg-gray-800/30 border border-slate-200 dark:border-gray-700/50 rounded-3xl border-dashed">
            <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-slate-100 dark:border-gray-700 flex items-center justify-center mx-auto mb-5">
              <Search className="w-7 h-7 text-slate-300 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {search || selectedCity !== 'all'
                ? t('directory.noResults', 'Здесь пока пусто')
                : t('directory.empty', 'Учебные центры ещё не добавлены')}
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {t('directory.tryDifferentSearch', 'Попробуйте изменить параметры поиска, выбрать другой город или загляните позже.')}
            </p>
            {(search || selectedCity !== 'all') && (
              <button
                onClick={() => { setSearch(''); setSelectedCity('all'); }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm hover:shadow transition-all rounded-xl"
              >
                {t('directory.clearFilters', 'Сбросить фильтры')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header / Sort line */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {search 
                  ? `По запросу «${search}» найдено ${filtered.length} организаций` 
                  : `Учебные центры и организации (${filtered.length})`
                }
              </h1>
            </div>

            {/* List */}
            <div className="flex flex-col gap-6">
              {filtered.map((org, i) => (
                <AnimCard key={org.id} index={i}>
                  <div
                    onClick={() => navigate(`/org/${org.slug || org.id}`)}
                    className="bg-white dark:bg-gray-900 group rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.1)] border border-slate-200 dark:border-gray-800 cursor-pointer transition-all hover:-translate-y-0.5 flex flex-col sm:flex-row gap-6 sm:gap-8"
                  >
                    {/* ─── Left: Info ─── */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {org.name}
                        </h3>
                        {/* Mobile logo (visible only on small) */}
                        <div className="sm:hidden shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 border shadow-sm border-slate-100 dark:border-gray-700 flex items-center justify-center overflow-hidden p-1.5">
                          {org.logo ? (
                            <img src={org.logo} alt={org.name} className="w-full h-full object-contain" />
                          ) : (
                            <Building2 className="w-6 h-6 text-slate-300 dark:text-gray-500" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {org.isOnline && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50 rounded-md text-[11px] font-bold uppercase tracking-wider">
                            <Wifi className="w-3 h-3" /> {t('directory.online', 'Онлайн')}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {getCityLabel(org)}
                        </span>
                      </div>

                      {org.description && (
                        <div className="text-sm sm:text-base text-slate-600 dark:text-slate-300 line-clamp-2 mb-6 leading-relaxed">
                          {org.description}
                        </div>
                      )}

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Tags */}
                      {org.subjects?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-auto">
                          {org.subjects.slice(0, 5).map((s, idx) => (
                            <span key={idx} className="px-3 py-1 bg-[#F8FAFC] dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-200 dark:border-gray-700">
                              {s}
                            </span>
                          ))}
                          {org.subjects.length > 5 && (
                            <span className="px-3 py-1 rounded-lg border border-transparent text-xs text-slate-400 dark:text-slate-500 font-medium bg-slate-50 dark:bg-gray-800/50">
                              +{org.subjects.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ─── Right: Logo (Desktop) ─── */}
                    <div className="hidden sm:flex shrink-0 w-32 flex-col items-center justify-center">
                       <div className="w-32 h-32 rounded-3xl border border-slate-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center p-3 group-hover:shadow-md group-hover:border-slate-200 dark:group-hover:border-gray-700 transition-all overflow-hidden">
                          {org.logo ? (
                            <img src={org.logo} alt={org.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <Building2 className="w-12 h-12 text-slate-200 dark:text-gray-700" />
                          )}
                       </div>
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
