import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getLessonPlan, deleteLessonPlan } from '../../services/lessons.service';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonPlan } from '../../types';
import { formatDate } from '../../utils/grading';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import FileViewerModal from '../../components/ui/FileViewerModal';
import {
  ArrowLeft, Edit, Trash2, Clock, BookOpen, Play, Paperclip, Download,
  FileText, Film, Image as LucideImage, FileSpreadsheet, ClipboardList,
  Calendar, Award,
} from 'lucide-react';

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <LucideImage className="w-5 h-5 text-emerald-500" />;
  if (type.startsWith('video/')) return <Film className="w-5 h-5 text-violet-500" />;
  if (type === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  if (type.includes('presentation') || type.includes('powerpoint')) return <FileText className="w-5 h-5 text-amber-500" />;
  if (type.includes('word') || type.includes('document')) return <FileText className="w-5 h-5 text-blue-500" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const getFileLabel = (type: string): string => {
  if (type.startsWith('image/')) return 'Изображение';
  if (type.startsWith('video/')) return 'Видео';
  if (type === 'application/pdf') return 'PDF';
  if (type.includes('word') || type.includes('document')) return 'Word';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'PowerPoint';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'Excel';
  return 'Файл';
};

const LessonViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role } = useAuth();
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<{ name: string; url: string; type: string } | null>(null);
  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    if (id) {
      getLessonPlan(id)
        .then(setLesson)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm(t('lessons.confirmDelete', 'Вы уверены, что хотите удалить этот урок?'))) return;
    await deleteLessonPlan(id);
    navigate('/lessons');
  };

  const renderContent = () => {
    if (!lesson?.content) return null;
    try {
      const html = generateHTML(lesson.content as any, [StarterKit, LinkExtension, ImageExtension, Youtube]);
      return <div className="prose prose-slate dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <p className="text-slate-500 dark:text-slate-400">{t('lessons.contentError', 'Не удалось отобразить содержание.')}</p>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;
  }

  if (!lesson) {
    return (
      <div className="text-center py-20">
        <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('lessons.notFound', 'Урок не найден')}</h3>
        <Link to="/lessons" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm mt-2 inline-block">{t('lessons.backToList', 'Вернуться к урокам')}</Link>
      </div>
    );
  }

  const attachments = lesson.attachments || [];
  const hw = lesson.homework;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/lessons')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />{t('common.back', 'Назад')}</button>
        {isStaff && (
          <div className="flex items-center gap-2">
            <Link to={`/lessons/${id}/edit`} className="btn-secondary flex items-center gap-2"><Edit className="w-4 h-4" />{t('common.edit')}</Link>
            <button onClick={handleDelete} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" />{t('common.delete')}</button>
          </div>
        )}
      </div>

      {/* Hero */}
      {lesson.coverImageUrl && (
        <div className="rounded-2xl overflow-hidden mb-6 h-64 md:h-80">
          <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="badge-primary">{lesson.subject}</span>
          <span className="badge-slate">{lesson.level}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${lesson.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
            {lesson.status === 'published' ? t('common.published') : t('common.draft')}
          </span>
          {lesson.tags?.map((tag) => (
            <span key={tag} className="badge-slate">{tag}</span>
          ))}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">{lesson.title}</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{lesson.description}</p>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-slate-500 dark:text-slate-400 mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{lesson.duration} {t('common.minutes', 'мин.')}</span>
          <span>{t('lessons.byAuthor', 'Автор')}: {lesson.authorName}</span>
          <span>{formatDate(lesson.createdAt)}</span>
          {attachments.length > 0 && (
            <span className="flex items-center gap-1.5"><Paperclip className="w-4 h-4" />{attachments.length} {t('lessons.files', 'файлов')}</span>
          )}
        </div>

        {lesson.videoUrl && (
          <div className="mb-8">
            <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-2">
              <Play className="w-4 h-4" />{t('lessons.watchVideo', 'Смотреть видео')}
            </a>
          </div>
        )}

        {/* Rich Content */}
        <div className="lesson-content mb-8">
          {renderContent()}
        </div>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="card p-6 mt-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary-500" />
            {t('lessons.attachments', 'Вложения')}
            <span className="text-xs text-slate-400 font-normal">({attachments.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attachments.map((att) => (
              <div key={att.id}
                onClick={() => setViewerFile({ name: att.name, url: att.url, type: att.type })}
                className="group flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200/50 dark:border-slate-700/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {getFileIcon(att.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 dark:text-white truncate font-medium group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{att.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{getFileLabel(att.type)}</span>
                    <span>•</span>
                    <span>{formatSize(att.size)}</span>
                  </div>
                </div>
                <a href={att.url} download={att.name} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 text-slate-400 hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg">
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Homework */}
      {hw && hw.title && (
        <div className="card p-6 mt-4 border-l-4 border-amber-400">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-amber-500" />
            {t('lessons.homework', 'Домашнее задание')}
          </h2>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{hw.title}</h3>
          {hw.description && <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mb-4">{hw.description}</p>}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {hw.dueDate && (
              <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-lg">
                <Calendar className="w-3.5 h-3.5" /> {new Date(hw.dueDate).toLocaleDateString()}
              </span>
            )}
            {hw.points && hw.points > 0 && (
              <span className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 px-2.5 py-1 rounded-lg">
                <Award className="w-3.5 h-3.5" /> {hw.points} {t('lessons.homeworkPoints', 'баллов')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewerFile && <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />}
    </div>
  );
};

export default LessonViewPage;
