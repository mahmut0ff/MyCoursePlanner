import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Maximize2, Minimize2, FileText, Image as ImageIcon, Film, FileSpreadsheet } from 'lucide-react';

interface FileViewerModalProps {
  file: { name: string; url: string; type: string } | null;
  onClose: () => void;
}

export const getViewerUrl = (url: string, type: string, name?: string): string | null => {
  if (type?.startsWith('image/') || type?.startsWith('video/') || type === 'application/pdf') return null; // handled natively
  
  const safeName = (name || '').toLowerCase();
  
  // Microsoft Office Viewer handles Office documents much better without forcing downloads from iframes
  const isOffice = 
    type?.includes('msword') || type?.includes('wordprocessingml') || 
    type?.includes('ms-excel') || type?.includes('spreadsheetml') ||
    type?.includes('ms-powerpoint') || type?.includes('presentationml') ||
    safeName.endsWith('.doc') || safeName.endsWith('.docx') ||
    safeName.endsWith('.xls') || safeName.endsWith('.xlsx') ||
    safeName.endsWith('.ppt') || safeName.endsWith('.pptx');

  if (isOffice) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  
  // If we suspect it's a generic text file, maybe fallback to Google Docs or direct link
  if (safeName.endsWith('.txt') || type === 'text/plain') {
    return url; // browsers natively display text
  }

  return null;
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5" />;
  if (type.startsWith('video/')) return <Film className="w-5 h-5" />;
  if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet className="w-5 h-5" />;
  return <FileText className="w-5 h-5" />;
};

const FileViewerModal: React.FC<FileViewerModalProps> = ({ file, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'f' || e.key === 'F') setIsFullscreen((p) => !p);
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
    };
  }, [handleKeydown]);

  if (!file) return null;

  const { name, url, type } = file;
  const viewerUrl = getViewerUrl(url, type, name);
  const isImage = type?.startsWith('image/');
  const isVideo = type?.startsWith('video/');
  const isPdf = type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-white min-w-0">
          {getFileIcon(type)}
          <span className="text-sm font-medium truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <a href={url} download={name} target="_blank" rel="noreferrer"
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Download">
            <Download className="w-4 h-4" />
          </a>
          <button onClick={(e) => { e.stopPropagation(); setIsFullscreen((p) => !p); }}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Fullscreen (F)">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 flex items-center justify-center overflow-auto p-4 ${isFullscreen ? '' : 'sm:p-8'}`} onClick={(e) => e.stopPropagation()}>
        {isImage && (
          <img src={url} alt={name} className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl ${isFullscreen ? 'w-full h-full object-contain' : ''}`} />
        )}

        {isVideo && (
          <video src={url} controls autoPlay className={`max-w-full max-h-full rounded-lg shadow-2xl ${isFullscreen ? 'w-full h-full' : 'max-h-[80vh]'}`}>
            Your browser does not support the video tag.
          </video>
        )}

        {isPdf && (
          <iframe src={url} title={name} className={`bg-white rounded-lg shadow-2xl ${isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl h-[80vh]'}`} />
        )}

        {viewerUrl && (
          <iframe src={viewerUrl} title={name} className={`bg-white rounded-lg shadow-2xl ${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl h-[80vh]'}`} />
        )}

        {!isImage && !isVideo && !isPdf && !viewerUrl && (
          <div className="text-center text-white">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">{name}</p>
            <p className="text-white/60 text-sm mb-6">Предпросмотр недоступен для этого типа файла</p>
            <a href={url} download={name} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors">
              <Download className="w-4 h-4" /> Скачать файл
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileViewerModal;
