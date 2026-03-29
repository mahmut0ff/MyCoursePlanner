import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgGetGroups } from '../../lib/api';
import { apiGetTeacherProfile } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, BookOpen, Briefcase, Link2, UserPlus, Users, FolderOpen, Phone, FileText, MapPin, GraduationCap, Award } from 'lucide-react';
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

  // Find groups this teacher belongs to
  const teacherGroups = groups.filter((g: any) =>
    g.teacherId === uid || g.teacherIds?.includes(uid) || g.studentIds?.includes(uid)
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!teacher) return <div className="text-center py-20"><UserPlus className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/teachers')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  const subjectsArr = profile?.subjects ? profile.subjects.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <button onClick={() => navigate('/teachers')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors font-bold">
        <ArrowLeft className="w-4 h-4" /> Вернуться к списку
      </button>

      {/* ═══ Premium Hero Card ═══ */}
      <div className="bg-gradient-to-br from-[#46178F] via-[#5C1FB5] to-[#46178F] rounded-[2rem] overflow-hidden shadow-2xl relative mb-8 p-8 sm:p-12">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10">
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-[1.5rem] bg-white p-1.5 shadow-xl shrink-0 rotate-[-2deg] transition-transform hover:rotate-0">
            {teacher.avatarUrl ? (
              <img src={teacher.avatarUrl} alt="" className="w-full h-full rounded-[1.2rem] object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1368CE] rounded-[1.2rem] flex items-center justify-center text-5xl text-white font-bold kahoot-font">
                {teacher.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          
          <div className="text-center sm:text-left pt-2">
            <h1 className="kahoot-font text-3xl sm:text-5xl font-extrabold text-white mb-3 tracking-wide drop-shadow-sm">
              {teacher.displayName}
            </h1>
            
            <p className="text-white/90 font-medium text-base sm:text-lg flex flex-col sm:flex-row items-center sm:justify-start gap-2 sm:gap-4 mb-4">
               <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full"><Briefcase className="w-4 h-4" /> {profile?.specialization || t('teacher.role')}</span>
               {profile?.city && <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full"><MapPin className="w-4 h-4" /> {profile.city}</span>}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white/10 text-white rounded-xl backdrop-blur-sm border border-white/10"><Mail className="w-3.5 h-3.5" />{teacher.email}</span>
              {teacher.phone && (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white/10 text-white rounded-xl backdrop-blur-sm border border-white/10"><Phone className="w-3.5 h-3.5" />{teacher.phone}</span>
              )}
              {teacher.createdAt && (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white/10 text-white rounded-xl backdrop-blur-sm border border-white/10"><Calendar className="w-3.5 h-3.5" />с {new Date(teacher.createdAt).toLocaleDateString()}</span>
              )}
            </div>
            
            {subjectsArr.length > 0 && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
                {subjectsArr.map((s, i) => (
                  <span key={i} className="text-[11px] font-bold px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full shadow-sm">{s}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          {profile?.bio && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="kahoot-font text-2xl font-bold text-slate-800 dark:text-white">О себе</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line sm:text-base font-medium">{profile.bio}</p>
            </div>
          )}

          {profile?.experience && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="kahoot-font text-2xl font-bold text-slate-800 dark:text-white">Опыт работы</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.experience}</p>
            </div>
          )}
          
          {profile?.education && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="kahoot-font text-2xl font-bold text-slate-800 dark:text-white">Образование</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.education}</p>
            </div>
          )}

          {profile?.certificates && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="kahoot-font text-2xl font-bold text-slate-800 dark:text-white">Сертификаты</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.certificates}</p>
            </div>
          )}

          {!profile?.bio && !profile?.experience && !profile?.education && !profile?.certificates && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem]">
              <p className="text-slate-400 font-bold">{t('teacher.noProfileYet')}</p>
              <p className="text-xs text-slate-400 mt-2">Преподаватель пока не заполнил основную информацию.</p>
            </div>
          )}
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          
          {/* Resume Block */}
          {profile?.resumeUrl && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm hover:shadow-lg transition-shadow">
              <h3 className="kahoot-font text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-red-500" /> Резюме
              </h3>
              <a
                href={profile.resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-600 group"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mr-3">
                  <FileText className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{profile.resumeFileName || 'Резюме.pdf'}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Скачать PDF</p>
                </div>
              </a>
            </div>
          )}
          
          {/* Social Links Block */}
          {profile?.socialLinks && profile.socialLinks.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm hover:shadow-lg transition-shadow">
              <h3 className="kahoot-font text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-violet-500" /> {t('teacher.socialLinks')}
              </h3>
              <div className="space-y-3">
                {profile.socialLinks.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600">
                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                      <Link2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{l.platform}</p>
                      <p className="text-[10px] text-slate-500 truncate">{l.url}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Groups List */}
          {teacherGroups.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm hover:shadow-lg transition-shadow">
               <h3 className="kahoot-font text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                 <Users className="w-5 h-5 text-emerald-500" /> {t('teacher.groupsAndCourses')}
               </h3>
               <div className="space-y-3">
                 {teacherGroups.map((g: any) => (
                   <div key={g.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                     <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                       <FolderOpen className="w-4 h-4 text-emerald-500" /> {g.name}
                     </p>
                     {g.courseName && <p className="text-xs font-semibold text-slate-500 mt-1.5 ml-6">Курс: {g.courseName}</p>}
                     <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1 ml-6">{g.studentIds?.length || 0} учеников</p>
                   </div>
                 ))}
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default TeacherDetailPage;
