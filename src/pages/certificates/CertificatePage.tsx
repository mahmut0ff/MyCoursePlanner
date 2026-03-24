import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetCertificate } from '../../lib/api';
import { Award, Share2, CheckCircle } from 'lucide-react';

interface CertificateData {
  id: string;
  studentName: string;
  examTitle: string;
  percentage: number;
  score: number;
  totalPoints: number;
  organizationName: string;
  certificateNumber: string;
  issuedAt: string;
}

const CertificatePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { certId } = useParams<{ certId: string }>();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (certId) {
      apiGetCertificate(certId).then(setCert).catch(() => {}).finally(() => setLoading(false));
    }
  }, [certId]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${t('certificate.title')} — ${cert?.studentName}`, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!cert) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('certificate.notFound')}</h3></div>;

  const issuedDate = new Date(cert.issuedAt).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Certificate Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700" id="certificate">
        {/* Header Gradient */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8 text-center text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          <Award className="w-16 h-16 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="text-3xl font-bold tracking-wide">{t('certificate.title')}</h1>
          <p className="text-white/70 mt-1 text-sm">{t('certificate.valid')}</p>
        </div>

        {/* Body */}
        <div className="p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('certificate.issuedTo')}</p>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">{cert.studentName}</h2>

          <div className="w-20 h-0.5 bg-gradient-to-r from-indigo-500 to-pink-500 mx-auto mb-6" />

          <p className="text-slate-600 dark:text-slate-400 mb-1">{t('certificate.examTitle')}</p>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">{cert.examTitle}</h3>

          <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-full text-lg font-bold mb-6">
            <CheckCircle className="w-5 h-5" />
            {cert.percentage}% — {cert.score}/{cert.totalPoints}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('certificate.date')}</p>
              <p className="font-medium text-slate-900 dark:text-white">{issuedDate}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('certificate.number')}</p>
              <p className="font-mono font-medium text-slate-900 dark:text-white text-xs">{cert.certificateNumber}</p>
            </div>
          </div>

          {cert.organizationName && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('certificate.issuedBy')}</p>
              <p className="font-medium text-slate-900 dark:text-white">{cert.organizationName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-center mt-6">
        <button onClick={handleShare} className="btn-primary flex items-center gap-2">
          <Share2 className="w-4 h-4" />{t('certificate.share')}
        </button>
      </div>
    </div>
  );
};

export default CertificatePage;
