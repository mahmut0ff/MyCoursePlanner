import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetTeachers, orgGetGroups, orgUpdateGroup, apiGetTeacherProfile } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, BookOpen, Briefcase, Phone, MapPin, GraduationCap, Award, Users, Plus, X } from 'lucide-react';
import type { UserProfile, TeacherProfile, Group } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const C = {
  purple: '#46178f',
  blue: '#1368ce',
  green: '#26890c',
  red: '#e21b3c',
  yellow: '#d89e00',
  teal: '#0aa08a',
};

const TeacherDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role } = useAuth();
  const canAssign = role === 'admin' || role === 'manager' || role === 'super_admin';

  const [teacher, setTeacher] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([
      orgGetTeachers().then((all: UserProfile[]) => setTeacher(all.find((u) => u.uid === uid) || null)),
      apiGetTeacherProfile(uid).then((d: any) => setProfile(d)).catch(() => null),
      orgGetGroups().then((all: Group[]) => setGroups(all)).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [uid]);

  // Handle assigning a teacher to a group
  const handleAssignGroup = async () => {
    if (!selectedGroupId || !uid) return;
    const targetGroup = groups.find(g => g.id === selectedGroupId);
    if (!targetGroup) return;

    setAssigning(true);
    try {
      const currentTeacherIds = targetGroup.teacherIds || [];
      if (!currentTeacherIds.includes(uid)) {
        await orgUpdateGroup({
          id: targetGroup.id,
          teacherIds: [...currentTeacherIds, uid]
        });
        
        // Update local state
        setGroups(groups.map(g => 
          g.id === targetGroup.id 
            ? { ...g, teacherIds: [...currentTeacherIds, uid] }
            : g
        ));
        toast.success(t('common.saved', 'Преподаватель назначен!'));
      } else {
         toast.error('Преподаватель уже прикреплен к этой группе');
      }
      setShowAssignModal(false);
      setSelectedGroupId('');
    } catch (e: any) {
      toast.error(e.message || 'Error assigning teacher');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignGroup = async (groupId: string) => {
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup || !uid) return;
    
    // confirm
    if (!window.confirm('Открепить преподавателя от группы?')) return;

    try {
      const currentTeacherIds = targetGroup.teacherIds || [];
      const updatedIds = currentTeacherIds.filter(id => id !== uid);
      
      await orgUpdateGroup({
        id: targetGroup.id,
        teacherIds: updatedIds
      });
      
      setGroups(groups.map(g => 
        g.id === targetGroup.id 
          ? { ...g, teacherIds: updatedIds }
          : g
      ));
      toast.success('Преподаватель откреплен');
    } catch (e: any) {
      toast.error(e.message || 'Error unassigning');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: `${C.purple}30`, borderTopColor: C.purple }} />
    </div>
  );

  if (!teacher) return (
    <div className="text-center py-20">
      <Briefcase className="w-14 h-14 mx-auto mb-3" style={{ color: C.purple, opacity: 0.2 }} />
      <p className="text-sm font-bold text-slate-500">{t('common.notFound')}</p>
      <button onClick={() => navigate('/teachers')} className="mt-3 text-sm font-bold hover:underline" style={{ color: C.purple }}>{t('common.back')}</button>
    </div>
  );

  const subjectsArr = profile?.subjects ? profile.subjects.split(',').map(s => s.trim()).filter(Boolean) : [];
  const teacherGroups = groups.filter(g => g.teacherIds?.includes(uid!));
  const availableGroups = groups.filter(g => !(g.teacherIds || []).includes(uid!));

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => navigate('/teachers')} className="flex items-center gap-1.5 text-sm font-bold mb-4 transition-all hover:gap-2.5" style={{ color: C.purple }}>
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Hero Profile Card */}
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6 shadow-sm">
        <div className="h-28 sm:h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue} 50%, ${C.teal} 100%)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 5 L55 17.5 L55 42.5 L30 55 L5 42.5 L5 17.5 Z\' fill=\'none\' stroke=\'white\' stroke-width=\'1\'/%3E%3C/svg%3E")', backgroundSize: '60px 60px' }} />
          
          <div className="absolute bottom-3 right-4 flex items-center gap-3">
             <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
               <Calendar className="w-3.5 h-3.5" />
               <span className="text-[11px] font-bold">с {new Date(teacher.createdAt).toLocaleDateString()}</span>
             </div>
          </div>
        </div>

        <div className="px-6 pb-6 relative">
          {/* Avatar */}
          <div className="absolute -top-10 left-6">
            {teacher.avatarUrl ? (
              <img src={teacher.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl text-white font-extrabold shadow-xl ring-4 ring-white dark:ring-slate-800" style={{ background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue} 100%)` }}>
                {teacher.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="pt-12 sm:pt-2 sm:ml-24 flex items-start justify-between flex-wrap gap-4">
             <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{teacher.displayName}</h1>
                <div className="flex items-center gap-1.5 mt-1 mb-2">
                   <span className="flex items-center gap-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">
                     <Briefcase className="w-3 h-3" /> {profile?.specialization || t('teacher.role', 'Преподаватель')}
                   </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{teacher.email}</span>
                  {teacher.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{teacher.phone}</span>}
                  {profile?.city && <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.city}</span>}
                </div>
             </div>

             {subjectsArr.length > 0 && (
                <div className="flex flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest leading-none">Предметы</span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {subjectsArr.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${C.purple}15`, color: C.purple }}>{s}</span>
                    ))}
                  </div>
                </div>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content Info */}
        <div className="lg:col-span-2 space-y-6">
          {profile?.bio && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">О себе</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.bio}</p>
            </div>
          )}

          {profile?.experience && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-5 h-5 text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Опыт работы</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.experience}</p>
            </div>
          )}
          
          {profile?.education && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="w-5 h-5 text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Образование</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.education}</p>
            </div>
          )}

          {profile?.certificates && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Сертификаты</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">{profile.certificates}</p>
            </div>
          )}

          {!profile?.bio && !profile?.experience && !profile?.education && !profile?.certificates && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-slate-400 font-bold">{t('teacher.noProfileYet', 'Профиль пока не заполнен')}</p>
            </div>
          )}
        </div>

        {/* Sidebar: Assigned Groups */}
        <div className="space-y-6">
           <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Users className="w-4 h-4 text-slate-400" />
                   <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Группы</h3>
                 </div>
                 {canAssign && (
                   <button onClick={() => setShowAssignModal(true)} className="p-1 text-slate-400 hover:text-white hover:bg-violet-500 rounded transition-colors" title="Добавить группу">
                      <Plus className="w-4 h-4" />
                   </button>
                 )}
              </div>
              
              <div className="p-3 divide-y divide-slate-50 dark:divide-slate-700/50">
                {teacherGroups.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-4 font-medium">Нет прикрепленных групп</p>
                ) : (
                  teacherGroups.map(g => (
                    <div key={g.id} className="py-2.5 px-2 flex items-center justify-between group">
                       <div className="flex-1 cursor-pointer" onClick={() => navigate(`/groups/${g.id}`)}>
                          <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary-500 transition-colors truncate">{g.name}</p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{g.courseName}</p>
                       </div>
                       {canAssign && (
                         <button onClick={() => handleUnassignGroup(g.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all">
                           <X className="w-3.5 h-3.5" />
                         </button>
                       )}
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Назначить группу</h2>
             <p className="text-xs text-slate-500 mb-4">Выберите группу для преподавателя <b>{teacher.displayName}</b>. Преподаватель получит доступ к материалам курса.</p>
             
             {availableGroups.length === 0 ? (
               <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs mb-4">
                 Нет доступных групп для назначения.
               </div>
             ) : (
               <select 
                 value={selectedGroupId} 
                 onChange={e => setSelectedGroupId(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-violet-500 mb-5"
               >
                 <option value="">-- Выберите группу --</option>
                 {availableGroups.map(g => (
                   <option key={g.id} value={g.id}>{g.name} ({g.courseName || 'Без курса'})</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAssignGroup} 
                 disabled={!selectedGroupId || assigning}
                 className="bg-violet-500 hover:bg-violet-600 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-md shadow-violet-500/20"
               >
                 {assigning ? 'Назначение...' : 'Назначить'}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDetailPage;
