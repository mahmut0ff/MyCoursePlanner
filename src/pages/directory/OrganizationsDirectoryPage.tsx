import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Building2, Wifi, Filter, X, Users, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
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
      className={`h-full transition-all duration-600 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.97]'}`}
      style={{ transitionDelay: `${Math.min(index * 60, 400)}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══ Shimmer skeleton grid ═══ */
const CardSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200/60 dark:border-slate-700/60 animate-pulse">
        <div className="h-40 bg-slate-100 dark:bg-slate-700/50" />
        <div className="p-5 space-y-3">
          <div className="h-5 bg-slate-100 dark:bg-slate-700 rounded-lg w-3/4" />
          <div className="h-3 bg-slate-50 dark:bg-slate-700/50 rounded w-1/2" />
          <div className="flex gap-2 pt-1">
            <div className="h-6 bg-slate-50 dark:bg-slate-700/50 rounded-full w-16" />
            <div className="h-6 bg-slate-50 dark:bg-slate-700/50 rounded-full w-20" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ═══ Gradient card accent colors ═══ */
const cardAccents = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-cyan-600',
];

function getAccent(id: string) {
  let s = 0;
  for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
  return cardAccents[s % cardAccents.length];
}

/* ═══ Main Page ═══ */
const OrganizationsDirectoryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
      return org.branchCities.slice(0, 3).join(' · ') + (org.branchCities.length > 3 ? ` +${org.branchCities.length - 3}` : '');
    }
    return org.city || '';
  };

  const hasActiveFilters = search || selectedCity !== 'all';

  return (
    <div className="space-y-6">

      {/* ═══ Premium Hero Header ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-800/80 p-6 sm:p-8 border border-slate-800 dark:border-slate-700">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(99,102,241,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(16,185,129,0.06),transparent_50%)]" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                {t('directory.badge', 'Каталог организаций')}
              </h1>
              <p className="text-slate-400 text-sm mt-1.5">
                {loading
                  ? t('common.loading', 'Загрузка...')
                  : filtered.length > 0
                  ? `${filtered.length} ${t('directory.orgs', 'организаций')} ${hasActiveFilters ? t('directory.matchFilter', 'по фильтру') : t('directory.available', 'доступно')}`
                  : t('directory.empty', 'Организации не найдены')}
              </p>
            </div>

            {/* Mobile Filter Toggle */}
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="md:hidden flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-sm transition-colors border border-slate-700"
            >
              <Filter className="w-4 h-4" />
              {mobileFiltersOpen ? t('common.closeFilters', 'Скрыть') : t('common.openFilters', 'Фильтры')}
            </button>
          </div>

          {/* Search Bar (hero-style) */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('directory.searchPlaceholder', 'Поиск по названию, предмету, городу...')}
              className="w-full pl-12 pr-12 py-3.5 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* ── Sidebar (Filters) ── */}
        <div className={`w-full md:w-56 lg:w-64 shrink-0 ${mobileFiltersOpen ? 'block' : 'hidden md:block'}`}>
          <div className="sticky top-4 space-y-4">
            
            {/* Region Filter */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('directory.regions', 'Регионы')}</h3>
              </div>
              <div className="p-1.5 max-h-[400px] overflow-y-auto">
                <button 
                  onClick={() => setSelectedCity('all')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    selectedCity === 'all' 
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t('directory.allCities', 'Все регионы')}
                </button>
                {uniqueCities.map(city => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      selectedCity === city 
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {city}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Active filters badge */}
            {hasActiveFilters && (
              <button
                onClick={() => { setSearch(''); setSelectedCity('all'); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                {t('directory.clearFilters', 'Сбросить фильтры')}
              </button>
            )}
          </div>
        </div>

        {/* ── Main Content (Grid) ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <CardSkeletonGrid />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-5">
                <Search className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {t('directory.noResults', 'Ничего не найдено')}
              </h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm text-center">
                {t('directory.tryDifferentSearch', 'Попробуйте изменить параметры поиска или выбрать другой регион.')}
              </p>
              <button
                onClick={() => { setSearch(''); setSelectedCity('all'); setMobileFiltersOpen(false); }}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all text-sm"
              >
                {t('directory.clearFilters', 'Сбросить фильтры')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5">
              {filtered.map((org, i) => (
                <AnimCard key={org.id} index={i}>
                  <div
                    onClick={() => navigate(`/org/${org.slug || org.id}`)}
                    className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200/60 dark:border-slate-700/60 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 flex flex-col h-full"
                  >
                    {/* Cover / Logo area */}
                    <div className={`relative h-36 bg-gradient-to-br ${getAccent(org.id)} p-5 flex items-end`}>
                      {/* Subtle pattern */}
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white_0%,transparent_50%)]" />
                      
                      {/* Logo badge */}
                      <div className="absolute top-4 right-4 w-14 h-14 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-white/20 flex items-center justify-center p-1.5 group-hover:scale-110 transition-transform duration-300">
                        {org.logo ? (
                          <img src={org.logo} alt={org.name} className="w-full h-full object-contain rounded-lg" />
                        ) : (
                          <Building2 className="w-6 h-6 text-slate-400" />
                        )}
                      </div>

                      {/* Tags */}
                      <div className="relative z-10 flex flex-wrap gap-1.5">
                        {org.isOnline && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-md text-[10px] font-bold uppercase tracking-wider">
                            <Wifi className="w-3 h-3" /> {t('directory.online', 'Онлайн')}
                          </span>
                        )}
                        {(org.branchesCount || 0) > 1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-md text-[10px] font-bold">
                            <Building2 className="w-3 h-3" /> {org.branchesCount} {t('directory.branchShort', 'фил.')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4 sm:p-5 flex flex-col flex-1">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1.5 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={org.name}>
                        {org.name}
                      </h3>
                      
                      {getCityLabel(org) && (
                        <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-3 gap-1">
                          <MapPin className="w-3 h-3 shrink-0 text-rose-400" />
                          <span className="truncate">{getCityLabel(org)}</span>
                        </div>
                      )}

                      <p className="text-[13px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4 flex-1">
                        {org.description || t('directory.noDescShort', 'Описание отсутствует.')}
                      </p>

                      {/* Subjects + Stats footer */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2.5">
                        {/* Subjects */}
                        {org.subjects?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {org.subjects.slice(0, 3).map((s, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 rounded-md text-[11px] font-medium">
                                {s}
                              </span>
                            ))}
                            {org.subjects.length > 3 && (
                              <span className="px-2 py-0.5 text-slate-400 text-[11px] font-medium">
                                +{org.subjects.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stats row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            {org.studentsCount > 0 && (
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{org.studentsCount}</span>
                            )}
                            {org.teachersCount > 0 && (
                              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{org.teachersCount}</span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </div>
                  </div>
                </AnimCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationsDirectoryPage;
