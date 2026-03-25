import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetCourses, orgGetTeachers } from '../../lib/api';
import { UserPlus, BookOpen, Mail, X } from 'lucide-react';
import StudentOrgFilter from '../../components/ui/StudentOrgFilter';
import type { Course, UserProfile } from '../../types';

const StudentTeachersPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [coursesByTeacher, setCoursesByTeacher] = useState<Record<string, Course[]>>({});
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [orgGroups, orgCourses, orgTeachers] = await Promise.all([
          orgGetGroups(),
          orgGetCourses(),
          orgGetTeachers()
        ]);

        const myGroups = orgGroups.filter((g: any) => g.studentIds?.includes(profile.uid));
        const myCourseIds = Array.from(new Set(myGroups.map((g: any) => g.courseId)));
        const myCourses = orgCourses.filter((c: any) => myCourseIds.includes(c.id));
        
        const myTeacherIds = Array.from(new Set(myCourses.flatMap((c: any) => c.teacherIds || [])));
        const myTeachers = orgTeachers.filter((t: any) => myTeacherIds.includes(t.uid));

        const courseMap: Record<string, Course[]> = {};
        myTeachers.forEach((teacher: UserProfile) => {
          courseMap[teacher.uid] = myCourses.filter((c: any) => c.teacherIds?.includes(teacher.uid));
        });

        setTeachers(myTeachers);
        setCoursesByTeacher(courseMap);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.myTeachers', 'Мои преподаватели')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('studentTeachers.subtitle', 'Преподаватели ваших курсов')}
            </p>
          </div>
        </div>
        <StudentOrgFilter currentOrgId={profile?.activeOrgId} />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {teachers.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {t('studentTeachers.emptyTitle', 'Нет доступных преподавателей')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('studentTeachers.emptySubtitle', 'Похоже, ни к одному из ваших курсов еще не прикреплен преподаватель.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {teachers.map((teacher) => (
            <div key={teacher.uid} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg transition-all flex flex-col items-center text-center">
              {teacher.avatarUrl ? (
                <img 
                  src={teacher.avatarUrl} 
                  alt={teacher.displayName} 
                  onClick={() => setExpandedAvatar(teacher.avatarUrl!)}
                  className="w-20 h-20 rounded-full object-cover shadow-md mb-4 ring-4 ring-slate-50 dark:ring-slate-700 cursor-pointer hover:scale-105 transition-transform" 
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 text-2xl font-bold shadow-md mb-4 ring-4 ring-slate-50 dark:ring-slate-700">
                  {teacher.displayName?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">
                {teacher.displayName}
              </h3>
              
              <a href={`mailto:${teacher.email}`} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mb-4">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{teacher.email}</span>
              </a>

              <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-700/50 mt-auto">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 text-left">
                  {t('studentTeachers.teaches', 'Ведёт курсы:')}
                </p>
                <div className="flex flex-col gap-1.5 text-left">
                  {coursesByTeacher[teacher.uid]?.map(c => (
                    <div key={c.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/30 px-2 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Avatar Full-Screen Modal */}
      {expandedAvatar && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setExpandedAvatar(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
            onClick={(e) => { e.stopPropagation(); setExpandedAvatar(null); }}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={expandedAvatar} 
            alt="Expanded Avatar" 
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
};

export default StudentTeachersPage;
