import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { vacGetMyApplications } from '../../lib/api';
import { ArrowLeft, Briefcase, Clock, CheckCircle, XCircle, Eye, HourglassIcon } from 'lucide-react';
import type { VacancyApplication, VacancyApplicationStatus } from '../../types';

const MyApplicationsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<VacancyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const STATUS_CONFIG: Record<VacancyApplicationStatus, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <HourglassIcon className="w-3.5 h-3.5" />, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: t('vacancies.statusPending') },
    viewed: { icon: <Eye className="w-3.5 h-3.5" />, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', label: t('vacancies.statusViewed') },
    accepted: { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: t('vacancies.statusAccepted') },
    rejected: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'bg-red-500/10 text-red-600 dark:text-red-400', label: t('vacancies.statusRejected') },
  };

  useEffect(() => {
    vacGetMyApplications()
      .then((data: any) => setApplications(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/vacancies')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('vacancies.backToVacancies')}
      </button>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('vacancies.myApplications')}</h1>
      <p className="text-sm text-slate-500 mb-6">{applications.length} {t('vacancies.totalApplications')}</p>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>
      ) : applications.length === 0 ? (
         <div className="text-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <Briefcase className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t('vacancies.noApplications')}</p>
          <button onClick={() => navigate('/vacancies')} className="mt-3 text-primary-500 text-sm hover:underline">{t('vacancies.browseVacancies')}</button>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const cfg = STATUS_CONFIG[app.status];
            return (
               <div key={app.id} onClick={() => navigate(`/vacancies/${app.vacancyId}`)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{app.vacancyTitle}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{app.organizationName}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1 shrink-0 ${cfg.color}`}>
                    {cfg.icon}{cfg.label}
                  </span>
                </div>
                {app.coverLetter && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{app.coverLetter}</p>}
                <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(app.createdAt).toLocaleDateString()}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyApplicationsPage;
