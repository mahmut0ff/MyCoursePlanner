import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Users, BookOpen, Building2, Filter, Wifi, WifiOff } from 'lucide-react';
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
    const matchSearch =
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.city?.toLowerCase().includes(search.toLowerCase()) ||
      o.description?.toLowerCase().includes(search.toLowerCase()) ||
      o.subjects?.some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchMode =
      filterMode === 'all' ? true :
      filterMode === 'online' ? o.isOnline :
      !o.isOnline;
    return matchSearch && matchMode;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-950 dark:to-gray-900">
      {/* Hero */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-sm mb-4">
              <Building2 className="w-4 h-4" />
              {t('directory.badge', 'Каталог организаций')}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              {t('directory.title', 'Найдите свой учебный центр')}
            </h1>
            <p className="text-violet-200 text-lg max-w-2xl mx-auto">
              {t('directory.subtitle', 'Откройте для себя лучшие школы и учебные центры Центральной Азии')}
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mt-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-300" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('directory.searchPlaceholder', 'Поиск по названию, городу или предмету...')}
                className="w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl text-white placeholder:text-violet-300 focus:outline-none focus:ring-2 focus:ring-white/30 text-base"
              />
            </div>
            {/* Filter Pills */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {(['all', 'online', 'offline'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    filterMode === mode
                      ? 'bg-white text-violet-700'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {mode === 'all' && <Filter className="w-3.5 h-3.5" />}
                  {mode === 'online' && <Wifi className="w-3.5 h-3.5" />}
                  {mode === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
                  {mode === 'all' ? t('directory.all', 'Все') : mode === 'online' ? t('directory.online', 'Онлайн') : t('directory.offline', 'Офлайн')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Org Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              {search ? t('directory.noResults', 'Ничего не найдено') : t('directory.empty', 'Организации ещё не добавлены')}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t('directory.found', 'Найдено')}: {filtered.length}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((org) => (
                <div
                  key={org.id}
                  onClick={() => navigate(`/org/${org.slug || org.id}`)}
                  className="group bg-white dark:bg-gray-800/60 rounded-2xl border border-slate-200/60 dark:border-gray-700/50 overflow-hidden cursor-pointer hover:shadow-xl hover:border-violet-300/50 dark:hover:border-violet-500/30 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {/* Logo Row */}
                  <div className="p-5 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {org.logo ? (
                          <img src={org.logo} alt={org.name} className="w-12 h-12 object-cover rounded-xl" />
                        ) : (
                          <Building2 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
                          {org.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {org.city && (
                            <>
                              <MapPin className="w-3 h-3" />
                              <span>{org.city}</span>
                            </>
                          )}
                          {org.isOnline && (
                            <span className="ml-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-semibold">
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
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{org.description}</p>
                    </div>
                  )}

                  {/* Subjects */}
                  {org.subjects?.length > 0 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-1">
                      {org.subjects.slice(0, 3).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-xs">
                          {s}
                        </span>
                      ))}
                      {org.subjects.length > 3 && (
                        <span className="text-xs text-slate-400">+{org.subjects.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Stats Footer */}
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-700/50 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {org.studentsCount} {t('directory.students', 'студентов')}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> {org.teachersCount} {t('directory.teachers', 'преподавателей')}
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
