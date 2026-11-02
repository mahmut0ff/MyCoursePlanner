import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGroups } from '../../lib/api';
import { FolderOpen, Users, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Course } from '../../types';

const StudentCoursesPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.uid) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [groupsData, coursesData] = await Promise.all([
          orgGetGroups(),
          orgGetCourses()
        ]);
        setAllGroups(groupsData);
        setCourses(coursesData);
      } catch (err: any) {
        setError(err.message || t('common.loadError', 'Ошибка загрузки'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [profile?.uid, profile?.activeOrgId]);

  const getTeacherCount = (course: Course) => {
    const courseGroups = allGroups.filter((g: any) => g.courseId === course.id);
    const teacherSet = new Set<string>();
    
    // Add teachers from groups
    courseGroups.forEach((g: any) => {
      if (Array.isArray(g.teacherIds)) {
        g.teacherIds.forEach((tId: string) => teacherSet.add(tId));
      }
    });
    
    // Add teachers directly assigned to the course (if any)
    if (Array.isArray(course.teacherIds)) {
      course.teacherIds.forEach(tId => teacherSet.add(tId));
    }
    
    return teacherSet.size;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.myCourses', 'Мои курсы')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('studentCourses.subtitle', 'Все курсы в вашем учебном центре')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {courses.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 py-12 px-4 text-center">
          <div className="flex items-center justify-center mx-auto mb-2">
            <FolderOpen className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            {t('studentCourses.emptyTitle', 'Нет доступных курсов')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('studentCourses.emptySubtitle', 'В учебном центре пока не добавлено ни одного курса.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((course) => (
            <div key={course.id} onClick={() => navigate(`/courses/${course.id}`)} className="cursor-pointer bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden hover:border-slate-300 dark:hover:border-slate-600 transition-colors group">
              {course.coverImageUrl ? (
                <div className="h-32 w-full overflow-hidden border-b border-slate-200 dark:border-slate-700">
                  <img src={course.coverImageUrl} alt={course.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 w-full bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                </div>
              )}
              
              <div className="p-4">
                {course.subject && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {course.subject}
                    </span>
                  </div>
                )}
                
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 line-clamp-2">
                  {course.title}
                </h3>
                
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                  {course.description || t('studentCourses.noDescription', 'Нет описания')}
                </p>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('common.groupsCount', '{{count}} групп', { count: allGroups.filter((g: any) => g.courseId === course.id).length })}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('common.teachersCount', '{{count}} преподавателей', { count: getTeacherCount(course) })}</span>
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
