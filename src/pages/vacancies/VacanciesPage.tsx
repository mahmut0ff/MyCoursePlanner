import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { vacListVacancies } from '../../lib/api';
import { Briefcase, MapPin, Search, Clock, DollarSign, Wifi, Filter, X } from 'lucide-react';
import type { Vacancy, VacancyEmploymentType } from '../../types';

const EMPLOYMENT_LABELS: Record<VacancyEmploymentType, string> = {
  full_time: 'Полная занятость', part_time: 'Частичная', contract: 'Контракт', freelance: 'Фриланс',
};
const EMPLOYMENT_COLORS: Record<VacancyEmploymentType, string> = {
  full_time: 'bg-emerald-500/10 text-emerald-600', part_time: 'bg-blue-500/10 text-blue-600',
  contract: 'bg-amber-500/10 text-amber-600', freelance: 'bg-violet-500/10 text-violet-600',
};

const VacanciesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ subject: '', city: '', employmentType: '', remote: false, salaryMin: '', salaryMax: '' });

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.subject) params.subject = filters.subject;
    if (filters.city) params.city = filters.city;
    if (filters.employmentType) params.employmentType = filters.employmentType;
    if (filters.remote) params.remote = 'true';
    if (filters.salaryMin) params.salaryMin = filters.salaryMin;
    if (filters.salaryMax) params.salaryMax = filters.salaryMax;
    vacListVacancies(Object.keys(params).length ? params : undefined)
      .then((data: any) => setVacancies(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = vacancies.filter((v) =>
    v.title?.toLowerCase().includes(search.toLowerCase()) ||
    v.organizationName?.toLowerCase().includes(search.toLowerCase()) ||
    v.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const clearFilters = () => {
    setFilters({ subject: '', city: '', employmentType: '', remote: false, salaryMin: '', salaryMax: '' });
    setShowFilters(false);
  };

  const hasActiveFilters = filters.subject || filters.city || filters.employmentType || filters.remote || filters.salaryMin || filters.salaryMax;

  const formatSalary = (v: Vacancy) => {
    if (!v.salaryMin && !v.salaryMax) return null;
    const cur = v.salaryCurrency || 'KGS';
    if (v.salaryMin && v.salaryMax) return `${v.salaryMin.toLocaleString()} – ${v.salaryMax.toLocaleString()} ${cur}`;
    if (v.salaryMin) return `от ${v.salaryMin.toLocaleString()} ${cur}`;
    return `до ${v.salaryMax!.toLocaleString()} ${cur}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary-500" />
            {t('vacancies.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} {t('vacancies.found')}</p>
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${hasActiveFilters ? 'bg-primary-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
          <Filter className="w-4 h-4" />
          {t('vacancies.filters')}
          {hasActiveFilters && <span className="w-2 h-2 bg-white rounded-full" />}
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vacancies.searchPlaceholder')}
            className="w-full bg-transparent border-0 pl-10 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('vacancies.filters')}</h3>
            {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 flex items-center gap-1"><X className="w-3 h-3" />{t('common.clear')}</button>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">{t('vacancies.subject')}</label>
              <input type="text" value={filters.subject} onChange={(e) => setFilters(f => ({ ...f, subject: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" placeholder={t('vacancies.anySubject')} />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">{t('vacancies.city')}</label>
              <input type="text" value={filters.city} onChange={(e) => setFilters(f => ({ ...f, city: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" placeholder={t('vacancies.anyCity')} />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">{t('vacancies.employmentType')}</label>
              <select value={filters.employmentType} onChange={(e) => setFilters(f => ({ ...f, employmentType: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white">
                <option value="">{t('vacancies.anyType')}</option>
                {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">{t('vacancies.salaryFrom')}</label>
              <input type="number" value={filters.salaryMin} onChange={(e) => setFilters(f => ({ ...f, salaryMin: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">{t('vacancies.salaryTo')}</label>
              <input type="number" value={filters.salaryMax} onChange={(e) => setFilters(f => ({ ...f, salaryMax: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500 text-slate-900 dark:text-white" placeholder="∞" />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={filters.remote} onChange={(e) => setFilters(f => ({ ...f, remote: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500" />
                <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1"><Wifi className="w-3 h-3" />{t('vacancies.remoteOnly')}</span>
              </label>
            </div>
          </div>
          <button onClick={load} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full">
            {t('vacancies.applyFilters')}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Briefcase className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400 mb-1">{t('vacancies.empty')}</h3>
          <p className="text-sm text-slate-400">{t('vacancies.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <div key={v.id} onClick={() => navigate(`/vacancies/${v.id}`)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 hover:border-primary-200 dark:hover:border-primary-800 transition-all group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">{v.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${EMPLOYMENT_COLORS[v.employmentType]}`}>
                      {EMPLOYMENT_LABELS[v.employmentType]}
                    </span>
                    {v.location?.remote && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-cyan-500/10 text-cyan-600 shrink-0 flex items-center gap-0.5">
                        <Wifi className="w-2.5 h-2.5" />Remote
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{v.organizationName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2">{v.description}</p>
                </div>
                {formatSalary(v) && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />{formatSalary(v)}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
                {v.location?.city && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.location.city}{v.location.country ? `, ${v.location.country}` : ''}</span>
                )}
                {v.subject && <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-500">{v.subject}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(v.createdAt).toLocaleDateString()}</span>
                <span>{v.applicationsCount} {t('vacancies.applications')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VacanciesPage;
