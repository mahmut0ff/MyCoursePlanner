import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { vacGetOrgVacancies, vacCloseVacancy, vacDeleteVacancy, vacGetVacancyApplications, vacReviewApplication } from '../../lib/api';
import { Plus, Briefcase, Trash2, XCircle, Eye, CheckCircle, Users, Clock, Ban, RefreshCw } from 'lucide-react';
import type { Vacancy, VacancyApplication, VacancyApplicationStatus } from '../../types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-slate-700 text-slate-500', published: 'bg-emerald-100 text-emerald-700', closed: 'bg-red-100 text-red-700',
};
const APP_STATUS_BADGE: Record<VacancyApplicationStatus, { color: string; label: string }> = {
  pending: { color: 'bg-amber-500/10 text-amber-600', label: 'Ожидает' },
  viewed: { color: 'bg-blue-500/10 text-blue-600', label: 'Просмотрено' },
  accepted: { color: 'bg-emerald-500/10 text-emerald-600', label: 'Принято' },
  rejected: { color: 'bg-red-500/10 text-red-600', label: 'Отклонено' },
};

const OrgVacanciesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Vacancy | null>(null);
  const [applications, setApplications] = useState<VacancyApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    vacGetOrgVacancies()
      .then((data: any) => setVacancies(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openApplications = (v: Vacancy) => {
    setSelected(v);
    setAppsLoading(true);
    vacGetVacancyApplications(v.id)
      .then((data: any) => setApplications(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setAppsLoading(false));
  };

  const handleReview = async (appId: string, status: string) => {
    await vacReviewApplication(appId, status);
    setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: status as VacancyApplicationStatus } : a));
  };

  const handleClose = async (id: string) => {
    if (!confirm(t('vacancies.confirmClose'))) return;
    await vacCloseVacancy(id);
    load();
    if (selected?.id === id) setSelected(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    await vacDeleteVacancy(id);
    load();
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary-500" />{t('vacancies.orgTitle')}</h1>
          <p className="text-sm text-slate-500">{vacancies.length} {t('vacancies.totalVacancies')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => navigate('/vacancies/create')} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors">
            <Plus className="w-4 h-4" />{t('vacancies.create')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
      ) : vacancies.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <Briefcase className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-3">{t('vacancies.noVacancies')}</p>
          <button onClick={() => navigate('/vacancies/create')} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" />{t('vacancies.createFirst')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Vacancies List */}
          <div className="space-y-3">
            {vacancies.map((v) => (
              <div key={v.id} className={`bg-white dark:bg-slate-800 border rounded-xl p-4 cursor-pointer transition-all ${selected?.id === v.id ? 'border-primary-500 shadow-lg shadow-primary-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary-200 dark:hover:border-primary-800'}`}
                onClick={() => openApplications(v)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">{v.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{v.subject}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[v.status]}`}>{v.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{v.applicationsCount} {t('vacancies.applications')}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
                  {v.status === 'published' && <button onClick={() => handleClose(v.id)} className="text-[10px] px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg flex items-center gap-0.5"><Ban className="w-3 h-3" />{t('vacancies.close')}</button>}
                  <button onClick={() => handleDelete(v.id)} className="text-[10px] px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg flex items-center gap-0.5"><Trash2 className="w-3 h-3" />{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>

          {/* Applications Panel */}
          {selected && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{t('vacancies.applicationsFor')}: {selected.title}</h3>
                <p className="text-xs text-slate-500">{applications.length} {t('vacancies.applications')}</p>
              </div>
              <div className="p-4 max-h-[600px] overflow-y-auto">
                {appsLoading ? (
                  <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" /></div>
                ) : applications.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-8">{t('vacancies.noApplicants')}</p>
                ) : (
                  <div className="space-y-3">
                    {applications.map((app) => {
                      const cfg = APP_STATUS_BADGE[app.status];
                      const isExpanded = expandedApp === app.id;
                      return (
                        <div key={app.id} className="border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setExpandedApp(isExpanded ? null : app.id)}>
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{app.teacherName}</p>
                              <p className="text-xs text-slate-500">{app.teacherEmail}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                          </div>
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('vacancies.coverLetter')}</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{app.coverLetter || '—'}</p>
                              </div>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(app.createdAt).toLocaleDateString()}</p>
                              {app.status === 'pending' || app.status === 'viewed' ? (
                                <div className="flex gap-2">
                                  {app.status === 'pending' && <button onClick={() => handleReview(app.id, 'viewed')} className="text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg flex items-center gap-1"><Eye className="w-3 h-3" />{t('vacancies.markViewed')}</button>}
                                  <button onClick={() => handleReview(app.id, 'accepted')} className="text-xs px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t('vacancies.accept')}</button>
                                  <button onClick={() => handleReview(app.id, 'rejected')} className="text-xs px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg flex items-center gap-1"><XCircle className="w-3 h-3" />{t('vacancies.reject')}</button>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrgVacanciesPage;
