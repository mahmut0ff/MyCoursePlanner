import React, { useState, useEffect } from 'react';
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
import { uploadLessonCover } from '../../services/storage.service';

import {
  Save, ArrowLeft, Bold, Italic, Strikethrough, Heading1, Heading2, List,
  ListOrdered, LinkIcon, ImageIcon, Youtube as YoutubeIcon, Undo, Redo, Upload,
  Quote, Code, Minus,
} from 'lucide-react';

const LessonEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [duration, setDuration] = useState(30);
  const [tags, setTags] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

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
          setStatus((lesson as any).status || 'draft');
          if (editor && lesson.content) {
            try {
              editor.commands.setContent(lesson.content as any);
            } catch {
              editor.commands.setContent('');
            }
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
    if (!title || !subject) {
      alert(t('lessons.titleSubjectRequired'));
      return;
    }
    setSaving(true);
    try {
      const data = {
        title,
        description,
        subject,
        level,
        duration,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        coverImageUrl,
        videoUrl,
        status,
        content: editor?.getJSON() as any,
        authorId: profile?.uid || '',
        authorName: profile?.displayName || '',
      };
      if (isEdit && id) {
        await updateLessonPlan(id, data);
        navigate(`/lessons/${id}`);
      } else {
        const newId = await createLessonPlan(data as any);
        navigate(`/lessons/${newId}`);
      }
    } catch (e) {
      console.error('Save failed:', e);
      alert(t('lessons.saveFailed'));
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
          {/* Status toggle */}
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
      </div>
    </div>
  );
};

export default LessonEditPage;
