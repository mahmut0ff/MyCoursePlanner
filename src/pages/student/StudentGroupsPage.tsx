import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetCourses } from '../../lib/api';
import { Users, FolderOpen, MessageCircle } from 'lucide-react';
import type { Group, Course } from '../../types';

export default function StudentGroupsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.uid) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [allGroups, allCourses] = await Promise.all([
          orgGetGroups(),
          orgGetCourses()
        ]);

        const myGroups = allGroups.filter((g: any) => g.studentIds?.includes(profile.uid));
        setGroups(myGroups);
        setCourses(allCourses);
      } catch (err: any) {
        setError(err.message || t('common.loadError', 'Ошибка загрузки'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [profile?.uid, profile?.activeOrgId]);

  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || '—';

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('student.groups', 'Мои группы')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('student.groupsPage.subtitle', 'Группы, в которых вы состоите')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {groups.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 py-12 px-4 text-center">
          <div className="flex items-center justify-center mx-auto mb-2">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            {t('student.groupsPage.emptyTitle', 'Нет доступных групп')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('student.groupsPage.emptyDesc', 'Вы пока не состоите ни в одной группе. Обратитесь к директору для добавления.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((group) => (
            <div key={group.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
              
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">{group.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <FolderOpen className="w-3 h-3" />
                      {courseName(group.courseId)}
                    </p>
                  </div>
                </div>

                {/* Additional info badges */}
                <div className="flex gap-2 mb-3 mt-auto">
                  <div className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 tabular-nums">
                    <Users className="w-3 h-3" />
                    {t('student.groupsPage.students', { count: group.studentIds?.length || 0 })}
                  </div>
                </div>

                {/* Chat Action */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                  {group.chatLinkUrl ? (
                    <a 
                      href={group.chatLinkUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {group.chatLinkTitle || t('student.groupsPage.openChat', 'Перейти в чат')}
                    </a>
                  ) : (
                    <div className="w-full h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 px-3 rounded-md text-sm flex items-center justify-center gap-1.5 cursor-not-allowed">
                      <MessageCircle className="w-3.5 h-3.5 opacity-50" />
                      {t('student.groupsPage.noChat', 'Чат не привязан')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
