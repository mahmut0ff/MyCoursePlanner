import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const fileUrl = searchParams.get('url');
  const fileType = searchParams.get('type') || '';
  const fileName = searchParams.get('name') || 'Документ';

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${fileName} - Просмотр документа`;
    return () => { document.title = 'Planula'; };
  }, [fileName]);

  if (!fileUrl) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Файл не найден</h2>
          <p className="text-slate-500 text-sm">Ссылка на документ недействительна или отсутствует.</p>
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
      <div className="h-14 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex items-center px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3 text-white overflow-hidden">
          {isImage && <ImageIcon className="w-5 h-5 text-emerald-400 shrink-0" />}
          {isVideo && <Film className="w-5 h-5 text-indigo-400 shrink-0" />}
          {isPdf && <FileText className="w-5 h-5 text-red-400 shrink-0" />}
          {viewerUrl && <FileText className="w-5 h-5 text-amber-400 shrink-0" />}
          
          <h1 className="font-semibold text-sm truncate" title={fileName}>{fileName}</h1>
        </div>
        <div className="ml-auto">
          <a
            href={fileUrl}
            download={fileName}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-lg transition-colors text-sm font-medium"
          >
            Скачать
          </a>
        </div>
      </div>

      {/* Viewer Content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-0">
             <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-4" />
             <p className="text-slate-400 text-sm">Загрузка документа...</p>
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
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">{fileName}</p>
            <p className="text-white/60 text-sm mb-6">Предпросмотр недоступен для этого типа файла</p>
            <a href={fileUrl} download={fileName} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl transition-colors">
              Скачать файл
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewerPage;
