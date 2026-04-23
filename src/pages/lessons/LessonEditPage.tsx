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
import type { LessonAttachment, Material, Group } from '../../types';
import { orgGetMaterials, orgGetGroups } from '../../lib/api';

import {
  Save, ArrowLeft, Bold, Italic, Strikethrough, Heading1, Heading2, List,
  ListOrdered, LinkIcon, ImageIcon, Youtube as YoutubeIcon, Undo, Redo, Upload,
  Quote, Code, Minus, Paperclip, Trash2, FileText, Film, Image as LucideImage,
  FileSpreadsheet, ClipboardList, Calendar, Award, CheckCircle2, Search,
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
  
  // Library materials state
  const [libMaterials, setLibMaterials] = useState<Material[]>([]);
  const [searchMaterial, setSearchMaterial] = useState('');
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  
  const [uploading, setUploading] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Groups linkage (lessons → groups)
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Youtube.configure({ width: 640, height: 360 }),
      Placeholder.configure({ placeholder: t('lessons.contentPlaceholder', 'Начните писать или вставьте / для команд...') }),
    ],
    content: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      getLessonPlan(id).then((lesson) => {
        if (lesson) {
          setTitle(lesson.title || '');
          setDescription(lesson.description || '');
          setSubject(lesson.subject || '');
          setLevel(lesson.level || 'Beginner');
          setDuration(lesson.duration || 30);
          setTags(lesson.tags?.join(', ') || '');
          setVideoUrl(lesson.videoUrl || '');
          setCoverImageUrl(lesson.coverImageUrl || '');
          setStatus(lesson.status || 'draft');
          setAttachments(lesson.attachments || []);
          setSelectedGroups(lesson.groupIds || []);
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

  useEffect(() => {
    if (profile?.activeOrgId || profile?.role === 'teacher') {
      setLoadingMaterials(true);
      orgGetMaterials()
        .then(setLibMaterials)
        .catch(console.error)
        .finally(() => setLoadingMaterials(false));

      orgGetGroups().then((gs: Group[]) => {
        setGroups(gs);
      }).catch(console.error);
    }
  }, [profile]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const tempId = id || `temp-${Date.now()}`;
      const toastId = toast.loading(t('common.uploading', 'Загрузка обложки...'));
      const url = await uploadLessonCover(tempId, file);
      setCoverImageUrl(url);
      toast.success(t('common.success', 'Загружено'), { id: toastId });
    } catch (err) {
      console.error('Failed to upload cover:', err);
      toast.error(t('common.error', 'Ошибка загрузки'));
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
        toast.error(`${file.name}: ${t('common.error', 'Ошибка')}`);
      } finally {
        setUploading((p) => p.filter((u) => u !== tempId));
      }
    }
  }, [id, t]);

  const handleDeleteAttachment = async (att: LessonAttachment) => {
    try {
      if (att.storagePath) {
        await deleteLessonAttachment(att.storagePath);
      }
      setAttachments((p) => p.filter((a) => a.id !== att.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleAddMaterial = (m: Material) => {
    if (attachments.some((a) => a.url === m.url)) {
      toast.error(t('lessons.materialExists', 'Этот материал уже прикреплён'));
      return;
    }
    const newAtt: LessonAttachment = {
      id: `lib-${m.id}`,
      name: m.title,
      url: m.url,
      storagePath: '',
      type: m.mimeType || 'application/octet-stream',
      size: m.sizeBytes || 0,
      uploadedAt: new Date().toISOString(),
    };
    setAttachments((prev) => [...prev, newAtt]);
    toast.success(t('lessons.materialAdded', 'Материал добавлен'));
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  };

  const addImage = () => {
    const url = prompt(t('lessons.enterImageUrl', 'Введите URL картинки:'));
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  };
  const addLink = () => {
    const url = prompt(t('lessons.enterLinkUrl', 'Введите URL ссылки:'));
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  };
  const addVideo = () => {
    const url = prompt(t('lessons.enterYoutubeUrl', 'Введите ссылку на YouTube:'));
    if (url && editor) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const handleSave = async (silent = false) => {
    if (!title || !subject) {
      if (!silent) toast.error(t('lessons.titleSubjectRequired', 'Название и предмет обязательны'));
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        title: title.trim(), 
        description: description.trim(), 
        subject: subject.trim(), 
        level, 
        duration,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        coverImageUrl, 
        videoUrl: videoUrl.trim(), 
        status, 
        attachments,
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

      // Add group linkage
      const selectedGroupNames = selectedGroups.map(gid => {
        const g = groups.find(gr => gr.id === gid);
        return g?.name || '';
      }).filter(Boolean);
      data.groupIds = selectedGroups;
      data.groupNames = selectedGroupNames;
      
      let savedLessonId = id;
      if (isEdit && id) {
        await updateLessonPlan(id, data);
      } else {
        savedLessonId = await createLessonPlan(data);
      }


      setLastSaved(new Date());
      if (!silent) toast.success(t('common.saved', 'Успешно сохранено'));
      if (!isEdit && !silent && savedLessonId) navigate(`/lessons/${savedLessonId}/edit`, { replace: true });
    } catch (e) {
      console.error('Save failed:', e);
      if (!silent) toast.error(t('lessons.saveFailed', 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  }

  const tbtn = (active: boolean) =>
    `p-1.5 rounded-lg transition-colors flex items-center justify-center ${active ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`;

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md pb-4 pt-2 -mt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/lessons')} className="p-2 bg-white dark:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{isEdit ? t('lessons.editLesson', 'Редактировать урок') : t('lessons.newLesson', 'Новый урок')}</h1>
          {lastSaved && (
             <span className="text-xs text-slate-400 flex items-center gap-1 hidden sm:flex">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Сохранено в {lastSaved.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            className={`text-sm font-medium border rounded-lg px-3 py-2 outline-none transition-colors ${status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-400'}`}>
            <option value="draft">{t('common.draft', 'Черновик (невидим)')}</option>
            <option value="published">{t('common.published', 'Опубликован')}</option>
          </select>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : t('common.save', 'Сохранить')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Main Content Pane (Left) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          
          <div className="card p-6 sm:p-8 relative">
             <input 
               type="text" 
               value={title} 
               onChange={(e) => setTitle(e.target.value)}
               placeholder="Введите название урока..."
               className="w-full text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 mb-4 h-auto min-h-[50px] resize-none"
             />
             <textarea 
               value={description} 
               onChange={(e) => setDescription(e.target.value)}
               placeholder="Добавьте краткое описание (о чём этот урок?)"
               className="w-full text-base sm:text-lg text-slate-600 dark:text-slate-400 bg-transparent outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 min-h-[60px] resize-none border-none focus:ring-0 p-0"
             />
          </div>

          {/* Tiptap Rich Editor */}
          <div className="card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 p-2 sm:p-3 flex flex-wrap items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} className={tbtn(editor?.isActive('bold') ?? false)} title="Жирный шрифть"><Bold className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={tbtn(editor?.isActive('italic') ?? false)} title="Курсив"><Italic className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={tbtn(editor?.isActive('strike') ?? false)} title="Зачеркнутый"><Strikethrough className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleCode().run()} className={tbtn(editor?.isActive('code') ?? false)} title="Код"><Code className="w-4 h-4" /></button>
              </div>

              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={tbtn(editor?.isActive('heading', { level: 1 }) ?? false)} title="Заголовок 1"><Heading1 className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={tbtn(editor?.isActive('heading', { level: 2 }) ?? false)} title="Заголовок 2"><Heading2 className="w-4 h-4" /></button>
              </div>

              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={tbtn(editor?.isActive('bulletList') ?? false)} title="Маркированный список"><List className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={tbtn(editor?.isActive('orderedList') ?? false)} title="Нумерованный список"><ListOrdered className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={tbtn(editor?.isActive('blockquote') ?? false)} title="Цитата"><Quote className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={tbtn(false)} title="Разделитель"><Minus className="w-4 h-4" /></button>
              </div>
              
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={addLink} className={tbtn(editor?.isActive('link') ?? false)} title="Вставить ссылку"><LinkIcon className="w-4 h-4" /></button>
                <button onClick={addImage} className={tbtn(editor?.isActive('image') ?? false)} title="Вставить картинку"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={addVideo} className={tbtn(editor?.isActive('youtube') ?? false)} title="Вставить YouTube"><YoutubeIcon className="w-4 h-4" /></button>
              </div>
              
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm ml-auto">
                <button onClick={() => editor?.chain().focus().undo().run()} className={tbtn(false)} title="Отменить"><Undo className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().redo().run()} className={tbtn(false)} title="Повторить"><Redo className="w-4 h-4" /></button>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 min-h-[400px]">
              <div className="tiptap-editor h-full">
                <EditorContent editor={editor} className="min-h-[400px] prose-lg max-w-none focus:outline-none focus:ring-0 p-6 sm:p-8" />
              </div>
            </div>
          </div>

          {/* Attachments Section */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <Paperclip className="w-5 h-5 text-primary-500 bg-primary-50 dark:bg-primary-900/30 p-1 rounded-lg" />
              {t('lessons.attachments', 'Вложения')}
              {attachments.length > 0 && <span className="text-sm text-slate-400 font-normal">({attachments.length})</span>}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
              {/* Left Column: Library */}
              <div className="flex flex-col border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30 h-[280px]">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      value={searchMaterial} 
                      onChange={(e) => setSearchMaterial(e.target.value)}
                      placeholder="Поиск по базе знаний..." 
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary-400 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {loadingMaterials ? (
                    <div className="flex justify-center p-4"><div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /></div>
                  ) : libMaterials.length === 0 ? (
                    <div className="text-center p-4 text-sm text-slate-500">База знаний пуста</div>
                  ) : libMaterials.filter(m => m.title.toLowerCase().includes(searchMaterial.toLowerCase())).length === 0 ? (
                    <div className="text-center p-4 text-sm text-slate-500">Ничего не найдено</div>
                  ) : (
                    libMaterials.filter(m => m.title.toLowerCase().includes(searchMaterial.toLowerCase())).map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700/50 transition-colors group cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-600 shadow-sm" onClick={() => handleAddMaterial(m)}>
                         <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                           {getFileIcon(m.mimeType || '')}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.title}</p>
                           <p className="text-[10px] text-slate-500 truncate">{m.type === 'link' ? 'Ссылка' : formatSize(m.sizeBytes || 0)}</p>
                         </div>
                         <button className="text-primary-600 dark:text-primary-400 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all shrink-0" title="Прикрепить">
                            <Upload className="w-4 h-4 ml-1" />
                         </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Upload */}
              <div 
                ref={dropZoneRef} 
                onDragOver={handleDragOver} 
                onDragLeave={handleDragLeave} 
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer h-[280px] ${isDragging ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 shadow-inner' : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 bg-slate-50 dark:bg-slate-800/50'}`}
              >
                <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} onChange={(e) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }} className="hidden" />
                <div className="w-12 h-12 mx-auto bg-white dark:bg-slate-700 shadow-sm rounded-full flex items-center justify-center mb-3">
                   <Upload className={`w-6 h-6 ${isDragging ? 'text-primary-500' : 'text-slate-400 dark:text-slate-500'}`} />
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isDragging ? t('lessons.dropHere', 'Отпустите файлы') : 'Загрузить с устройства'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px] mt-1 line-clamp-2">Перетащите файлы или нажмите (до 50MB).</p>
                
                {uploading.length > 0 && (
                  <div className="mt-4 w-full max-w-[200px] space-y-2">
                    {uploading.map((u) => (
                      <div key={u} className="flex items-center justify-center gap-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 truncate">Загрузка...</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* List Array */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Прикреплено к уроку ({attachments.length})</h4>
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl group hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center shrink-0">
                      {getFileIcon(att.type)}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <p className="text-sm text-slate-900 dark:text-white truncate font-medium">{att.name}</p>
                      {!att.storagePath && (
                         <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 uppercase tracking-wider shrink-0">Из базы знаний</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-xs text-slate-500">{formatSize(att.size)}</p>
                      <button onClick={() => handleDeleteAttachment(att)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-red-500 bg-slate-50 dark:bg-slate-700 dark:hover:bg-red-600 transition-all rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm" title="Открепить">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Sidebar Settings Pane (Right) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">

          {/* Lesson Settings Box */}
          <div className="card divide-y divide-slate-100 dark:divide-slate-700/50">
            <div className="p-5 bg-slate-50/50 dark:bg-slate-800/50">
               <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Настройки урока</h3>
               
               <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t('lessons.subjectLabel', 'Прeдмет')} *</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input text-sm font-medium" placeholder={t('lessons.subjectPlaceholder', 'напр. Математика')} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t('lessons.durationLabel', 'Мин.')}</label>
                      <input type="number" value={duration} onChange={(e) => setDuration(+e.target.value)} className="input text-sm" min={1} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t('lessons.levelLabel', 'Уровень')}</label>
                      <select value={level} onChange={(e) => setLevel(e.target.value)} className="input text-sm">
                        <option>{t('lessons.beginner', 'Beginner')}</option>
                        <option>{t('lessons.intermediate', 'Intermediate')}</option>
                        <option>{t('lessons.advanced', 'Advanced')}</option>
                      </select>
                    </div>
                  </div>

                   <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t('lessons.tagsLabel', 'Теги')}</label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} className="input text-sm" placeholder="Грамматика, Аудирование..." />
                  </div>
               </div>
            </div>

            {/* Group Linkage Section */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-700/50">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Привязка к группам</label>
              {groups.length === 0 ? (
                <p className="text-xs text-slate-500">Нет доступных групп</p>
              ) : (
                <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                  {groups.map(group => (
                    <label key={group.id} className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        selectedGroups.includes(group.id)
                          ? 'bg-primary-500 border-primary-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-primary-400'
                      }`}>
                        {selectedGroups.includes(group.id) && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate select-none">
                        {group.name}{group.courseName ? ` (${group.courseName})` : ''}
                      </span>
                      <input 
                        type="checkbox"
                        className="hidden"
                        checked={selectedGroups.includes(group.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedGroups(prev => [...prev, group.id]);
                          else setSelectedGroups(prev => prev.filter(id => id !== group.id));
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 truncate">{t('lessons.coverLabel', 'Обложка урока (Опционально)')}</label>
              {coverImageUrl ? (
                <div className="relative group rounded-xl overflow-hidden aspect-video bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                     <label className="bg-white/20 hover:bg-white/30 text-white backdrop-blur px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors font-medium">
                       Заменить
                       <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                     </label>
                     <button onClick={() => setCoverImageUrl('')} className="bg-red-500/80 hover:bg-red-500 text-white backdrop-blur p-1.5 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center aspect-video bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group">
                   <div className="w-10 h-10 bg-white dark:bg-slate-700 shadow-sm rounded-full flex items-center justify-center mb-2 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40">
                     <Upload className="w-4 h-4 text-slate-400 group-hover:text-primary-500" />
                   </div>
                   <span className="text-xs font-medium text-slate-500 group-hover:text-primary-600">Загрузить обложку</span>
                   <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </label>
              )}
            </div>

            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <YoutubeIcon className="w-4 h-4 text-red-500" />
                Видео-лекция (YouTube/Vimeo)
              </label>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input text-sm" placeholder="https://youtube.com/watch?v=..." />
              {videoUrl && (
                 <p className="text-[10px] text-slate-400 mt-1.5">Видео будет встроено в начало урока.</p>
              )}
            </div>
          </div>

          {/* Homework Toggle Box */}
          <div className={`card overflow-hidden transition-all duration-300 border-2 ${showHomework ? 'border-amber-200 dark:border-amber-700/50' : 'border-transparent'}`}>
            <div 
               className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${showHomework ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
               onClick={() => setShowHomework(!showHomework)}
            >
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-xl text-white ${showHomework ? 'bg-amber-500 shadow-md shadow-amber-500/20' : 'bg-slate-300 dark:bg-slate-700'}`}>
                   <ClipboardList className="w-5 h-5" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-slate-900 dark:text-white">Домашнее задание</h3>
                   <p className="text-xs text-slate-500">{showHomework ? 'Включено' : 'Выключено'}</p>
                 </div>
              </div>
              <div className={`w-10 h-6 rounded-full p-1 transition-colors ${showHomework ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showHomework ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>

            {showHomework && (
              <div className="p-5 border-t border-amber-100 dark:border-amber-900/30 bg-white dark:bg-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Задание *</label>
                  <input value={homework.title} onChange={(e) => setHomework((h) => ({ ...h, title: e.target.value }))}
                    className="input text-sm focus:border-amber-400 focus:ring-amber-400/20" placeholder="напр. Решить задачи 1-10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Подробное описание</label>
                  <textarea value={homework.description} onChange={(e) => setHomework((h) => ({ ...h, description: e.target.value }))}
                    className="input min-h-[100px] text-sm focus:border-amber-400 focus:ring-amber-400/20" placeholder="Что конкретно нужно сделать студенту..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Срок сдачи
                    </label>
                    <input type="date" value={homework.dueDate} onChange={(e) => setHomework((h) => ({ ...h, dueDate: e.target.value }))} className="input text-sm focus:border-amber-400 focus:ring-amber-400/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-500" /> Баллы (XP)
                    </label>
                    <input type="number" value={homework.points || ''} onChange={(e) => setHomework((h) => ({ ...h, points: +e.target.value }))}
                      className="input text-sm font-bold text-amber-700 dark:text-amber-400 focus:border-amber-400 focus:ring-amber-400/20" min={0} placeholder="0" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonEditPage;
