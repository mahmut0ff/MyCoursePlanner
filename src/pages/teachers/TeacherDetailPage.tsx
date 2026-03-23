import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgGetGroups } from '../../lib/api';
import { apiGetTeacherProfile } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, BookOpen, Briefcase, Link2, UserPlus, Users, FolderOpen } from 'lucide-react';
import type { UserProfile, TeacherProfile } from '../../types';

const TeacherDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [teacher, setTeacher] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([
      orgGetTeachers().then((all: UserProfile[]) => setTeacher(all.find((u) => u.uid === uid) || null)),
      apiGetTeacherProfile(uid).then((d: any) => setProfile(d)).catch(() => null),
      orgGetGroups().then((all: any[]) => setGroups(all)).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [uid]);

  // Find groups this teacher belongs to (if student IDs contain uid — or if group has teacher reference)
  const teacherGroups = groups.filter((g: any) =>
    g.teacherId === uid || g.teacherIds?.includes(uid) || g.studentIds?.includes(uid)
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!teacher) return <div className="text-center py-20"><UserPlus className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/teachers')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/teachers')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 h-24" />
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-4 mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-2xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
              {teacher.displayName?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="pb-1">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{teacher.displayName}</h1>
              <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{teacher.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 bg-violet-500/10 text-violet-500 rounded-full font-medium">{t('teacher.role')}</span>
            {teacher.createdAt && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{t('teacher.joined')}: {new Date(teacher.createdAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Groups & Courses */}
      {teacherGroups.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-violet-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.groupsAndCourses')}</h2></div>
          <div className="space-y-2">
            {teacherGroups.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5 text-primary-500" />{g.name}</p>
                  {g.courseName && <p className="text-xs text-slate-500 ml-5">{t('teacher.course')}: {g.courseName}</p>}
                </div>
                <span className="text-[10px] text-slate-400">{g.studentIds?.length || 0} {t('teacher.students')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Sections */}
      <div className="space-y-4">
        {profile?.bio && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-violet-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.bio')}</h2></div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{profile.bio}</p>
          </div>
        )}

        {profile?.specialization && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-violet-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.specialization')}</h2></div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{profile.specialization}</p>
          </div>
        )}

        {profile?.experience && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><Briefcase className="w-4 h-4 text-violet-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.experience')}</h2></div>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{profile.experience}</p>
          </div>
        )}

        {profile?.socialLinks && profile.socialLinks.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><Link2 className="w-4 h-4 text-violet-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('teacher.socialLinks')}</h2></div>
            <div className="space-y-2">
              {profile.socialLinks.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 hover:underline">
                  <span className="text-xs text-slate-500 font-medium w-24">{l.platform}</span>{l.url}
                </a>
              ))}
            </div>
          </div>
        )}

        {!profile?.bio && !profile?.specialization && !profile?.experience && (
          <div className="text-center py-8 text-slate-400 text-sm">{t('teacher.noProfileYet')}</div>
        )}
      </div>
    </div>
  );
};

export default TeacherDetailPage;
