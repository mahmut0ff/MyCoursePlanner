import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Users, BookOpen, Building2, Filter, Wifi, WifiOff, ArrowLeft } from 'lucide-react';
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
  studentsCount: number;
  teachersCount: number;
}

/* ─── Shimmer skeleton ─── */
const CardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden animate-pulse">
    <div className="p-5">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="h-3 bg-slate-100 dark:bg-slate-700/60 rounded w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-full" />
        <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-4/5" />
      </div>
    </div>
    <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-700/50 flex gap-4">
      <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-20" />
      <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-24" />
    </div>
  </div>
);

const OrganizationsDirectoryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'online' | 'offline'>('all');

  useEffect(() => {
    apiGetOrgDirectory()
      .then((data: any) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = orgs.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q) ||
      o.description?.toLowerCase().includes(q) ||
      o.subjects?.some(s => s.toLowerCase().includes(q));
    const matchMode =
      filterMode === 'all' ? true :
      filterMode === 'online' ? o.isOnline :
      !o.isOnline;
    return matchSearch && matchMode;
  });

  const filterCounts = {
    all: orgs.length,
    online: orgs.filter(o => o.isOnline).length,
    offline: orgs.filter(o => !o.isOnline).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* ═══ Hero ═══ */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700" />
        {/* decorative circles */}
        <div className="absolute -top-24 -right-20 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            {t('common.back', 'Назад')}
          </button>
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-sm text-white/90 mb-4 backdrop-blur-sm">
              <Building2 className="w-3.5 h-3.5" />
              {t('directory.badge', 'Каталог организаций')}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 tracking-tight">
              {t('directory.title', 'Найдите свой учебный центр')}
            </h1>
            <p className="text-violet-200 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              {t('directory.subtitle', 'Откройте для себя лучшие школы и учебные центры')}
            </p>
          </div>

          {/* ─── Search ─── */}
          <div className="max-w-xl mx-auto mt-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-300" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('directory.searchPlaceholder', 'Поиск по названию, городу или предмету...')}
                className="w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder:text-violet-300/70 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
              />
            </div>

            {/* ─── Filter pills ─── */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {(['all', 'online', 'offline'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    filterMode === mode
                      ? 'bg-white text-violet-700 shadow-lg shadow-black/10'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {mode === 'all' && <Filter className="w-3 h-3" />}
                  {mode === 'online' && <Wifi className="w-3 h-3" />}
                  {mode === 'offline' && <WifiOff className="w-3 h-3" />}
                  {mode === 'all' ? t('directory.all', 'Все') : mode === 'online' ? t('directory.online', 'Онлайн') : t('directory.offline', 'Офлайн')}
                  <span className="opacity-60">({filterCounts[mode]})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Grid ═══ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              {search ? t('directory.noResults', 'Ничего не найдено') : t('directory.empty', 'Организации ещё не добавлены')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {search ? t('directory.tryDifferentSearch', 'Попробуйте изменить запрос') : t('directory.checkBackLater', 'Загляните позже')}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium">
              {t('directory.found', 'Найдено')}: <span className="text-slate-700 dark:text-slate-300">{filtered.length}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((org) => (
                <div
                  key={org.id}
                  onClick={() => navigate(`/org/${org.slug || org.id}`)}
                  className="group bg-white dark:bg-gray-800/60 rounded-2xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-violet-100/50 dark:hover:shadow-violet-900/20 hover:border-violet-300/60 dark:hover:border-violet-500/30 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {/* Logo + name */}
                  <div className="p-5 pb-3">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                        {org.logo ? (
                          <img src={org.logo} alt={org.name} className="w-14 h-14 object-cover rounded-xl" />
                        ) : (
                          <Building2 className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <h3 className="font-bold text-[15px] text-slate-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
                          {org.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {org.city && (
                            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              <MapPin className="w-3 h-3" />{org.city}
                            </span>
                          )}
                          {org.isOnline && (
                            <span className="px-1.5 py-0.5 bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-[10px] font-semibold">
                              {t('directory.online', 'Онлайн')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {org.description && (
                    <div className="px-5 pb-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{org.description}</p>
                    </div>
                  )}

                  {/* Subjects */}
                  {org.subjects?.length > 0 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-1">
                      {org.subjects.slice(0, 3).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-[11px] font-medium">
                          {s}
                        </span>
                      ))}
                      {org.subjects.length > 3 && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-0.5">+{org.subjects.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-700/50 flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{org.studentsCount}</span> {t('directory.students', 'студентов')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{org.teachersCount}</span> {t('directory.teachers', 'преп.')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrganizationsDirectoryPage;
