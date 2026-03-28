import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetCertificate } from '../../lib/api';
import { Share2, CheckCircle, Download, ExternalLink, ArrowLeft } from 'lucide-react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (certId) {
      apiGetCertificate(certId)
        .then((data) => {
          setCert(data);
          // Generate QR code pointing to this exact validation URL
          QRCode.toDataURL(window.location.href, { 
            width: 150,
            margin: 1,
            color: { dark: '#1E293B', light: '#FFFFFF' }
          }).then(setQrCodeDataUrl);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [certId]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${t('certificate.title')} — ${cert?.studentName}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert(t('common.copiedToClipboard', 'Скопировано в буфер обмена!'));
    }
  };

  const handleDownloadPDF = async () => {
    if (!certRef.current || !cert) return;
    setIsExporting(true);
    
    try {
      // 1122x793 is ~ A4 landscape at 96 DPI
      const canvas = await html2canvas(certRef.current, {
        scale: 2, // higher resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      // A4 dimensions in mm: 297 x 210 (landscape)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      pdf.save(`Certificate_${cert.studentName.replace(/\s+/g, '_')}_${cert.certificateNumber}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF', e);
      alert('Ошибка при генерации PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLinkedInShare = () => {
    if (!cert) return;
    const certUrl = window.location.href;
    const title = encodeURIComponent(cert.examTitle);
    const org = encodeURIComponent(cert.organizationName || 'MyCoursePlan');
    const certIdArg = encodeURIComponent(cert.certificateNumber);
    
    // Constructing LinkedIn Add Certificate URL
    const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${title}&organizationName=${org}&certId=${certIdArg}&certUrl=${encodeURIComponent(certUrl)}`;
    window.open(linkedInUrl, '_blank');
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  if (!cert) return <div className="text-center py-20 bg-slate-50 min-h-screen"><h3 className="text-xl font-medium text-slate-700">{t('certificate.notFound')}</h3><Link to="/" className="text-indigo-600 mt-4 inline-block hover:underline">На главную</Link></div>;

  const issuedDate = new Date(cert.issuedAt).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 flex flex-col items-center">
      {/* Top Banner Navigation (hidden from PDF) */}
      <div className="w-full max-w-[1122px] flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
        <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors">
          <ArrowLeft className="w-5 h-5" />
          Вернуться на главную
        </Link>
        <div className="flex items-center gap-3">
          <button onClick={handleLinkedInShare} className="px-4 py-2.5 bg-[#0077b5] hover:bg-[#005e93] text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition-colors text-sm">
            <ExternalLink className="w-4 h-4" /> Добавить в LinkedIn
          </button>
          <button onClick={handleShare} className="px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl font-medium flex items-center gap-2 transition-colors text-sm">
            <Share2 className="w-4 h-4" /> Поделиться
          </button>
          <button onClick={handleDownloadPDF} disabled={isExporting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-2 shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm">
            {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Создание PDF...' : 'Скачать PDF'}
          </button>
        </div>
      </div>

      {/* Certificate Wrapper for proper scaling on mobile */}
      <div className="w-full max-w-[1122px] overflow-x-auto pb-8 custom-scrollbar flex justify-center">
        {/* The actual Certificate DOM Node (A4 Landscape dimensions approximately 1122x793) */}
        <div 
          ref={certRef}
          className="relative bg-white shrink-0 shadow-2xl overflow-hidden"
          style={{ width: '1122px', height: '793px' }}
        >
          {/* Background Decorative Pattern */}
          <div className="absolute inset-0 z-0">
            {/* Soft background grid gradient */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #4338ca 1px, transparent 1px), radial-gradient(circle at 80% 50%, #4338ca 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            
            {/* Guilloche/Border imitation via CSS gradients */}
            <div className="absolute inset-3 border-[12px] border-emerald-900/10 rounded-xl" />
            <div className="absolute inset-4 border-[2px] border-amber-500/40 rounded-lg" />
            
            {/* Top Right & Bottom Left Ornaments */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-amber-200/40 to-amber-500/0 rounded-bl-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-emerald-200/30 to-emerald-500/0 rounded-tr-full pointer-events-none" />
          </div>

          {/* Certificate Content */}
          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-20 text-slate-800">
            {/* Brand Logo / Header */}
            <div className="flex flex-col items-center mb-10">
              <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                <span className="font-serif font-bold text-2xl italic">C</span>
              </div>
              <h1 className="text-5xl font-serif font-bold tracking-widest text-slate-900 uppercase">СЕРТИФИКАТ</h1>
              <p className="text-xl tracking-[0.3em] font-light text-slate-500 mt-3 uppercase">Об успешном окончании</p>
            </div>

            {/* Issued To */}
            <div className="mb-4">
              <p className="text-slate-400 font-medium tracking-widest uppercase text-sm mb-4">Настоящим подтверждается, что</p>
              <h2 className="text-6xl font-serif italic font-bold text-slate-900 mb-6 text-center" style={{ fontFamily: '"Playfair Display", "Times New Roman", serif' }}>
                {cert.studentName}
              </h2>
            </div>
            
            <div className="w-48 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-8" />

            {/* Course Details */}
            <div className="max-w-3xl text-center space-y-4 mb-16">
              <p className="text-xl text-slate-600 font-light leading-relaxed">
                успешно прошел(ла) финальную проверку знаний и завершил(а) программу<br/>
                <strong className="text-slate-900 font-bold block mt-3 text-2xl">{cert.examTitle}</strong>
              </p>
              {cert.organizationName && (
                <p className="text-slate-500 font-medium text-lg mt-2">
                  при организации {cert.organizationName}
                </p>
              )}
            </div>

            {/* Footer with Signatures, Date and QR */}
            <div className="absolute bottom-16 left-20 right-20 flex justify-between items-end">
              
              {/* Left side: Date & ID */}
              <div className="text-left w-64">
                <div className="border-b border-slate-300 pb-2 mb-2">
                  <span className="text-lg font-bold text-slate-800">{issuedDate}</span>
                </div>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-400">Дата выдачи</p>
                <p className="text-[10px] font-mono text-slate-400 mt-4">ID: {cert.certificateNumber}</p>
              </div>

              {/* Center: Achievement Seal */}
              <div className="flex flex-col items-center">
                <div className="w-28 h-28 bg-amber-100 rounded-full flex items-center justify-center border-4 border-amber-500/20 relative shadow-inner">
                  <div className="absolute inset-2 border border-dashed border-amber-500/50 rounded-full animate-[spin_20s_linear_infinite]" />
                  <div className="text-center">
                    <CheckCircle className="w-8 h-8 text-amber-600 mx-auto mb-1" />
                    <span className="block text-2xl font-black text-amber-700 leading-none">{cert.percentage}%</span>
                  </div>
                </div>
              </div>

              {/* Right side: QR Code */}
              <div className="text-right w-64 flex flex-col items-end">
                {qrCodeDataUrl ? (
                  <div className="p-3 bg-white rounded-xl shadow-md border hover:scale-105 transition-transform">
                    <img src={qrCodeDataUrl} alt="Verify Certificate" className="w-24 h-24" />
                  </div>
                ) : (
                  <div className="w-[124px] h-[124px] bg-slate-100 rounded-xl" />
                )}
                <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mt-3 text-right">Валидация QR</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[150px]">Наведите камеру смартфона для проверки документа</p>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificatePage;
