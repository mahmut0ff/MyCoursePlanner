import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Building2, Wifi, Filter } from 'lucide-react';
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
      className={`h-full transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${Math.min(index * 50, 350)}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══ Shimmer skeleton grid ═══ */
const CardSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-gray-800 animate-pulse flex flex-col h-full">
        <div className="w-full aspect-video bg-slate-100 dark:bg-gray-800 rounded-xl mb-4" />
        <div className="h-5 bg-slate-100 dark:bg-gray-800 rounded-md w-3/4 mb-3" />
        <div className="h-3 bg-slate-50 dark:bg-gray-800 rounded-md w-1/2 mb-4" />
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-slate-50 dark:bg-gray-800 rounded-md w-full" />
          <div className="h-3 bg-slate-50 dark:bg-gray-800 rounded-md w-5/6" />
        </div>
      </div>
    ))}
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
      return org.branchCities.join(' • ');
    }
    return org.city || '';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* ═══════════════════════════════════════ */}
        {/*  PAGE TITLE & HEADER                     */}
        {/* ═══════════════════════════════════════ */}
        <div className="mb-8 sm:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
              <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
              {t('directory.badge', 'Каталог')}
            </h1>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400">
              {filtered.length > 0 
                ? `${t('directory.found', 'Найдено')} ${filtered.length} ${t('directory.orgs', 'организаций')}`
                : t('directory.empty', 'Организации не найдены')}
            </p>
          </div>
          
          {/* Mobile Filter Toggle */}
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="md:hidden flex items-center justify-center gap-2 w-full py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl font-medium text-slate-700 dark:text-slate-300 shadow-sm"
          >
            <Filter className="w-4 h-4" />
            {mobileFiltersOpen ? t('common.closeFilters', 'Скрыть фильтры') : t('common.openFilters', 'Фильтры')}
          </button>
        </div>

        {/* ═══════════════════════════════════════ */}
        {/*  MAIN LAYOUT                             */}
        {/* ═══════════════════════════════════════ */}
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* ── Sidebar (Filters) ── */}
          <div className={`w-full md:w-64 lg:w-72 shrink-0 ${mobileFiltersOpen ? 'block' : 'hidden md:block'}`}>
             <div className="sticky top-24 space-y-6">
               
               {/* Search Box */}
               <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-slate-200 dark:border-gray-800 shadow-sm">
                 <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">{t('directory.search', 'Поиск')}</h3>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input
                     type="text"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     placeholder={t('directory.searchPlaceholder', 'Название, курс...')}
                     className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow"
                   />
                 </div>
               </div>

               {/* Regions Filter */}
               <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-slate-200 dark:border-gray-800 shadow-sm flex flex-col max-h-[500px]">
                 <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">{t('directory.regions', 'Регионы')}</h3>
                  <div className="space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
                     <button 
                        onClick={() => setSelectedCity('all')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-medium border border-transparent ${
                          selectedCity === 'all' 
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800/50' 
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                     >
                       {t('directory.allCities', 'Все регионы')}
                     </button>
                     {uniqueCities.map(city => (
                       <button
                         key={city}
                         onClick={() => setSelectedCity(city)}
                         className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-medium border border-transparent ${
                           selectedCity === city 
                             ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800/50' 
                             : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white'
                         }`}
                       >
                         {city}
                       </button>
                     ))}
                  </div>
               </div>

             </div>
          </div>

          {/* ── Main Content (Grid) ── */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <CardSkeletonGrid />
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-3xl border-dashed">
                <div className="w-16 h-16 bg-slate-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Search className="w-7 h-7 text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {t('directory.noResults', 'Ничего не найдено')}
                </h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                  {t('directory.tryDifferentSearch', 'Попробуйте изменить параметры поиска или выбрать другой регион.')}
                </p>
                <button
                  onClick={() => { setSearch(''); setSelectedCity('all'); setMobileFiltersOpen(false); }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all"
                >
                  {t('directory.clearFilters', 'Сбросить фильтры')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6">
                {filtered.map((org, i) => (
                  <AnimCard key={org.id} index={i}>
                    <div
                      onClick={() => navigate(`/org/${org.slug || org.id}`)}
                      className="bg-white dark:bg-gray-900 group rounded-2xl p-5 shadow-sm hover:shadow-md border border-slate-200 dark:border-gray-800 cursor-pointer transition-all hover:-translate-y-1 flex flex-col h-full"
                    >
                      {/* Logo Area */}
                      <div className="w-full aspect-video bg-slate-50 dark:bg-gray-800 rounded-xl mb-4 border border-slate-100 dark:border-gray-700 flex items-center justify-center p-4 overflow-hidden relative group-hover:border-slate-200 dark:group-hover:border-gray-600 transition-colors">
                        {org.logo ? (
                          <img src={org.logo} alt={org.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <Building2 className="w-10 h-10 text-slate-300 dark:text-gray-600" />
                        )}
                        {/* Tags */}
                        {org.isOnline && (
                          <div className="absolute top-3 left-3 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/70 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-800 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 shadow-sm backdrop-blur-sm">
                             <Wifi className="w-3 h-3" /> {t('directory.online', 'Онлайн')}
                          </div>
                        )}
                      </div>

                      {/* Info Area */}
                      <div className="flex flex-col flex-1">
                         <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1" title={org.name}>
                           {org.name}
                         </h3>
                         <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-3 gap-1.5 line-clamp-1">
                           <MapPin className="w-3.5 h-3.5 shrink-0" /> {getCityLabel(org)}
                         </div>

                         <div className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-4 leading-relaxed flex-1">
                           {org.description || t('directory.noDescShort', 'Описание отсутствует.')}
                         </div>

                         {/* Subjects Footer */}
                         <div className="border-t border-slate-100 dark:border-gray-800 pt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0 min-h-[36px]">
                           {org.subjects?.length > 0 ? (
                             <>
                               {org.subjects.slice(0, 3).map((s, idx) => (
                                 <span key={idx} className="whitespace-nowrap px-2 py-1 bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-medium border border-slate-200 dark:border-gray-700">
                                   {s}
                                 </span>
                               ))}
                               {org.subjects.length > 3 && (
                                 <span className="whitespace-nowrap px-2 py-1 bg-slate-50 dark:bg-gray-800 text-slate-400 rounded-md text-[11px] font-medium border border-transparent">
                                   +{org.subjects.length - 3}
                                 </span>
                               )}
                             </>
                           ) : (
                             <span className="text-[11px] text-slate-400 italic">{t('directory.noSubjects', 'Направления не указаны')}</span>
                           )}
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
    </div>
  );
};

export default OrganizationsDirectoryPage;
