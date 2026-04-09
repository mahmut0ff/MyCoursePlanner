import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetOrgMembers, orgGetGroups, orgGetCourses } from '../../lib/api';
import { Users, Mail, Phone, ShieldCheck, GraduationCap } from 'lucide-react';
import StudentOrgFilter from '../../components/ui/StudentOrgFilter';

export default function StudentTeachersPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.uid) return;
    if (!profile?.activeOrgId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch all groups and courses, plus all org members
        const [groupsData, coursesData, allMembers] = await Promise.all([
          orgGetGroups(),
          orgGetCourses(),
          apiGetOrgMembers(profile.activeOrgId!, 'active')
        ]);

        const myGroups = groupsData.filter((g: any) => g.studentIds?.includes(profile.uid));
        
        // Find which courses the student is in based on their groups
        const myCourseIds = new Set(myGroups.map((g: any) => g.courseId));
        const myCourses = coursesData.filter((c: any) => myCourseIds.has(c.id));

        const myTeacherIds = new Set<string>();
        const teacherCourseMap = new Map<string, Set<string>>();

        // Process teachers from groups
        myGroups.forEach((g: any) => {
          if (Array.isArray(g.teacherIds)) {
            g.teacherIds.forEach((tId: string) => {
              myTeacherIds.add(tId);
              if (!teacherCourseMap.has(tId)) teacherCourseMap.set(tId, new Set());
              // Use courseName if available, else find it from coursesData
              const cName = g.courseName || coursesData.find((c:any) => c.id === g.courseId)?.title;
              if (cName) teacherCourseMap.get(tId)!.add(cName);
            });
          }
        });
        
        // Process teachers assigned directly to courses
        myCourses.forEach((c: any) => {
          if (Array.isArray(c.teacherIds)) {
            c.teacherIds.forEach((tId: string) => {
              myTeacherIds.add(tId);
              if (!teacherCourseMap.has(tId)) teacherCourseMap.set(tId, new Set());
              teacherCourseMap.get(tId)!.add(c.title);
            });
          }
        });

        const validRoles = ['teacher', 'mentor', 'admin', 'owner'];
        
        let filteredTeachers = allMembers
          .filter((m: any) => validRoles.includes(m.role) && (myTeacherIds.has(m.userId) || myTeacherIds.has(m.id)))
          .map((m: any) => ({
             ...m,
             taughtCourses: Array.from(teacherCourseMap.get(m.userId) || teacherCourseMap.get(m.id) || [])
          }));

        setTeachers(filteredTeachers);
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
    <div className="max-w-6xl mx-auto space-y-6 px-4 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('student.teachers', 'Мои преподаватели')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Преподаватели, ведущие ваши курсы
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
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Нет назначенных преподавателей
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            К вашим группам пока не прикреплены преподаватели, или вы не состоите ни в одной активной группе.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teachers.map((teacher) => (
             <div key={teacher.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-xl transition-all flex flex-col p-6 group">
                <div className="flex items-center gap-4 mb-4">
                  {teacher.avatarUrl ? (
                    <img src={teacher.avatarUrl} alt={teacher.userName} className="w-16 h-16 rounded-2xl object-cover shadow-sm group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center text-2xl text-primary-600 dark:text-primary-400 font-bold shadow-sm group-hover:scale-105 transition-transform">
                      {teacher.userName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1" title={teacher.userName || teacher.userEmail}>
                      {teacher.userName || teacher.userEmail}
                    </h3>
                    <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      {teacher.role === 'admin' || teacher.role === 'owner' ? 'Администратор / Преподаватель' : 'Преподаватель'}
                    </div>
                  </div>
                </div>

                {teacher.taughtCourses?.length > 0 && (
                  <div className="mb-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Ведет курсы</div>
                    <div className="flex flex-wrap gap-1.5">
                      {teacher.taughtCourses.map((cName: string, i: number) => (
                         <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-md">
                           {cName}
                         </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 flex items-center gap-2">
                  {teacher.userEmail && (
                    <a href={`mailto:${teacher.userEmail}`} className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-colors tooltip flex items-center justify-center flex-1" data-tip="Написать Email">
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                  {teacher.phone && (
                    <a href={`tel:${teacher.phone}`} className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors tooltip flex items-center justify-center flex-1" data-tip="Позвонить">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
