import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGroups } from '../../lib/api';
import { FolderOpen, Users, BookOpen } from 'lucide-react';
import type { Course } from '../../types';

const StudentCoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.uid) return;

    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch all org groups and courses
        const [allGroups, allCourses] = await Promise.all([
          orgGetGroups(),
          orgGetCourses()
        ]);

        // Find groups where this student is enrolled
        const myGroups = allGroups.filter((g: any) => g.studentIds?.includes(profile.uid));
        const myCourseIds = Array.from(new Set(myGroups.map((g: any) => g.courseId)));

        // Filter courses
        const myCourses = allCourses.filter((c: any) => myCourseIds.includes(c.id));
        setCourses(myCourses);
      } catch (err: any) {
        setError(err.message || t('common.loadError', 'Ошибка загрузки'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [profile?.uid, profile?.activeOrgId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.myCourses', 'Мои курсы')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('studentCourses.subtitle', 'Курсы, к которым у вас есть доступ')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {courses.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {t('studentCourses.emptyTitle', 'Нет доступных курсов')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('studentCourses.emptySubtitle', 'Вы пока не состоите ни в одной группе, привязанной к курсу. Обратитесь к администратору.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div key={course.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-all group">
              {course.coverImageUrl ? (
                <div className="h-40 w-full overflow-hidden">
                  <img src={course.coverImageUrl} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
              ) : (
                <div className="h-40 w-full bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center">
                  <FolderOpen className="w-12 h-12 text-violet-300 dark:text-violet-700" />
                </div>
              )}
              
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
                    {course.subject || 'Subject'}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    course.status === 'published' 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {course.status}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-2">
                  {course.title}
                </h3>
                
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                  {course.description || t('studentCourses.noDescription', 'Нет описания')}
                </p>

                <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <span>{course.lessonIds?.length || 0} {t('studentCourses.lessons', 'Уроков')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>{course.teacherIds?.length || 0} {t('studentCourses.teachers', 'Преподавателей')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentCoursesPage;
