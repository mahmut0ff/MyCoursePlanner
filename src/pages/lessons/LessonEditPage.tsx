import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Save, ArrowLeft, Bold, Italic, Heading1, Heading2, List,
  ListOrdered, LinkIcon, ImageIcon, Youtube as YoutubeIcon, Undo, Redo, Upload
} from 'lucide-react';

const LessonEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [duration, setDuration] = useState(30);
  const [tags, setTags] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Youtube.configure({ width: 640, height: 360 }),
      Placeholder.configure({ placeholder: 'Start writing your lesson content...' }),
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
    const url = prompt('Enter image URL:');
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  };

  const addLink = () => {
    const url = prompt('Enter link URL:');
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  };

  const addVideo = () => {
    const url = prompt('Enter YouTube URL:');
    if (url && editor) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const handleSave = async () => {
    if (!title || !subject) {
      alert('Title and subject are required');
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
      alert('Failed to save lesson plan');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Lesson' : 'New Lesson'}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Metadata */}
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Lesson title" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="Brief description" />
            </div>
            <div>
              <label className="label">Subject *</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="e.g. Mathematics" />
            </div>
            <div>
              <label className="label">Level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="input">
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
            <div>
              <label className="label">Duration (min)</label>
              <input type="number" value={duration} onChange={(e) => setDuration(+e.target.value)} className="input" min={1} />
            </div>
            <div>
              <label className="label">Tags (comma separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" placeholder="algebra, basics" />
            </div>
            <div>
              <label className="label">Video URL</label>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input" placeholder="https://youtube.com/..." />
            </div>
            <div>
              <label className="label">Cover Image</label>
              <div className="flex items-center gap-3">
                <label className="btn-secondary cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload
                  <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </label>
                {coverImageUrl && <img src={coverImageUrl} alt="Cover" className="h-10 w-16 object-cover rounded" />}
              </div>
            </div>
          </div>
        </div>

        {/* Rich Editor */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-2 flex flex-wrap items-center gap-1 bg-slate-50 dark:bg-slate-700/50">
            <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('bold') ? 'bg-slate-200' : ''}`}><Bold className="w-4 h-4" /></button>
            <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('italic') ? 'bg-slate-200' : ''}`}><Italic className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-300 mx-1" />
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('heading', { level: 1 }) ? 'bg-slate-200' : ''}`}><Heading1 className="w-4 h-4" /></button>
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('heading', { level: 2 }) ? 'bg-slate-200' : ''}`}><Heading2 className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-300 mx-1" />
            <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('bulletList') ? 'bg-slate-200' : ''}`}><List className="w-4 h-4" /></button>
            <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-slate-200 ${editor?.isActive('orderedList') ? 'bg-slate-200' : ''}`}><ListOrdered className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-300 mx-1" />
            <button onClick={addLink} className="p-1.5 rounded hover:bg-slate-200"><LinkIcon className="w-4 h-4" /></button>
            <button onClick={addImage} className="p-1.5 rounded hover:bg-slate-200"><ImageIcon className="w-4 h-4" /></button>
            <button onClick={addVideo} className="p-1.5 rounded hover:bg-slate-200"><YoutubeIcon className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-300 mx-1" />
            <button onClick={() => editor?.chain().focus().undo().run()} className="p-1.5 rounded hover:bg-slate-200"><Undo className="w-4 h-4" /></button>
            <button onClick={() => editor?.chain().focus().redo().run()} className="p-1.5 rounded hover:bg-slate-200"><Redo className="w-4 h-4" /></button>
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
