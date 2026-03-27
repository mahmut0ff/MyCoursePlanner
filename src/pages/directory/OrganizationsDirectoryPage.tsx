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
        <div className="w-full border-t border-slate-100 dark:border-gray-800">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedCity('all')}
                className={`flex-shrink-0 px-3 py-1 rounded text-sm transition-colors whitespace-nowrap ${
                  selectedCity === 'all'
                    ? 'bg-slate-200 dark:bg-gray-700 text-slate-900 dark:text-white font-medium'
                    : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                }`}
              >
                {t('directory.allCities', 'Все регионы')}
              </button>
              {uniqueCities.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`flex-shrink-0 px-3 py-1 rounded text-sm transition-colors whitespace-nowrap ${
                    selectedCity === city
                      ? 'bg-slate-200 dark:bg-gray-700 text-slate-900 dark:text-white font-medium'
                      : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
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
          <div className="flex flex-col gap-4">
            {[...Array(5)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="text-center py-20 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {search || selectedCity !== 'all'
                ? t('directory.noResults', 'Ничего не найдено')
                : t('directory.empty', 'Учебные центры ещё не добавлены')}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {t('directory.tryDifferentSearch', 'Попробуйте изменить параметры поиска или город')}
            </p>
            {(search || selectedCity !== 'all') && (
              <button
                onClick={() => { setSearch(''); setSelectedCity('all'); }}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
              >
                {t('directory.clearFilters', 'Сбросить фильтры')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header / Sort line */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {search 
                  ? `По запросу «${search}» найдено ${filtered.length} организаций` 
                  : `Учебные центры (${filtered.length})`
                }
              </h1>
            </div>

            {/* List */}
            <div className="flex flex-col gap-4">
              {filtered.map((org, i) => (
                <AnimCard key={org.id} index={i}>
                  <div
                    onClick={() => navigate(`/org/${org.slug || org.id}`)}
                    className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 sm:p-6 hover:shadow-md cursor-pointer transition-shadow flex flex-col sm:flex-row gap-5"
                  >
                    {/* ─── Left: Info ─── */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h3 className="text-xl font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:underline truncate">
                          {org.name}
                        </h3>
                        {/* Mobile logo (visible only on small) */}
                        <div className="sm:hidden shrink-0 w-12 h-12 rounded bg-slate-50 dark:bg-gray-700 border border-slate-100 dark:border-gray-600 flex items-center justify-center overflow-hidden p-1">
                          {org.logo ? (
                            <img src={org.logo} alt={org.name} className="w-full h-full object-contain" />
                          ) : (
                            <Building2 className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                      </div>
                      
                      {org.isOnline && (
                        <div className="mb-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-[11px] font-medium uppercase">
                            <Wifi className="w-3 h-3" /> {t('directory.online', 'Онлайн')}
                          </span>
                        </div>
                      )}

                      <div className="text-sm text-slate-500 mb-3 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" /> {getCityLabel(org)}
                      </div>

                      {org.description && (
                        <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 md:line-clamp-3 mb-4 leading-relaxed">
                          {org.description}
                        </div>
                      )}

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Tags */}
                      {org.subjects?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {org.subjects.slice(0, 6).map((s, idx) => (
                            <span key={idx} className="px-2 py-1 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded text-[11px] font-medium">
                              {s}
                            </span>
                          ))}
                          {org.subjects.length > 6 && (
                            <span className="px-2 py-1 text-[11px] text-slate-400 font-medium">ещё {org.subjects.length - 6}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ─── Right: Logo (Desktop) ─── */}
                    <div className="hidden sm:flex shrink-0 w-32 h-auto flex-col items-end pt-1">
                       <div className="w-24 h-24 rounded border border-slate-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center p-2">
                          {org.logo ? (
                            <img src={org.logo} alt={org.name} className="w-full h-full object-contain" />
                          ) : (
                            <Building2 className="w-10 h-10 text-slate-200" />
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
