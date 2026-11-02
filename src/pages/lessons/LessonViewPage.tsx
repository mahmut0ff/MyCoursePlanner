import React, { useEffect, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deleteLessonPlan } from '../../services/lessons.service';
import { apiGetLesson, apiAwardXP, apiCreateLesson, apiTransferRequest, orgCreateMaterial, apiStudentGetHomework } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { showGamificationToasts } from '../../components/gamification/GamificationToasts';
import { toast } from 'react-hot-toast';
import type { LessonPlan, HomeworkSubmission } from '../../types';
import { formatDate } from '../../utils/grading';
import { getVideoEmbedUrl, isDirectVideoFile } from '../../utils/videoEmbed';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import FileViewerModal from '../../components/ui/FileViewerModal';
import { HomeworkTelegramNotice } from '../../components/lessons/HomeworkTelegramNotice';
import { LessonSubmissionsPanel } from '../../components/lessons/LessonSubmissionsPanel';
import i18n from '../../i18n';
import { intlLocale } from '../../lib/locale';
import {
  ArrowLeft, Edit, Trash2, Clock, BookOpen, Paperclip, Download,
  FileText, Film, Image as LucideImage, FileSpreadsheet, ClipboardList,
  Calendar, Award, Maximize, Minimize, PartyPopper, CheckCircle, CheckCircle2, Copy, Building2
} from 'lucide-react';


const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <LucideImage className="w-5 h-5 text-emerald-500" />;
  if (type.startsWith('video/')) return <Film className="w-5 h-5 text-primary-500" />;
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
  if (type.startsWith('image/')) return i18n.t('lessons.view.fileImage', 'Изображение');
  if (type.startsWith('video/')) return i18n.t('lessons.view.fileVideo', 'Видео');
  if (type === 'application/pdf') return 'PDF';
  if (type.includes('word') || type.includes('document')) return 'Word';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'PowerPoint';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'Excel';
  return i18n.t('lessons.view.fileGeneric', 'Файл');
};

const LessonViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<{ name: string; url: string; type: string } | null>(null);
  
  // UI States
  const [presentationMode, setPresentationMode] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [copyingAttachment, setCopyingAttachment] = useState<string | null>(null);
  
  // Homework State
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);



  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

  useEffect(() => {
    if (id) {
      apiGetLesson(id)
        .then((data) => {
          setLesson(data);
          const viewedKey = `viewed_lesson_${id}`;
          if (localStorage.getItem(viewedKey)) {
             setIsCompleted(true);
          }
          
          if (data?.organizationId && role === 'student' && data.homework?.title) {
            apiStudentGetHomework(id)
              .then(res => {
                // apiStudentGetHomework returns array of submissions or empty array, based on api-homework.ts it returns a list but restricted by studentId
                // Wait, apiStudentGetHomework doesn't specify if it's array. Assuming it is. Array or object?
                // Actually my function may return a list since it's GET /api-homework?lessonId=... without ID path. Let's handle both
                if (Array.isArray(res) && res.length > 0) {
                  setSubmission(res[0]);
                } else if (res && !Array.isArray(res) && res.id) {
                  setSubmission(res);
                }
              })
              .catch(console.error);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id, role]);



  const handleDuplicate = async () => {
    if (!lesson) return;
    setDuplicating(true);
    try {
      if (profile?.activeOrgId && lesson.organizationId) {
        // Мы в организации, дублируем чей-то корпоративный урок СЕБЕ
        await apiTransferRequest({
          transferType: 'lesson_to_personal',
          sourceId: lesson.id!,
          targetId: 'personal',
          orgId: profile.activeOrgId,
          sourceTitle: lesson.title
        });
        toast.success(t('lessons.transferRequested', 'Запрос на копирование отправлен администратору'));
      } else {
        // Личный -> Личный, или Личный -> Организация
        const fullLesson = await apiGetLesson(lesson.id!);
        // @ts-ignore
        const { id: _id, createdAt, updatedAt, ...rest } = fullLesson;
        const newLessonData = { ...rest, title: t('lessons.copyTitle', '{{title}} (Копия)', { title: rest.title }), status: 'draft' };
        
        if (profile?.activeOrgId && !lesson.organizationId) {
          (newLessonData as any).organizationId = profile.activeOrgId;
        }

        const newLesson = await apiCreateLesson(newLessonData);
        toast.success(t('lessons.duplicated', 'Урок успешно скопирован'));
        navigate(`/lessons/${newLesson}`); // переходим в копию
      }
    } catch (err: any) {
      toast.error(err.message || t('lessons.view.copyFailed', 'Ошибка копирования'));
    } finally {
      setDuplicating(false);
    }
  };

  const handleCopyToOrgMaterials = async (att: any) => {
    if (!profile?.activeOrgId) {
       toast.error(t('lessons.view.selectOrg', 'Необходимо выбрать организацию'));
       return;
    }
    setCopyingAttachment(att.id);
    try {
      await orgCreateMaterial({
        title: att.name,
        type: att.type.startsWith('image/') ? 'image' : att.type.startsWith('video/') ? 'video' : 'document',
        url: att.url,
        mimeType: att.type,
        sizeBytes: att.size,
        category: t('lessons.view.materialsCategory', 'Материалы из уроков'),
        description: t('lessons.view.addedFromLesson', 'Добавлено из урока «{{title}}»', { title: lesson?.title })
      });
      toast.success(t('lessons.view.copiedToMaterials', 'Успешно скопировано в Материалы организации!'));
    } catch (err: any) {
      toast.error(err.message || t('lessons.view.copyFailed', 'Ошибка копирования'));
    } finally {
      setCopyingAttachment(null);
    }
  };

  const handleCompleteLesson = async () => {
    if (!lesson?.organizationId || role !== 'student' || isCompleted) return;
    setCompleting(true);
    try {
      const res: any = await apiAwardXP({ 
        type: 'lesson', 
        sourceType: 'lesson',
        sourceId: lesson.id,
        organizationId: lesson.organizationId 
      });
      showGamificationToasts(res.newBadges, res.leveledUp);
      const viewedKey = `viewed_lesson_${id}`;
      localStorage.setItem(viewedKey, 'true');
      setIsCompleted(true);
      // Optional: triggers a nice confetti effect locally if a library exists,
      // but GamificationToasts already displays a nice popup.
    } catch (e: any) {
      console.error(e);
      toast.error(t('lessons.view.xpFailed', 'Не удалось начислить баллы. Попробуйте ещё раз.'));
      // DO NOT mark as completed — XP was not awarded
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm(t('lessons.confirmDelete', 'Вы уверены, что хотите удалить этот урок?'))) return;
    await deleteLessonPlan(id);
    navigate('/lessons');
  };

  const contentEl = useMemo(() => {
    if (!lesson?.content) return null;
    try {
      const html = generateHTML(lesson.content as any, [StarterKit, LinkExtension, ImageExtension, Youtube]);
      const cleanHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      return <div className="prose prose-slate dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
    } catch {
      return <p className="text-slate-500 dark:text-slate-400">{t('lessons.contentError', 'Не удалось отобразить содержание.')}</p>;
    }
  }, [lesson?.content, t]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  }

  if (!lesson) {
    return (
      <div className="text-center py-20">
        <BookOpen className="w-6 h-6 text-slate-400 mx-auto mb-2" />
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('lessons.notFound', 'Урок не найден')}</h3>
        <Link to="/lessons" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm mt-2 inline-block">{t('lessons.backToList', 'Вернуться к урокам')}</Link>
      </div>
    );
  }

  const attachments = lesson.attachments || [];
  const hw = lesson.homework;
  const videoEmbedUrl = lesson.videoUrl ? getVideoEmbedUrl(lesson.videoUrl) : null;
  const videoIsFile = !videoEmbedUrl && !!lesson.videoUrl && isDirectVideoFile(lesson.videoUrl);

  return (
    <div className={presentationMode ? 'fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-900 overflow-y-auto px-4 py-8 md:p-12 lg:px-32 xl:px-64 animate-in fade-in zoom-in-95 duration-200' : 'max-w-7xl mx-auto'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {!presentationMode && <button onClick={() => navigate('/lessons')} className="btn-ghost flex items-center gap-1.5"><ArrowLeft className="w-3.5 h-3.5" />{t('common.back', 'Назад')}</button>}
          {presentationMode && <h1 className="text-sm font-semibold text-slate-500 line-clamp-1 border-r border-slate-300 dark:border-slate-700 pr-3">{lesson.title}</h1>}
          <button 
            onClick={() => setPresentationMode(!presentationMode)} 
            className="btn-ghost flex items-center gap-1.5"
          >
            {presentationMode ? <><Minimize className="w-3.5 h-3.5"/> {t('lessons.view.exitPresentation', 'Вернуться в систему')}</> : <><Maximize className="w-3.5 h-3.5" /> {t('lessons.view.presentationMode', 'Режим презентации')}</>}
          </button>


        </div>
        {isStaff && !presentationMode && (
          <div className="flex items-center gap-2">
            <button onClick={handleDuplicate} disabled={duplicating} className="btn-secondary flex items-center gap-1.5">
              {duplicating ? <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              {t('common.duplicate', 'Дублировать')}
            </button>
            <Link to={`/lessons/${id}/edit`} className="btn-secondary flex items-center gap-1.5"><Edit className="w-3.5 h-3.5" />{t('common.edit')}</Link>
            <button onClick={handleDelete} className="btn-danger flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />{t('common.delete')}</button>
          </div>
        )}
      </div>

      <div className={`flex flex-col lg:flex-row items-start gap-4`}>
        <div className={`w-full ${(!presentationMode && isStaff && lesson?.organizationId && hw?.title) ? 'lg:w-[65%] xl:w-[70%]' : ''} card overflow-hidden ${presentationMode ? 'shadow-pop ring-1 ring-slate-900/5 dark:ring-white/10' : ''}`}>
        
        {/* Cover Hero */}
        {lesson.coverImageUrl && (
          <div className="h-48 sm:h-64 md:h-80 w-full relative">
            <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-4">
               <div className="flex flex-wrap gap-2">
                 <span className="inline-flex items-center h-5 px-1.5 rounded bg-white/90 text-slate-900 text-xs font-medium">{lesson.subject}</span>
                 <span className="inline-flex items-center h-5 px-1.5 rounded bg-black/30 text-white text-xs font-medium">{t(`lessons.${String(lesson.level).toLowerCase()}`, lesson.level)}</span>
               </div>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6">
          {!lesson.coverImageUrl && (
             <div className="flex items-center gap-2 mb-4 flex-wrap">
               <span className="badge-primary">{lesson.subject}</span>
               <span className="badge-slate">{t(`lessons.${String(lesson.level).toLowerCase()}`, lesson.level)}</span>
               {lesson.tags?.map((tag) => (
                 <span key={tag} className="badge-slate">{tag}</span>
               ))}
               <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ml-auto ${lesson.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                 {lesson.status === 'published' ? t('common.published', 'Опубликован') : t('common.draft', 'Черновик')}
               </span>
             </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-2">{lesson.title}</h1>
          <p className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed border-l-2 border-slate-200 dark:border-slate-700 pl-3">{lesson.description}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
            <span className="flex items-center gap-1.5 tabular-nums"><Clock className="w-3.5 h-3.5 text-slate-400" />{lesson.duration} {t('common.minutes', 'мин.')}</span>
            <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-slate-400" /> {t('lessons.byAuthor', 'Автор')}: <span className="text-slate-700 dark:text-slate-300">{lesson.authorName}</span></span>
            <span className="text-slate-400">{formatDate(lesson.createdAt)}</span>
          </div>

          {/* Embedded Video — only players our CSP can frame; the rest get a link. */}
          {videoEmbedUrl && (
            <div className="mb-6 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video relative group">
              <iframe
                src={videoEmbedUrl}
                title={lesson.title}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              ></iframe>
            </div>
          )}

          {videoIsFile && (
            <div className="mb-6 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video">
              <video src={lesson.videoUrl} controls preload="metadata" className="w-full h-full" />
            </div>
          )}

          {lesson.videoUrl && !videoEmbedUrl && !videoIsFile && (
            <a
              href={lesson.videoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mb-6 flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Film className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t('lessons.openVideo', 'Открыть видео-лекцию')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{lesson.videoUrl}</p>
              </div>
            </a>
          )}

          {/* Core Materials Section BEFORE LONGREAD */}
          {(attachments.length > 0 || (hw && hw.title)) && (
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {attachments.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                    {t('lessons.view.materials', 'Материалы урока')}
                    <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 ml-1">{attachments.length}</span>
                  </h2>
                  <div className="space-y-0.5">
                    {attachments.map((att) => (
                      <div key={att.id}
                        onClick={() => setViewerFile({ name: att.name, url: att.url, type: att.type })}
                        className="group flex items-center gap-2 min-h-[40px] px-2 py-1.5 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                        <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                          {getFileIcon(att.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 dark:text-slate-100 truncate font-medium">{att.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{getFileLabel(att.type)} • {formatSize(att.size)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isStaff && (
                            <button
                               onClick={(e) => { e.stopPropagation(); handleCopyToOrgMaterials(att); }}
                               disabled={copyingAttachment === att.id}
                               className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors tooltip"
                               data-tip={t('lessons.view.toOrgKb', 'В Базу Знаний организации')}
                            >
                               {copyingAttachment === att.id ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : <Building2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <a href={att.url} download={att.name} target="_blank" rel="noreferrer"
                             onClick={(e) => e.stopPropagation()}
                             className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors tooltip"
                             data-tip={t('lessons.view.download', 'Скачать')}>
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hw && hw.title && (!isStaff || presentationMode) && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                    <ClipboardList className="w-3.5 h-3.5 text-amber-500" />
                    {t('lessons.homework', 'Домашнее задание')}
                  </h2>
                  <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-1 text-sm">{hw.title}</h3>
                  {hw.description && <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mb-3 line-clamp-3">{hw.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    {hw.dueDate && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
                        <Calendar className="w-3 h-3 text-slate-400" /> {t('lessons.view.due', 'Срок: {{date}}', { date: new Date(hw.dueDate).toLocaleDateString(intlLocale()) })}
                      </span>
                    )}
                    {hw.points && hw.points > 0 && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
                        <Award className="w-3 h-3 text-slate-400" /> {t('lessons.view.gradeLabel', 'Оценка:')} {t('lessons.view.points', { count: hw.points })}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rich Content (Theory) */}
          <div className={`lesson-content mb-6 ${presentationMode ? 'prose-lg md:prose-xl max-w-none' : 'max-w-4xl'}`}>
            {contentEl}
          </div>

          {/* Completion Section (Students Only) */}
          {role === 'student' && (
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              
              {hw && hw.title && (
                <div className="w-full max-w-4xl mb-8">
                  {submission ? (
                    <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="hidden" />
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-2">
                          <div className="pt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {t('lessons.view.submitted', 'Домашнее задание сдано')}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(submission.submittedAt)}
                            </p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium shrink-0 ${
                          submission.status === 'graded' 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' 
                            : submission.status === 'reviewing' 
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        }`}>
                          {submission.status === 'graded' ? t('lessons.view.statusGraded', 'Оценено') : submission.status === 'reviewing' ? t('lessons.view.statusReviewing', 'На проверке') : t('lessons.view.statusPending', 'Ожидает проверки')}
                        </span>
                      </div>
                      
                      {submission.status === 'graded' && typeof submission.finalScore === 'number' && (
                        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                          <p className="text-slate-600 dark:text-slate-300 font-medium mb-1 text-sm">{t('lessons.view.teacherGrade', 'Оценка преподавателя:')} <span className="text-slate-900 dark:text-slate-100 text-base font-semibold tabular-nums ml-1">{submission.finalScore} / {submission.maxPoints || 10}</span></p>
                          {submission.teacherFeedback && (
                            <div className="text-slate-700 dark:text-slate-300 text-sm mt-2 pl-3 border-l-2 border-slate-300 dark:border-slate-600">
                              "{submission.teacherFeedback}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Доработать можно там же, где сдавали — в боте */}
                      {submission.status !== 'graded' && (
                        <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {t('lessons.view.amendHint', 'Нужно дополнить работу? Пришлите файл боту — он добавит его к этой сдаче.')}
                          </p>
                          <HomeworkTelegramNotice compact />
                        </div>
                      )}
                    </div>
                  ) : (
                    <HomeworkTelegramNotice />
                  )}
                </div>
              )}

              {isCompleted ? (
                <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
                  <div className="text-emerald-500 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('lessons.view.completedTitle', 'Урок успешно пройден!')}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">{t('lessons.view.completedDesc', 'Вы великолепны. Продолжайте в том же духе.')}</p>
                </div>
              ) : (
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{t('lessons.view.readAll', 'Прочитали весь материал?')}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mb-3 max-w-sm mx-auto">{t('lessons.view.readAllDesc', 'Отметьте урок как пройденный, чтобы заработать очки опыта и улучшить свой рейтинг!')}</p>
                  <button 
                    onClick={handleCompleteLesson}
                    disabled={completing}
                    className="btn-primary relative inline-flex items-center justify-center gap-1.5 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="hidden" />
                    {completing ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <PartyPopper className="w-3.5 h-3.5" />
                        {t('lessons.view.complete', 'Завершить урок')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>

        {isStaff && lesson?.organizationId && hw?.title && !presentationMode && (
          <div className="w-full lg:w-[35%] xl:w-[30%] lg:sticky lg:top-8 shrink-0 flex flex-col gap-3">
            {/* Домашнее задание INFO box in sidebar */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 text-amber-500" />
                {t('lessons.homework', 'Домашнее задание')}
              </h2>
              <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-1 text-sm">{hw.title}</h3>
              {hw.description && <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mb-3">{hw.description}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                {hw.dueDate && (
                  <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
                    <Calendar className="w-3 h-3 text-slate-400" /> {t('lessons.view.due', 'Срок: {{date}}', { date: new Date(hw.dueDate).toLocaleDateString(intlLocale()) })}
                  </span>
                )}
                {hw.points && hw.points > 0 && (
                  <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
                    <Award className="w-3 h-3 text-slate-400" /> {t('lessons.view.points', { count: hw.points })}
                  </span>
                )}
              </div>
            </div>

            {/* Сданные работы PANEL */}
            <LessonSubmissionsPanel lessonId={lesson.id!} organizationId={lesson.organizationId!} />
          </div>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewerFile && <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />}
    </div>
  );
};

export default LessonViewPage;
