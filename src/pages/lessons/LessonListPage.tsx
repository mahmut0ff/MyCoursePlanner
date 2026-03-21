import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLessonPlans } from '../../services/lessons.service';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonPlan } from '../../types';
import { formatDate } from '../../utils/grading';
import { Plus, BookOpen, Clock, Search } from 'lucide-react';

const LessonListPage: React.FC = () => {
  const { role } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      const data = await getLessonPlans();
      setLessons(data);
    } catch (e) {
      console.error('Failed to load lessons:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = lessons.filter(
    (l) =>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.subject.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lesson Plans</h1>
          <p className="text-slate-500 text-sm mt-1">{lessons.length} lessons available</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lessons..."
              className="input pl-10 w-64"
            />
          </div>
          {isStaff && (
            <Link to="/lessons/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Lesson
            </Link>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">No lessons found</h3>
          <p className="text-slate-500 text-sm">
            {isStaff ? 'Create your first lesson plan to get started.' : 'No lesson plans available yet.'}
          </p>
          {isStaff && (
            <Link to="/lessons/new" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" />
              Create Lesson
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((lesson) => (
            <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="card group hover:shadow-md transition-shadow overflow-hidden">
              {lesson.coverImageUrl ? (
                <div className="h-40 bg-slate-100 overflow-hidden">
                  <img
                    src={lesson.coverImageUrl}
                    alt={lesson.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="h-40 bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-primary-300" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-primary">{lesson.subject}</span>
                  <span className="badge-slate">{lesson.level}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-primary-600 transition-colors line-clamp-2">
                  {lesson.title}
                </h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-3">{lesson.description}</p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {lesson.duration} min
                  </span>
                  <span>{formatDate(lesson.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default LessonListPage;
