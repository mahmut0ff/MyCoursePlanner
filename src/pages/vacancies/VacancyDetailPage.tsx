import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { vacGetVacancy, vacApplyToVacancy, vacGetMyApplications } from '../../lib/api';
import {
  ArrowLeft, Briefcase, MapPin, DollarSign, Clock, Building2, Mail,
  Phone, Send, CheckCircle, Wifi, Camera, FileText, Star, Users,
} from 'lucide-react';
import type { Vacancy, VacancyEmploymentType } from '../../types';

const EMPLOYMENT_LABELS: Record<VacancyEmploymentType, string> = {
  full_time: 'Полная занятость', part_time: 'Частичная', contract: 'Контракт', freelance: 'Фриланс',
};

const VacancyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role } = useAuth();
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const promises: Promise<any>[] = [
      vacGetVacancy(id).then((data: any) => setVacancy(data)),
    ];
    // Check if teacher already applied
    if (role === 'teacher') {
      promises.push(
        vacGetMyApplications()
          .then((apps: any[]) => {
            if (apps.some((a: any) => a.vacancyId === id)) setApplied(true);
          })
          .catch(() => {})
      );
    }
    Promise.all(promises)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, role]);

  const handleApply = async () => {
    if (!id || !coverLetter.trim()) return;
    setApplying(true); setError('');
    try {
      await vacApplyToVacancy(id, coverLetter.trim());
      setApplied(true);
      setShowApply(false);
      // Update local count instantly
      setVacancy(prev => prev ? { ...prev, applicationsCount: (prev.applicationsCount || 0) + 1 } : prev);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setApplying(false);
    }
  };

  const formatSalary = (v: Vacancy) => {
    if (!v.salaryMin && !v.salaryMax) return null;
    const cur = v.salaryCurrency || 'KGS';
    if (v.salaryMin && v.salaryMax) return `${v.salaryMin.toLocaleString()} – ${v.salaryMax.toLocaleString()} ${cur}`;
    if (v.salaryMin) return `от ${v.salaryMin.toLocaleString()} ${cur}`;
    return `до ${v.salaryMax!.toLocaleString()} ${cur}`;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!vacancy) return (
    <div className="text-center py-20">
      <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <p className="text-sm text-slate-400">{t('common.notFound')}</p>
      <button onClick={() => navigate('/vacancies')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/vacancies')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Hero */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-20" />
        <div className="px-6 pb-6 pt-4">
          <div className="flex sm:items-end justify-between gap-4 flex-col sm:flex-row">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{vacancy.title}</h1>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-sm text-slate-500 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{vacancy.organizationName}</span>
                {vacancy.location?.city && <span className="text-sm text-slate-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{vacancy.location.city}{vacancy.location.country ? `, ${vacancy.location.country}` : ''}</span>}
              </div>
            </div>
            {role === 'teacher' && !applied && (
              <button onClick={() => setShowApply(true)}
                className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-primary-500/20 shrink-0">
                <Send className="w-4 h-4" />{t('vacancies.apply')}
              </button>
            )}
            {applied && (
              <span className="flex items-center gap-1.5 text-emerald-500 text-sm font-medium"><CheckCircle className="w-4 h-4" />{t('vacancies.applied')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {formatSalary(vacancy) && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <DollarSign className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatSalary(vacancy)}</p>
            <p className="text-[10px] text-slate-500 uppercase">{t('vacancies.salary')}</p>
          </div>
        )}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <Briefcase className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{EMPLOYMENT_LABELS[vacancy.employmentType]}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('vacancies.type')}</p>
        </div>
        {vacancy.location?.remote && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <Wifi className="w-5 h-5 text-cyan-500 mx-auto mb-1" />
            <p className="text-sm font-bold text-slate-900 dark:text-white">{t('vacancies.remote')}</p>
            <p className="text-[10px] text-slate-500 uppercase">{t('vacancies.format')}</p>
          </div>
        )}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <Users className="w-5 h-5 text-violet-500 mx-auto mb-1" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{vacancy.applicationsCount}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('vacancies.applications')}</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4 text-primary-500" />{t('vacancies.description')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{vacancy.description}</p>
      </div>

      {/* Requirements */}
      {vacancy.requirements && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" />{t('vacancies.requirements')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{vacancy.requirements}</p>
        </div>
      )}

      {/* Responsibilities */}
      {vacancy.responsibilities && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('vacancies.responsibilities')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{vacancy.responsibilities}</p>
        </div>
      )}

      {/* Work Conditions & Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {vacancy.workConditions && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('vacancies.workConditions')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{vacancy.workConditions}</p>
          </div>
        )}
        {vacancy.benefits?.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('vacancies.benefits')}</h2>
            <ul className="space-y-1.5">
              {vacancy.benefits.map((b, i) => (
                <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Photos */}
      {vacancy.photos?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5"><Camera className="w-4 h-4 text-primary-500" />{t('vacancies.photos')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {vacancy.photos.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full h-32 object-cover rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {/* Location Map */}
      {vacancy.location?.lat && vacancy.location?.lng && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-4">
          <div className="p-5 pb-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"><MapPin className="w-4 h-4 text-red-500" />{t('vacancies.location')}</h2>
            {vacancy.location.address && <p className="text-xs text-slate-500 mt-1">{vacancy.location.address}</p>}
          </div>
          <iframe
            title="location"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${vacancy.location.lng - 0.01},${vacancy.location.lat - 0.01},${vacancy.location.lng + 0.01},${vacancy.location.lat + 0.01}&layer=mapnik&marker=${vacancy.location.lat},${vacancy.location.lng}`}
            className="w-full h-48 border-0"
          />
        </div>
      )}

      {/* Contact */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('vacancies.contact')}</h2>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-primary-500" />{vacancy.contactEmail}</span>
          {vacancy.contactPhone && <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-primary-500" />{vacancy.contactPhone}</span>}
        </div>
      </div>

      {/* Posted date */}
      <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1 mb-8">
        <Clock className="w-3 h-3" />{t('vacancies.posted')}: {new Date(vacancy.createdAt).toLocaleDateString()}
      </p>

      {/* Apply Modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowApply(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('vacancies.applyTitle')}</h2>
            <p className="text-xs text-slate-500 mb-4">{vacancy.title} · {vacancy.organizationName}</p>
            {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">{t('vacancies.coverLetter')} *</label>
                <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={6}
                  placeholder={t('vacancies.coverLetterPlaceholder')}
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 text-slate-900 dark:text-white resize-none" autoFocus />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowApply(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleApply} disabled={applying || !coverLetter.trim()}
                className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors">
                <Send className="w-4 h-4" />{applying ? '...' : t('vacancies.sendApplication')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VacancyDetailPage;
