import React, { useState, useRef } from 'react';
import { Upload, X, ImageIcon, Loader2, CheckCircle2, FileVideo } from 'lucide-react';
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
  type: 'image' | 'video' | 'file';
  error?: string;
}

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

  const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

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

      if (!isImage && !isVideo) {
        toast.error(`Файл ${file.name} не поддерживается. Только фото и видео.`);
        return;
      }

      if (isImage && file.size > MAX_IMAGE_SIZE) {
        toast.error(`Фото ${file.name} превышает 3МБ`);
        return;
      }

      if (isVideo && file.size > MAX_VIDEO_SIZE) {
        toast.error(`Видео ${file.name} превышает 50МБ`);
        return;
      }

      validFiles.push({
        id: Math.random().toString(36).substring(7),
        file,
        progress: 0,
        type: isImage ? 'image' : 'video'
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

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
      <div className="flex justify-between items-start mb-2">
         <h3 className="text-2xl font-bold text-white">Сдача домашнего задания</h3>
         <span className="text-sm font-bold text-accent-teal uppercase tracking-wider">Макс. балл: {maxPoints}</span>
      </div>
      <p className="text-gray-400 mb-6 text-sm">
        Урок: <span className="text-white font-medium">{lessonTitle}</span><br />
        Опишите ваше решение и прикрепите фото (до 3МБ) или видео (до 50МБ).
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Ваш ответ..."
            rows={4}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-teal/50 transition-all resize-none"
          />
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative overflow-hidden border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
            isDragging 
              ? 'border-accent-teal bg-accent-teal/10' 
              : 'border-white/20 hover:border-white/40 hover:bg-white/5'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,video/*"
          />
          <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
            <div className="p-4 bg-white/5 rounded-full">
              <Upload className={`w-8 h-8 ${isDragging ? 'text-accent-teal' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="text-white font-medium mb-1">
                Нажмите или перетащите файлы сюда
              </p>
              <p className="text-gray-400 text-sm">
                Фотографии (до 3 МБ) или одно видео (до 50 МБ)
              </p>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-3">
            {files.map(file => (
              <div 
                key={file.id}
                className="flex items-center gap-4 bg-black/20 border border-white/10 p-3 rounded-xl"
              >
                <div className="p-2 bg-white/5 rounded-lg shrink-0">
                  {file.type === 'image' ? (
                    <ImageIcon className="w-5 h-5 text-accent-teal" />
                  ) : (
                    <FileVideo className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-medium text-white truncate pr-4">
                      {file.file.name}
                    </p>
                    {file.error ? (
                      <span className="text-xs text-red-400">Ошибка</span>
                    ) : file.progress === 100 ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <span className="text-xs text-gray-400">{file.progress}%</span>
                    )}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        file.error ? 'bg-red-500' : file.progress === 100 ? 'bg-green-500' : 'bg-accent-teal'
                      }`}
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isSubmitting || files.some(f => f.progress < 100 && !f.error)}
            className="flex items-center gap-2 bg-accent-teal text-white px-6 py-3 rounded-xl font-medium hover:bg-accent-teal/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(45,212,191,0.3)] hover:shadow-[0_0_25px_rgba(45,212,191,0.5)]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Отправка...
              </>
            ) : (
              'Отправить работу'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
