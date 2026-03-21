import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getLessonPlan, deleteLessonPlan } from '../../services/lessons.service';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonPlan } from '../../types';
import { formatDate } from '../../utils/grading';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { ArrowLeft, Edit, Trash2, Clock, BookOpen, Play } from 'lucide-react';

const LessonViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    if (id) {
      getLessonPlan(id)
        .then(setLesson)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this lesson?')) return;
    await deleteLessonPlan(id);
    navigate('/lessons');
  };

  const renderContent = () => {
    if (!lesson?.content) return null;
    try {
      const html = generateHTML(lesson.content as any, [StarterKit, LinkExtension, ImageExtension, Youtube]);
      return <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <p className="text-slate-500">Content could not be rendered.</p>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  if (!lesson) {
    return (
      <div className="text-center py-20">
        <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-700">Lesson not found</h3>
        <Link to="/lessons" className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block">Back to lessons</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/lessons')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
        {isStaff && (
          <div className="flex items-center gap-2">
            <Link to={`/lessons/${id}/edit`} className="btn-secondary flex items-center gap-2"><Edit className="w-4 h-4" />Edit</Link>
            <button onClick={handleDelete} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete</button>
          </div>
        )}
      </div>

      {/* Hero */}
      {lesson.coverImageUrl && (
        <div className="rounded-xl overflow-hidden mb-6 h-64 md:h-80">
          <img src={lesson.coverImageUrl} alt={lesson.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="card p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-primary">{lesson.subject}</span>
          <span className="badge-slate">{lesson.level}</span>
          {lesson.tags?.map((tag) => (
            <span key={tag} className="badge-slate">{tag}</span>
          ))}
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">{lesson.title}</h1>
        <p className="text-slate-600 mb-4">{lesson.description}</p>

        <div className="flex items-center gap-6 text-sm text-slate-500 mb-8 pb-6 border-b">
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{lesson.duration} minutes</span>
          <span>By {lesson.authorName}</span>
          <span>{formatDate(lesson.createdAt)}</span>
        </div>

        {lesson.videoUrl && (
          <div className="mb-8">
            <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-2">
              <Play className="w-4 h-4" />Watch Video
            </a>
          </div>
        )}

        {/* Rich Content */}
        <div className="lesson-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default LessonViewPage;
