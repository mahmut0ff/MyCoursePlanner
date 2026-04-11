import React, { useState, useRef } from 'react';
import { Upload, X, ImageIcon, Loader2, CheckCircle2, FileVideo, FileAudio, FileArchive, FileText, Send, Paperclip, Award } from 'lucide-react';
import { uploadFileWithProgress } from '../../services/storage.service';
import toast from 'react-hot-toast';

interface StudentHomeworkFormProps {
  lessonId: string;
  lessonTitle: string;
  organizationId: string;
  maxPoints?: number;
  onSubmit: (data: { content: string; attachments: any[] }) => Promise<void>;
  isSubmitting: boolean;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  url?: string;
  type: 'image' | 'video' | 'audio' | 'archive' | 'document';
  error?: string;
}

const FILE_TYPE_CONFIG = {
  image:    { icon: ImageIcon,    color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  video:    { icon: FileVideo,    color: 'text-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  audio:    { icon: FileAudio,    color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20' },
  archive:  { icon: FileArchive,  color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-900/20' },
  document: { icon: FileText,     color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1048576).toFixed(1) + ' МБ';
};

export const StudentHomeworkForm: React.FC<StudentHomeworkFormProps> = ({
  lessonId,
  lessonTitle,
  maxPoints = 10,
  onSubmit,
  isSubmitting
}) => {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGE_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB
  const MAX_FILE_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (newFiles: File[]) => {
    const validFiles: UploadingFile[] = [];

    newFiles.forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      
      const isArchive = file.name.endsWith('.zip') || file.name.endsWith('.rar') || file.name.endsWith('.7z') || file.type.includes('zip') || file.type.includes('rar') || file.type.includes('tar');
      const isDocument = file.name.endsWith('.pdf') || file.name.endsWith('.doc') || file.name.endsWith('.docx') || file.type.includes('pdf') || file.type.includes('word') || file.type.includes('text') || file.name.endsWith('.py') || file.name.endsWith('.js') || file.name.endsWith('.ino') || file.name.endsWith('.sb3') || file.name.endsWith('.txt');

      let type: 'image' | 'video' | 'audio' | 'archive' | 'document' = 'document';
      if (isImage) type = 'image';
      else if (isVideo) type = 'video';
      else if (isAudio) type = 'audio';
      else if (isArchive) type = 'archive';
      else type = 'document';

      if (!isImage && !isVideo && !isAudio && !isArchive && !isDocument) {
        toast.error(`Файл ${file.name} не поддерживается. Только медиа, архивы и документы.`);
        return;
      }

      if ((type === 'image' || type === 'audio') && file.size > MAX_IMAGE_AUDIO_SIZE) {
        toast.error(`Файл ${file.name} превышает 15МБ`);
        return;
      }

      if ((type === 'video' || type === 'archive' || type === 'document') && file.size > MAX_FILE_VIDEO_SIZE) {
        toast.error(`Файл ${file.name} превышает 50МБ`);
        return;
      }

      validFiles.push({
        id: Math.random().toString(36).substring(7),
        file,
        progress: 0,
        type
      });
    });

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
      validFiles.forEach((uf) => uploadFileStart(uf));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFileStart = async (uploadingFile: UploadingFile) => {
    try {
      const safeName = uploadingFile.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `homeworks/${lessonId}/${Date.now()}-${safeName}`;
      
      const url = await uploadFileWithProgress(storagePath, uploadingFile.file, (progress) => {
        setFiles(prev => prev.map(f => f.id === uploadingFile.id ? { ...f, progress } : f));
      });

      setFiles(prev => prev.map(f => f.id === uploadingFile.id ? { ...f, progress: 100, url } : f));
    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => f.id === uploadingFile.id ? { ...f, error: 'Ошибка загрузки' } : f));
      toast.error(`Не удалось загрузить ${uploadingFile.file.name}`);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim() && files.length === 0) {
      toast.error('Добавьте ответ или прикрепите файлы');
      return;
    }

    const uploading = files.filter(f => f.progress < 100 && !f.error);
    if (uploading.length > 0) {
      toast.error('Дождитесь завершения загрузки файлов');
      return;
    }

    const attachments = files
      .filter(f => f.url)
      .map(f => ({
        url: f.url!,
        type: f.type,
        name: f.file.name,
        size: f.file.size
      }));

    await onSubmit({ content, attachments });
  };

  const uploadedCount = files.filter(f => f.url).length;
  const uploadingCount = files.filter(f => f.progress < 100 && !f.error).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-200/70 dark:border-amber-700/40 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80 shadow-xl shadow-amber-100/30 dark:shadow-black/20">
      
      {/* Decorative gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />

      {/* Header */}
      <div className="px-6 sm:px-8 pt-7 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg shadow-amber-400/20">
              <Paperclip className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Сдача домашнего задания
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {lessonTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-3.5 py-2 rounded-xl shadow-md shadow-violet-500/15 shrink-0">
            <Award className="w-3.5 h-3.5" />
            <span className="text-[12px] font-bold tracking-wide">{maxPoints} баллов</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="px-6 sm:px-8 space-y-5">

          {/* Textarea */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Ваш ответ
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Опишите ваше решение, мысли, выводы..."
              rows={5}
              className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 dark:focus:ring-amber-500/30 dark:focus:border-amber-500 transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Drop Zone */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Файлы и вложения
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative overflow-hidden border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 group ${
                isDragging 
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10 scale-[1.01]' 
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:border-amber-300 dark:hover:border-amber-600 hover:bg-amber-50/50 dark:hover:bg-amber-900/5'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.rar,.7z,.py,.js,.ino,.sb3,.txt"
              />
              <div className="flex flex-col items-center justify-center py-8 px-4 pointer-events-none">
                <div className={`p-3.5 rounded-2xl mb-3 transition-all duration-300 ${
                  isDragging 
                    ? 'bg-amber-100 dark:bg-amber-900/30 scale-110' 
                    : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/20'
                }`}>
                  <Upload className={`w-6 h-6 transition-colors ${isDragging ? 'text-amber-500' : 'text-slate-400 group-hover:text-amber-500'}`} />
                </div>
                <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Нажмите или перетащите файлы
                </p>
                <p className="text-[12px] text-slate-400 dark:text-slate-500">
                  Фото/Аудио до 15 МБ • Видео/Архивы/Код до 50 МБ
                </p>
              </div>
            </div>
          </div>

          {/* Uploaded Files */}
          {files.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Загруженные файлы
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {uploadedCount}/{files.length} готово
                  {uploadingCount > 0 && <span className="text-amber-500 ml-1.5">• {uploadingCount} загружается</span>}
                </p>
              </div>
              {files.map(file => {
                const cfg = FILE_TYPE_CONFIG[file.type];
                const FileIcon = cfg.icon;
                return (
                  <div 
                    key={file.id}
                    className="flex items-center gap-3 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 rounded-xl transition-all hover:shadow-sm"
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${cfg.bg}`}>
                      <FileIcon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate pr-3">
                          {file.file.name}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400 font-medium">{formatSize(file.file.size)}</span>
                          {file.error ? (
                            <span className="text-[10px] text-red-500 font-semibold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md">Ошибка</span>
                          ) : file.progress === 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <span className="text-[11px] text-amber-500 font-bold tabular-nums">{file.progress}%</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="h-1 w-full bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            file.error ? 'bg-red-400' : file.progress === 100 ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-5 mt-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] text-slate-400 dark:text-slate-500 hidden sm:block">
              {!content.trim() && files.length === 0
                ? 'Напишите ответ или прикрепите файлы для отправки'
                : `${content.trim() ? '✏️ Ответ' : ''}${content.trim() && files.length > 0 ? ' + ' : ''}${files.length > 0 ? `📎 ${files.length} файл(ов)` : ''}`
              }
            </p>
            <button
              type="submit"
              disabled={isSubmitting || files.some(f => f.progress < 100 && !f.error)}
              className="flex items-center gap-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white px-7 py-3 rounded-xl font-bold text-[14px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Отправить работу
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
