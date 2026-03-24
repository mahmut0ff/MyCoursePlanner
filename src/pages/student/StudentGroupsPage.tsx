import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetStudents, orgGetCourses } from '../../lib/api';
import { UsersRound, BookOpen, User, X } from 'lucide-react';
import type { Group, UserProfile, Course } from '../../types';

const StudentGroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [orgGroups, orgStudents, orgCourses] = await Promise.all([
          orgGetGroups(),
          orgGetStudents(),
          orgGetCourses()
        ]);

        const myGroups = orgGroups.filter((g: any) => g.studentIds?.includes(profile.uid));
        
        setGroups(myGroups);
        setAllStudents(orgStudents);
        setAllCourses(orgCourses);
      } catch (err: any) {
        setError(err.message || 'Failed to load groups');
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
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <UsersRound className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.myGroups', 'Мои группы')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('studentGroups.subtitle', 'Ваши учебные группы и одногруппники')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {groups.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UsersRound className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {t('studentGroups.emptyTitle', 'Нет доступных групп')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('studentGroups.emptySubtitle', 'Вы еще не состоите ни в одной учебной группе.')}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const course = allCourses.find(c => c.id === group.courseId);
            const classmates = allStudents.filter(s => group.studentIds?.includes(s.uid));

            return (
              <div key={group.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{group.name}</h2>
                    {course && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-slate-500 dark:text-slate-400">
                        <BookOpen className="w-4 h-4" />
                        <span>{course.title}</span>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-medium flex items-center gap-2">
                    <UsersRound className="w-4 h-4" />
                    {classmates.length} {t('studentGroups.studentsCount', 'студентов')}
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">{t('studentGroups.classmates', 'Одногруппники')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {classmates.map(student => (
                      <div key={student.uid} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        {student.avatarUrl ? (
                          <img 
                            src={student.avatarUrl} 
                            alt={student.displayName} 
                            onClick={() => setExpandedAvatar(student.avatarUrl!)}
                            className="w-10 h-10 rounded-full object-cover shadow-sm ring-2 ring-white dark:ring-slate-800 cursor-pointer hover:opacity-90 active:scale-95 transition-all" 
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold shadow-sm ring-2 ring-white dark:ring-slate-800">
                            {student.displayName?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate" title={student.displayName}>
                            {student.displayName} {student.uid === profile?.uid && <span className="text-xs text-slate-400 ml-1">({t('common.you', 'Вы')})</span>}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{student.email}</p>
                        </div>
                      </div>
                    ))}
                    {classmates.length === 0 && (
                      <div className="col-span-full py-4 text-center text-sm text-slate-500 dark:text-slate-400 italic">
                        {t('studentGroups.noClassmates', 'В этой группе пока нет других студентов')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

export default StudentGroupsPage;
