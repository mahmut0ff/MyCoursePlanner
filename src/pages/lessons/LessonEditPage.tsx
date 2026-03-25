import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { useAuth } from '../../contexts/AuthContext';
import { createLessonPlan, getLessonPlan, updateLessonPlan } from '../../services/lessons.service';
import { uploadLessonCover, uploadLessonAttachment, deleteLessonAttachment } from '../../services/storage.service';
import type { LessonAttachment } from '../../types';

import {
  Save, ArrowLeft, Bold, Italic, Strikethrough, Heading1, Heading2, List,
  ListOrdered, LinkIcon, ImageIcon, Youtube as YoutubeIcon, Undo, Redo, Upload,
  Quote, Code, Minus, Paperclip, Trash2, FileText, Film, Image as LucideImage,
  FileSpreadsheet, ClipboardList, Calendar, Award,
} from 'lucide-react';

const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.avi,.zip,.rar,.txt';

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <LucideImage className="w-4 h-4 text-emerald-500" />;
  if (type.startsWith('video/')) return <Film className="w-4 h-4 text-violet-500" />;
  if (type === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />;
  if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (type.includes('presentation') || type.includes('powerpoint')) return <FileText className="w-4 h-4 text-amber-500" />;
  if (type.includes('word') || type.includes('document')) return <FileText className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-slate-400" />;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const LessonEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [duration, setDuration] = useState(30);
  const [tags, setTags] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [attachments, setAttachments] = useState<LessonAttachment[]>([]);
  const [homework, setHomework] = useState({ title: '', description: '', dueDate: '', points: 0 });
  const [showHomework, setShowHomework] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isDragging, setIsDragging] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Youtube.configure({ width: 640, height: 360 }),
      Placeholder.configure({ placeholder: t('lessons.contentPlaceholder') }),
    ],
    content: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      getLessonPlan(id).then((lesson) => {
        if (lesson) {
          setTitle(lesson.title);
          setDescription(lesson.description);
          setSubject(lesson.subject);
          setLevel(lesson.level);
          setDuration(lesson.duration);
          setTags(lesson.tags?.join(', ') || '');
          setVideoUrl(lesson.videoUrl || '');
          setCoverImageUrl(lesson.coverImageUrl || '');
          setStatus(lesson.status || 'draft');
          setAttachments(lesson.attachments || []);
          if (lesson.homework && lesson.homework.title) {
            setHomework({
              title: lesson.homework.title || '',
              description: lesson.homework.description || '',
              dueDate: lesson.homework.dueDate || '',
              points: lesson.homework.points || 0,
            });
            setShowHomework(true);
          }
          if (editor && lesson.content) {
            try { editor.commands.setContent(lesson.content as any); }
            catch { editor.commands.setContent(''); }
          }
        }
        setLoading(false);
      });
    }
  }, [id, isEdit, editor]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const tempId = id || `temp-${Date.now()}`;
      const url = await uploadLessonCover(tempId, file);
      setCoverImageUrl(url);
    } catch (err) {
      console.error('Failed to upload cover:', err);
    }
  };

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const lessonId = id || `temp-${Date.now()}`;
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const tempId = `uploading-${Date.now()}-${file.name}`;
      setUploading((p) => [...p, tempId]);
      try {
        const { url, storagePath } = await uploadLessonAttachment(lessonId, file);
        const attachment: LessonAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          url,
          storagePath,
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };
        setAttachments((p) => [...p, attachment]);
        toast.success(`${file.name} ${t('lessons.uploaded', 'загружен')}`);
      } catch (err) {
        console.error('Upload failed:', err);
        toast.error(`${file.name}: ${t('common.error')}`);
      } finally {
        setUploading((p) => p.filter((u) => u !== tempId));
      }
    }
  }, [id, t]);

  const handleDeleteAttachment = async (att: LessonAttachment) => {
    try {
      await deleteLessonAttachment(att.storagePath);
      setAttachments((p) => p.filter((a) => a.id !== att.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  };

  const addImage = () => {
    const url = prompt(t('lessons.enterImageUrl'));
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  };
  const addLink = () => {
    const url = prompt(t('lessons.enterLinkUrl'));
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  };
  const addVideo = () => {
    const url = prompt(t('lessons.enterYoutubeUrl'));
    if (url && editor) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const handleSave = async () => {
    if (!title || !subject) { toast.error(t('lessons.titleSubjectRequired')); return; }
    setSaving(true);
    try {
      const data: any = {
        title, description, subject, level, duration,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        coverImageUrl, videoUrl, status, attachments,
        content: editor?.getJSON() as any,
        authorId: profile?.uid || '',
        authorName: profile?.displayName || '',
      };
      if (showHomework && homework.title.trim()) {
        data.homework = {
          title: homework.title.trim(),
          description: homework.description.trim(),
          ...(homework.dueDate ? { dueDate: homework.dueDate } : {}),
          ...(homework.points > 0 ? { points: homework.points } : {}),
        };
      } else {
        data.homework = null;
      }
      if (isEdit && id) {
        await updateLessonPlan(id, data);
        navigate(`/lessons/${id}`);
      } else {
        const newId = await createLessonPlan(data);
        navigate(`/lessons/${newId}`);
      }
    } catch (e) {
      console.error('Save failed:', e);
      toast.error(t('lessons.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  }

  const tbtn = (active: boolean) =>
    `p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${active ? 'bg-slate-200 dark:bg-slate-600 text-primary-600' : 'text-slate-600 dark:text-slate-400'}`;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{isEdit ? t('lessons.editLesson') : t('lessons.newLesson')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            className="text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 outline-none">
            <option value="draft">{t('common.draft')}</option>
            <option value="published">{t('common.published')}</option>
          </select>
          <button onClick={handleSave} disabled={saving}
            className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
            {saving ? '...' : t('common.save')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Metadata */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.titleLabel')} *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm" placeholder={t('lessons.titlePlaceholder')} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.descriptionLabel')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[60px] text-sm" placeholder={t('lessons.descriptionPlaceholder')} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.subjectLabel')} *</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input text-sm" placeholder={t('lessons.subjectPlaceholder')} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.levelLabel')}</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="input text-sm">
                <option>{t('lessons.beginner')}</option>
                <option>{t('lessons.intermediate')}</option>
                <option>{t('lessons.advanced')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.durationLabel')}</label>
              <input type="number" value={duration} onChange={(e) => setDuration(+e.target.value)} className="input text-sm" min={1} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.tagsLabel')}</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="input text-sm" placeholder={t('lessons.tagsPlaceholder')} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.videoUrlLabel')}</label>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input text-sm" placeholder="https://youtube.com/..." />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.coverLabel')}</label>
              <div className="flex items-center gap-2">
                <label className="text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Upload className="w-3 h-3" />
                  {t('lessons.upload')}
                  <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </label>
                {coverImageUrl && <img src={coverImageUrl} alt="Cover" className="h-8 w-12 object-cover rounded" />}
              </div>
            </div>
          </div>
        </div>

        {/* Rich Editor */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-700 px-3 py-1.5 flex flex-wrap items-center gap-0.5 bg-slate-50 dark:bg-slate-700/50">
            <button onClick={() => editor?.chain().focus().toggleBold().run()} className={tbtn(editor?.isActive('bold') ?? false)} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={tbtn(editor?.isActive('italic') ?? false)} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={tbtn(editor?.isActive('strike') ?? false)} title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleCode().run()} className={tbtn(editor?.isActive('code') ?? false)} title="Code"><Code className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={tbtn(editor?.isActive('heading', { level: 1 }) ?? false)}><Heading1 className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={tbtn(editor?.isActive('heading', { level: 2 }) ?? false)}><Heading2 className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
            <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={tbtn(editor?.isActive('bulletList') ?? false)}><List className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={tbtn(editor?.isActive('orderedList') ?? false)}><ListOrdered className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={tbtn(editor?.isActive('blockquote') ?? false)} title="Blockquote"><Quote className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={tbtn(false)} title="Horizontal Rule"><Minus className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
            <button onClick={addLink} className={tbtn(false)}><LinkIcon className="w-3.5 h-3.5" /></button>
            <button onClick={addImage} className={tbtn(false)}><ImageIcon className="w-3.5 h-3.5" /></button>
            <button onClick={addVideo} className={tbtn(false)}><YoutubeIcon className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
            <button onClick={() => editor?.chain().focus().undo().run()} className={tbtn(false)}><Undo className="w-3.5 h-3.5" /></button>
            <button onClick={() => editor?.chain().focus().redo().run()} className={tbtn(false)}><Redo className="w-3.5 h-3.5" /></button>
          </div>
          <div className="tiptap-editor">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary-500" />
              {t('lessons.attachments', 'Вложения')}
              {attachments.length > 0 && <span className="text-xs text-slate-400 font-normal">({attachments.length})</span>}
            </h3>
            <button onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 px-2.5 py-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center gap-1.5 font-medium">
              <Upload className="w-3 h-3" /> {t('lessons.addFiles', 'Добавить файлы')}
            </button>
            <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} onChange={(e) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }} className="hidden" />
          </div>

          {/* Drop zone */}
          <div ref={dropZoneRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${isDragging ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600'}`}
            onClick={() => fileInputRef.current?.click()}>
            <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-primary-500' : 'text-slate-300 dark:text-slate-600'}`} />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isDragging ? t('lessons.dropHere', 'Отпустите файлы') : t('lessons.dragOrClick', 'Перетащите файлы сюда или нажмите для выбора')}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">PDF, Word, PowerPoint, Excel, изображения, видео</p>
          </div>

          {/* Upload progress */}
          {uploading.length > 0 && (
            <div className="mt-3 space-y-2">
              {uploading.map((u) => (
                <div key={u} className="flex items-center gap-3 p-2 bg-primary-50/50 dark:bg-primary-900/10 rounded-lg">
                  <div className="w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin shrink-0" />
                  <span className="text-xs text-primary-600 dark:text-primary-400 truncate">{t('lessons.uploading', 'Загрузка...')}</span>
                </div>
              ))}
            </div>
          )}

          {/* File list */}
          {attachments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-700/30 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0">
                    {getFileIcon(att.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-white truncate font-medium">{att.name}</p>
                    <p className="text-[10px] text-slate-400">{formatSize(att.size)}</p>
                  </div>
                  <button onClick={() => handleDeleteAttachment(att)}
                    className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Homework */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-amber-500" />
              {t('lessons.homework', 'Домашнее задание')}
            </h3>
            <button onClick={() => setShowHomework(!showHomework)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${showHomework ? 'bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100'}`}>
              {showHomework ? t('common.delete') : t('lessons.addHomework', 'Добавить ДЗ')}
            </button>
          </div>

          {showHomework && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.homeworkTitle', 'Название задания')}</label>
                <input value={homework.title} onChange={(e) => setHomework((h) => ({ ...h, title: e.target.value }))}
                  className="input text-sm" placeholder={t('lessons.homeworkTitlePlaceholder', 'напр. Решить задачи 1-10')} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{t('lessons.homeworkDesc', 'Описание задания')}</label>
                <textarea value={homework.description} onChange={(e) => setHomework((h) => ({ ...h, description: e.target.value }))}
                  className="input min-h-[80px] text-sm" placeholder={t('lessons.homeworkDescPlaceholder', 'Подробное описание домашнего задания...')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {t('lessons.homeworkDueDate', 'Дедлайн')}
                  </label>
                  <input type="date" value={homework.dueDate} onChange={(e) => setHomework((h) => ({ ...h, dueDate: e.target.value }))} className="input text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Award className="w-3 h-3" /> {t('lessons.homeworkPoints', 'Баллы')}
                  </label>
                  <input type="number" value={homework.points || ''} onChange={(e) => setHomework((h) => ({ ...h, points: +e.target.value }))}
                    className="input text-sm" min={0} placeholder="0" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonEditPage;
