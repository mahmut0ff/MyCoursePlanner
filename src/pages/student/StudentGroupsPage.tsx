import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetCourses } from '../../lib/api';
import { Users, FolderOpen, MessageCircle } from 'lucide-react';
import StudentOrgFilter from '../../components/ui/StudentOrgFilter';
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
        <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('student.groups', 'Мои группы')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Группы, в которых вы состоите
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

      {groups.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Нет доступных групп
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Вы пока не состоите ни в одной группе. Обратитесь к директору для добавления.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div key={group.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-xl transition-all group flex flex-col">
              {/* Premium Header Accent */}
              <div className="h-2 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
              
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1">{group.name}</h3>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 uppercase tracking-wider">
                      <FolderOpen className="w-3 h-3" />
                      {courseName(group.courseId)}
                    </p>
                  </div>
                </div>

                {/* Additional info badges */}
                <div className="flex gap-2 mb-6 mt-auto">
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <Users className="w-3.5 h-3.5" />
                    {group.studentIds?.length || 0} ученик(ов)
                  </div>
                </div>

                {/* Chat Action */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-700">
                  {group.chatLinkUrl ? (
                    <a 
                      href={group.chatLinkUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full bg-[#1368CE] hover:bg-[#105ab3] text-white py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-[0_4px_0_#0a4387] active:translate-y-[4px] active:shadow-[0_0px_0_#0a4387]"
                    >
                      <MessageCircle className="w-5 h-5" />
                      {group.chatLinkTitle || 'Перейти в Чат'}
                    </a>
                  ) : (
                    <div className="w-full bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 py-3 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-not-allowed">
                      <MessageCircle className="w-5 h-5 opacity-50" />
                      Чат не привязан
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
