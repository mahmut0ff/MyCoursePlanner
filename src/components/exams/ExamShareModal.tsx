import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { X, Copy, Download, Printer, Check, QrCode, ExternalLink } from 'lucide-react';

interface ExamShareModalProps {
  examId: string;
  examTitle: string;
  /** Public link only works for published exams. */
  published: boolean;
  onClose: () => void;
}

/**
 * Share an exam as a public, scannable QR code + link.
 * Anyone who scans opens /test/:examId, enters their name + phone, and takes
 * the exam as a guest. Results land in the org's Leads (Заявки) with an AI verdict.
 */
const ExamShareModal: React.FC<ExamShareModalProps> = ({ examId, examTitle, published, onClose }) => {
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/test/${examId}`;
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 480, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [publicUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl)
      .then(() => {
        setCopied(true);
        toast.success('Ссылка скопирована');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('Не удалось скопировать ссылку'));
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const safe = examTitle.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'exam';
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${safe}-qr.png`;
    a.click();
  };

  const printPoster = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>${examTitle} — QR</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 40px; background: white; }
          .poster { width: 100%; max-width: 520px; text-align: center; }
          .badge { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #6366f1; margin-bottom: 12px; }
          h1 { font-size: 30px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
          .desc { font-size: 15px; color: #64748b; margin-bottom: 28px; line-height: 1.5; }
          .qr img { width: 280px; height: 280px; }
          .url { font-size: 13px; color: #6366f1; word-break: break-all; margin: 20px 0 16px; }
          .cta { font-size: 17px; font-weight: 700; color: #1e293b; padding: 14px 28px; border: 2px solid #e2e8f0; border-radius: 14px; display: inline-block; }
        </style>
      </head><body>
        <div class="poster">
          <div class="badge">Онлайн-тестирование</div>
          <h1>${examTitle}</h1>
          <p class="desc">Отсканируйте QR-код камерой телефона, чтобы пройти тест</p>
          <div class="qr"><img src="${qrDataUrl}" /></div>
          <p class="url">${publicUrl}</p>
          <div class="cta">Сканируйте, чтобы начать</div>
        </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 exam-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Поделиться тестом</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!published && (
            <div className="mb-5 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-3 rounded-xl border border-amber-200 dark:border-amber-800/30 font-medium">
              Экзамен нужно <b>опубликовать</b>, чтобы ссылка и QR-код заработали.
            </div>
          )}

          {/* QR */}
          <div className="flex justify-center mb-5">
            <div className={`bg-white p-4 rounded-2xl border border-slate-200 shadow-sm ${!published ? 'opacity-40' : ''}`}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR-код теста" className="w-52 h-52" />
                : <div className="w-52 h-52 flex items-center justify-center text-slate-400 text-sm">Генерация…</div>}
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
            Студент сканирует QR-код, вводит имя и телефон и проходит тест как гость.
            Результат и вердикт ИИ появятся в разделе <b>«Заявки»</b>.
          </p>

          {/* Link row */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 mb-4">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-indigo-600 dark:text-indigo-400 truncate hover:underline flex items-center gap-1">
              {publicUrl}<ExternalLink className="w-3 h-3 shrink-0" />
            </a>
            <button onClick={copyLink} className="shrink-0 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Скопировать ссылку">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={downloadQR} disabled={!qrDataUrl || !published} className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              <Download className="w-4 h-4" /> Скачать QR
            </button>
            <button onClick={printPoster} disabled={!qrDataUrl || !published} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              <Printer className="w-4 h-4" /> Печать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamShareModal;
