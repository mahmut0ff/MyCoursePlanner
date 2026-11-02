import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Film, AlertTriangle, Loader2 } from 'lucide-react';

const getViewerUrl = (url: string, type: string): string | null => {
  if (type.startsWith('image/') || type.startsWith('video/') || type === 'application/pdf') return null; // Native support
  
  // Word / PPT / Excel → Google Docs Viewer
  const officeTypes = [
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  
  if (officeTypes.includes(type) || type.includes('document') || type.includes('presentation')) {
    // Sometimes URL must be encoded
    return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  }
  return null;
};

const DocumentViewerPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const fileUrl = searchParams.get('url');
  const fileType = searchParams.get('type') || '';
  const fileName = searchParams.get('name') || t('viewer.defaultName', 'Документ');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${fileName} - ${t('viewer.pageTitle', 'Просмотр документа')}`;
    return () => { document.title = 'SabakHub'; };
  }, [fileName, t]);

  if (!fileUrl) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('viewer.notFound', 'Файл не найден')}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('viewer.invalidLink', 'Ссылка на документ недействительна или отсутствует.')}</p>
        </div>
      </div>
    );
  }

  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const isPdf = fileType === 'application/pdf';
  const viewerUrl = getViewerUrl(fileUrl, fileType);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Viewer Header */}
      <div className="h-12 bg-slate-950 border-b border-slate-800 flex items-center px-4 shrink-0 z-10">
        <div className="flex items-center gap-2 text-white overflow-hidden">
          {isImage && <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          {isVideo && <Film className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          {isPdf && <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          {viewerUrl && <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          
          <h1 className="font-medium text-sm truncate" title={fileName}>{fileName}</h1>
        </div>
        <div className="ml-auto">
          <a
            href={fileUrl}
            download={fileName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-md transition-colors text-sm font-medium"
          >
            {t('viewer.download', 'Скачать')}
          </a>
        </div>
      </div>

      {/* Viewer Content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-0">
             <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-2" />
             <p className="text-slate-400 text-sm">{t('viewer.loading', 'Загрузка документа...')}</p>
          </div>
        )}

        {isImage && (
          <img 
            src={fileUrl} 
            alt={fileName} 
            className="max-w-full max-h-full object-contain relative z-10"
            onLoad={() => setLoading(false)}
          />
        )}

        {isVideo && (
          <video 
            src={fileUrl} 
            controls 
            autoPlay 
            className="w-full h-full object-contain bg-black relative z-10"
            onLoadedData={() => setLoading(false)}
          />
        )}

        {isPdf && (
           <iframe 
            src={fileUrl} 
            title={fileName} 
            className="w-full h-full bg-white relative z-10 border-0" 
            onLoad={() => setLoading(false)}
          />
        )}

        {viewerUrl && (
          // Google Docs Viewer needs to be full width/height
          <iframe 
            src={viewerUrl} 
            title={fileName} 
            className="w-full h-full bg-white relative z-10 border-0" 
            onLoad={() => setLoading(false)}
          />
        )}

        {!isImage && !isVideo && !isPdf && !viewerUrl && (
          <div className="text-center text-white relative z-10">
            <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium mb-1">{fileName}</p>
            <p className="text-white/60 text-xs mb-4">{t('viewer.noPreview', 'Предпросмотр недоступен для этого типа файла')}</p>
            <a href={fileUrl} download={fileName} target="_blank" rel="noreferrer"
              className="btn-primary inline-flex items-center gap-1.5">
              {t('viewer.downloadFile', 'Скачать файл')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewerPage;
