import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deleteLessonPlan } from '../../services/lessons.service';
import { apiGetLesson, apiAwardXP, apiCreateLesson, apiTransferRequest, orgCreateMaterial, apiStudentGetHomework, apiSubmitHomework } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { showGamificationToasts } from '../../components/gamification/GamificationToasts';
import { toast } from 'react-hot-toast';
import type { LessonPlan, HomeworkSubmission } from '../../types';
import { formatDate } from '../../utils/grading';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import FileViewerModal from '../../components/ui/FileViewerModal';
import { StudentHomeworkForm } from '../../components/lessons/StudentHomeworkForm';
import {
  ArrowLeft, Edit, Trash2, Clock, BookOpen, Paperclip, Download,
  FileText, Film, Image as LucideImage, FileSpreadsheet, ClipboardList,
  Calendar, Award, Maximize, Minimize, PartyPopper, CheckCircle, CheckCircle2, Copy, Building2
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

const getEmbedUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
  if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/').split('&')[0];
  if (url.includes('vimeo.com/')) return url.replace('vimeo.com/', 'player.vimeo.com/video/');
  return url;
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
  const [submittingHomework, setSubmittingHomework] = useState(false);

  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

  useEffect(() => {
    if (id) {
      apiGetLesson(id)
        .then((data) => {
          setLesson(data);
          const viewedKey = `viewed_lesson_${id}`;
          if (sessionStorage.getItem(viewedKey)) {
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
        const newLessonData = { ...rest, title: `${rest.title} (Копия)`, status: 'draft' };
        
        if (profile?.activeOrgId && !lesson.organizationId) {
          (newLessonData as any).organizationId = profile.activeOrgId;
        }

        const newLesson = await apiCreateLesson(newLessonData);
        toast.success(t('lessons.duplicated', 'Урок успешно скопирован'));
        navigate(`/lessons/${newLesson}`); // переходим в копию
      }
    } catch (err: any) {
      toast.error(err.message || 'Error duplicating');
    } finally {
      setDuplicating(false);
    }
  };

  const handleCopyToOrgMaterials = async (att: any) => {
    if (!profile?.activeOrgId) {
       toast.error('Необходимо выбрать организацию');
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
        category: 'Материалы из уроков',
        description: `Добавлено из урока "${lesson?.title}"`
      });
      toast.success('Успешно скопировано в Материалы организации!');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка копирования');
    } finally {
      setCopyingAttachment(null);
    }
  };

  const handleHomeworkSubmit = async (data: { content: string; attachments: any[] }) => {
    if (!lesson || !lesson.organizationId) return;
    setSubmittingHomework(true);
    try {
      const res = await apiSubmitHomework({
        lessonId: lesson.id!,
        lessonTitle: lesson.title,
        organizationId: lesson.organizationId,
        content: data.content,
        attachments: data.attachments,
        maxPoints: lesson.homework?.points || 10
      });
      setSubmission(res);
      toast.success('Домашнее задание отправлено на проверку!');
    } catch (e: any) {
      toast.error(e.message || 'Ошибка отправки');
    } finally {
      setSubmittingHomework(false);
    }
  };

  const handleCompleteLesson = async () => {
    if (!lesson?.organizationId || role !== 'student' || isCompleted) return;
    setCompleting(true);
    try {
      const res: any = await apiAwardXP({ type: 'lesson', organizationId: lesson.organizationId });
      showGamificationToasts(res.newBadges, res.leveledUp);
      const viewedKey = `viewed_lesson_${id}`;
      sessionStorage.setItem(viewedKey, 'true');
      setIsCompleted(true);
      // Optional: triggers a nice confetti effect locally if a library exists,
      // but GamificationToasts already displays a nice popup.
    } catch (e) {
      console.error(e);
    } finally {
      setCompleting(false);
    }
  };

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
    <div className={presentationMode ? 'fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-900 overflow-y-auto px-4 py-8 md:p-12 lg:px-32 xl:px-64 animate-in fade-in zoom-in-95 duration-200' : 'max-w-4xl mx-auto'}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {!presentationMode && <button onClick={() => navigate('/lessons')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />{t('common.back', 'Назад')}</button>}
          {presentationMode && <h1 className="text-sm font-semibold text-slate-500 line-clamp-1 border-r border-slate-300 dark:border-slate-700 pr-3">{lesson.title}</h1>}
          <button 
            onClick={() => setPresentationMode(!presentationMode)} 
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium text-sm transition-colors p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
          >
            {presentationMode ? <><Minimize className="w-4 h-4"/> Вернуться в систему</> : <><Maximize className="w-4 h-4" /> Режим презентации</>}
          </button>
        </div>
        {isStaff && !presentationMode && (
          <div className="flex items-center gap-2">
            <button onClick={handleDuplicate} disabled={duplicating} className="btn-secondary flex items-center gap-2">
              {duplicating ? <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> : <Copy className="w-4 h-4" />}
              {t('common.duplicate', 'Дублировать')}
            </button>
            <Link to={`/lessons/${id}/edit`} className="btn-secondary flex items-center gap-2"><Edit className="w-4 h-4" />{t('common.edit')}</Link>
            <button onClick={handleDelete} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" />{t('common.delete')}</button>
          </div>
        )}
      </div>

      <div className={`card overflow-hidden shadow-sm ${presentationMode ? 'shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10' : ''}`}>
        
        {/* Cover Hero */}
        {lesson.coverImageUrl && (
          <div className="h-48 sm:h-64 md:h-80 w-full relative">
            <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-6 sm:p-8">
               <div className="flex flex-wrap gap-2">
                 <span className="bg-primary-500/90 backdrop-blur text-white px-2.5 py-1 rounded-lg text-xs font-medium tracking-wide shadow-sm">{lesson.subject}</span>
                 <span className="bg-white/20 backdrop-blur text-white px-2.5 py-1 rounded-lg text-xs font-medium tracking-wide">{lesson.level}</span>
               </div>
            </div>
          </div>
        )}

        <div className="p-6 sm:p-8 md:p-10">
          {!lesson.coverImageUrl && (
             <div className="flex items-center gap-2 mb-4 flex-wrap">
               <span className="badge-primary">{lesson.subject}</span>
               <span className="badge-slate">{lesson.level}</span>
               {lesson.tags?.map((tag) => (
                 <span key={tag} className="badge-slate">{tag}</span>
               ))}
               <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ml-auto ${lesson.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                 {lesson.status === 'published' ? t('common.published', 'Опубликован') : t('common.draft', 'Черновик')}
               </span>
             </div>
          )}

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">{lesson.title}</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-slate-200 dark:border-slate-700">{lesson.description}</p>
          
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-slate-500 dark:text-slate-400 mb-8">
            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-slate-400" />{lesson.duration} {t('common.minutes', 'мин.')}</span>
            <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-slate-400" /> {t('lessons.byAuthor', 'Автор')}: <span className="text-slate-700 dark:text-slate-300">{lesson.authorName}</span></span>
            <span className="text-slate-400">{formatDate(lesson.createdAt)}</span>
          </div>

          {/* Embedded Video */}
          {lesson.videoUrl && (
            <div className="mb-10 w-full rounded-2xl overflow-hidden shadow-lg border border-slate-200/50 dark:border-slate-700/50 bg-black aspect-video relative group">
              <iframe 
                src={getEmbedUrl(lesson.videoUrl)} 
                title={lesson.title}
                className="w-full h-full" 
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              ></iframe>
            </div>
          )}

          {/* Core Materials Section BEFORE LONGREAD */}
          {(attachments.length > 0 || (hw && hw.title)) && (
            <div className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {attachments.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/50">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-primary-500" />
                    Материалы урока
                    <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 px-2 py-0.5 rounded-full text-[10px] ml-1">{attachments.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id}
                        onClick={() => setViewerFile({ name: att.name, url: att.url, type: att.type })}
                        className="group flex items-center gap-3 p-2 bg-white dark:bg-slate-700/30 rounded-xl border border-slate-200/50 dark:border-slate-600/50 cursor-pointer hover:border-primary-300 dark:hover:border-primary-500/50 hover:shadow-sm transition-all">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                          {getFileIcon(att.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-slate-800 dark:text-slate-200 truncate font-medium group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{att.name}</p>
                          <p className="text-[10px] text-slate-500">{getFileLabel(att.type)} • {formatSize(att.size)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isStaff && (
                            <button
                               onClick={(e) => { e.stopPropagation(); handleCopyToOrgMaterials(att); }}
                               disabled={copyingAttachment === att.id}
                               className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors tooltip"
                               data-tip="В Базу Знаний организации"
                            >
                               {copyingAttachment === att.id ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : <Building2 className="w-4 h-4" />}
                            </button>
                          )}
                          <a href={att.url} download={att.name} target="_blank" rel="noreferrer"
                             onClick={(e) => e.stopPropagation()}
                             className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors tooltip"
                             data-tip="Скачать">
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hw && hw.title && (
                <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-200/50 dark:border-amber-700/30">
                  <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-500" />
                    Домашнее задание
                  </h2>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-[15px]">{hw.title}</h3>
                  {hw.description && <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mb-4 line-clamp-3">{hw.description}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    {hw.dueDate && (
                      <span className="flex items-center gap-1.5 bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Срок: {new Date(hw.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {hw.points && hw.points > 0 && (
                      <span className="flex items-center gap-1.5 bg-white dark:bg-slate-800 shadow-sm border border-violet-100 dark:border-violet-800/30 text-violet-700 dark:text-violet-300 px-3 py-1.5 rounded-lg">
                        <Award className="w-3.5 h-3.5 text-violet-500" /> Оценка: {hw.points} {t('lessons.homeworkPoints', 'баллов')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rich Content (Theory) */}
          <div className={`lesson-content mb-10 ${presentationMode ? 'prose-lg md:prose-xl max-w-none' : 'max-w-none'}`}>
            {renderContent()}
          </div>

          {/* Completion Section (Students Only) */}
          {role === 'student' && (
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              
              {hw && hw.title && (
                <div className="w-full max-w-4xl mb-12">
                  {submission ? (
                    <div className="bg-white/5 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                            Домашнее задание сдано
                          </h3>
                          <p className="text-sm text-gray-400">
                            {formatDate(submission.submittedAt)}
                          </p>
                        </div>
                        <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {submission.status === 'graded' ? 'Оценено' : submission.status === 'reviewing' ? 'На проверке' : 'Ожидает проверки'}
                        </div>
                      </div>
                      
                      {submission.status === 'graded' && typeof submission.finalScore === 'number' && (
                        <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                          <p className="text-indigo-200 font-semibold mb-2">Оценка преподавателя: <span className="text-white text-xl ml-2">{submission.finalScore} / {submission.maxPoints || 10}</span></p>
                          {submission.teacherFeedback && (
                            <div className="text-indigo-100/80 text-sm mt-2 italic bg-black/20 p-3 rounded-lg border-l-2 border-indigo-500">
                              "{submission.teacherFeedback}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <StudentHomeworkForm 
                      lessonId={lesson.id!} 
                      lessonTitle={lesson.title}
                      organizationId={lesson.organizationId!}
                      maxPoints={hw.points}
                      onSubmit={handleHomeworkSubmit}
                      isSubmitting={submittingHomework}
                    />
                  )}
                </div>
              )}

              {isCompleted ? (
                <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center ring-4 ring-emerald-50 dark:ring-emerald-900/10">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Урок успешно пройден!</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Вы великолепны. Продолжайте в том же духе.</p>
                </div>
              ) : (
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Прочитали весь материал?</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">Отметьте урок как пройденный, чтобы заработать очки опыта и улучшить свой рейтинг!</p>
                  <button 
                    onClick={handleCompleteLesson}
                    disabled={completing}
                    className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-lg shadow-xl shadow-primary-500/20 hover:shadow-2xl hover:shadow-primary-500/30 hover:-translate-y-1 transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <div className="absolute inset-0 w-full h-full bg-white/20 skew-x-[45deg] -translate-x-full group-hover:translate-x-[200%] transition-transform duration-700 ease-out" />
                    {completing ? (
                      <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <PartyPopper className="w-6 h-6 animate-bounce" />
                        Завершить урок
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Viewer Modal */}
      {viewerFile && <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />}
    </div>
  );
};

export default LessonViewPage;
