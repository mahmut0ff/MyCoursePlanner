import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetCourses } from '../../lib/api';
import { ArrowLeft, BookOpen, Calendar, Users, FileText } from 'lucide-react';
import type { Course } from '../../types';

const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    orgGetCourses()
      .then((all: Course[]) => setCourse(all.find((c) => c.id === id) || null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!course) return <div className="text-center py-20"><BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/courses')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/courses')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-16" />
        <div className="px-6 pb-6 -mt-5">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-8">{course.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{course.subject || '—'}</p>
            </div>
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${course.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {course.status === 'published' ? t('common.published') : t('common.draft')}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <FileText className="w-5 h-5 text-primary-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{course.lessonIds?.length || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('nav.lessons')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <Users className="w-5 h-5 text-violet-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{course.teacherIds?.length || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('nav.teachers')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <Calendar className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{course.createdAt ? new Date(course.createdAt).toLocaleDateString() : '—'}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('common.created')}</p>
        </div>
      </div>

      {/* Description */}
      {course.description && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('org.courses.description')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{course.description}</p>
        </div>
      )}


    </div>
  );
};

export default CourseDetailPage;
