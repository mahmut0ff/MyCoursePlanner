import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgGetCourses, orgUpdateGroup, orgGetTeachers, orgGetStudents } from '../../lib/api';
import { ArrowLeft, Users, BookOpen, Calendar, Link as LinkIcon, Edit2, Check, X, Loader2, Plus, Briefcase, GraduationCap } from 'lucide-react';
import type { Group, Course, UserProfile } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';



const GroupDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'manager' || role === 'super_admin';

  const [group, setGroup] = useState<Group | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<UserProfile[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat Link Edit State
  const [isEditingChat, setIsEditingChat] = useState(false);
  const [chatForm, setChatForm] = useState({ title: '', url: '' });
  const [savingChat, setSavingChat] = useState(false);

  // Group Info Edit State
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', courseId: '' });
  const [savingGroup, setSavingGroup] = useState(false);

  // Modals for adding teachers/students
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      orgGetGroups().then((all: Group[]) => {
        const found = all.find((g) => g.id === id) || null;
        setGroup(found);
        if (found) {
          setChatForm({ title: found.chatLinkTitle || '', url: found.chatLinkUrl || '' });
          setEditGroupForm({ name: found.name || '', courseId: found.courseId || '' });
        }
      }),
      orgGetCourses().then(setCourses).catch(() => []),
      orgGetTeachers().then(setAllTeachers).catch(() => []),
      orgGetStudents().then(setAllStudents).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [id]);

  const courseName = group?.courseId ? courses.find(c => c.id === group.courseId)?.title || '—' : '—';

  const handleSaveChat = async () => {
    if (!group) return;
    setSavingChat(true);
    try {
      let finalUrl = chatForm.url.trim();
      if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }

      await orgUpdateGroup({
        id: group.id,
        chatLinkTitle: chatForm.title,
        chatLinkUrl: finalUrl
      });
      setGroup({ ...group, chatLinkTitle: chatForm.title, chatLinkUrl: finalUrl });
      setIsEditingChat(false);
      toast.success(t('common.saved', 'Сохранено'));
    } catch (e: any) {
      toast.error(e.message || 'Error saving chat link');
    } finally {
      setSavingChat(false);
    }
  };

  const handleSaveGroupInfo = async () => {
    if (!group || !editGroupForm.name.trim()) return;
    setSavingGroup(true);
    try {
      const selectedCourse = courses.find(c => c.id === editGroupForm.courseId);
      // Using `any` cast for orgUpdateGroup to pass optional params easily if types are strict
      const payload = {
        id: group.id,
        name: editGroupForm.name,
        courseId: editGroupForm.courseId || '',
        courseName: selectedCourse ? selectedCourse.title : ''
      };
      
      await orgUpdateGroup(payload);
      
      setGroup({
        ...group,
        name: payload.name,
        courseId: payload.courseId,
        courseName: payload.courseName as any
      });
      setShowEditGroupModal(false);
      toast.success(t('common.saved', 'Сохранено'));
    } catch (e: any) {
      toast.error(e.message || 'Error saving group');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!group || !selectedUserId) return;
    setAddingUser(true);
    try {
      const currentIds = group.teacherIds || [];
      if (!currentIds.includes(selectedUserId)) {
        await orgUpdateGroup({ id: group.id, teacherIds: [...currentIds, selectedUserId] });
        setGroup({ ...group, teacherIds: [...currentIds, selectedUserId] });
        toast.success('Преподаватель назначен!');
      }
      setShowAddTeacher(false);
      setSelectedUserId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    if (!group) return;
    if (!window.confirm('Открепить преподавателя?')) return;
    try {
      const currentIds = group.teacherIds || [];
      const newIds = currentIds.filter(id => id !== teacherId);
      await orgUpdateGroup({ id: group.id, teacherIds: newIds });
      setGroup({ ...group, teacherIds: newIds });
      toast.success('Преподаватель откреплен');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAddStudent = async () => {
    if (!group || !selectedUserId) return;
    setAddingUser(true);
    try {
      const currentIds = group.studentIds || [];
      if (!currentIds.includes(selectedUserId)) {
        await orgUpdateGroup({ id: group.id, studentIds: [...currentIds, selectedUserId] });
        setGroup({ ...group, studentIds: [...currentIds, selectedUserId] });
        toast.success('Ученик добавлен!');
      }
      setShowAddStudent(false);
      setSelectedUserId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    if (!window.confirm('Открепить ученика?')) return;
    try {
      const currentIds = group.studentIds || [];
      const newIds = currentIds.filter(id => id !== studentId);
      await orgUpdateGroup({ id: group.id, studentIds: newIds });
      setGroup({ ...group, studentIds: newIds });
      toast.success('Ученик откреплен');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin dark:border-slate-700" /></div>;
  if (!group) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm font-bold text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/groups')} className="mt-3 font-bold text-emerald-500 text-sm hover:underline">{t('common.back')}</button></div>;

  const currentTeacherIds = group.teacherIds || [];
  const currentStudentIds = group.studentIds || [];
  const currentTeachers = allTeachers.filter(t => currentTeacherIds.includes(t.uid));
  const currentStudents = allStudents.filter(s => currentStudentIds.includes(s.uid));

  const availableTeachers = allTeachers.filter(t => !currentTeacherIds.includes(t.uid));
  const availableStudents = allStudents.filter(s => !currentStudentIds.includes(s.uid));

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => navigate('/groups')} className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-500 mb-4 transition-all hover:gap-2.5">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Premium Hero Section */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm mb-8">
        {/* Background Decorative Graphic */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-violet-500/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50 pointer-events-none" />
        
        <div className="relative p-8 md:p-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800">
                  <Users className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
                  Группа
                </span>
                {courseName && (
                  <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                    <BookOpen className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
                    {courseName}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {group.name}
                </h1>
                {isAdmin && (
                  <button 
                    onClick={() => {
                      setEditGroupForm({ name: group.name, courseId: group.courseId || '' });
                      setShowEditGroupModal(true);
                    }} 
                    className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 rounded-xl transition-all shadow-sm hover:shadow"
                    title="Редактировать группу"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Chat Link Management */}
              {isEditingChat ? (
                 <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 max-w-md">
                    <div className="flex-1 space-y-2">
                       <input value={chatForm.title} onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))} placeholder="Название (Telegram, WhatsApp...)" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:border-violet-500" />
                       <input value={chatForm.url} onChange={e => setChatForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:border-violet-500" />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                       <button onClick={handleSaveChat} disabled={savingChat} className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                       <button onClick={() => setIsEditingChat(false)} className="p-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                 </div>
              ) : (
                 <div className="flex items-center gap-3">
                    {group.chatLinkUrl ? (
                      <a href={group.chatLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-sm rounded-xl border border-blue-100 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                        <LinkIcon className="w-4 h-4" /> {group.chatLinkTitle || 'Чат группы'}
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 text-slate-400 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700 border-dashed">
                        Нет ссылки на чат
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => setIsEditingChat(true)} className="p-2 text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-xl transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                 </div>
              )}
            </div>

            {/* Stats Keycards Grid */}
            <div className="grid grid-cols-2 gap-3 shrink-0 md:w-80">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <GraduationCap className="w-6 h-6 text-emerald-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{currentStudents.length}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Учеников</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <Briefcase className="w-6 h-6 text-blue-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{currentTeachers.length}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Учителей</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl col-span-2 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString() : '—'}
                    </span>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.created', 'Создан')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Main Column */}
         <div className="md:col-span-2 space-y-6">

            {/* Students List */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
               <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                     <GraduationCap className="w-5 h-5 text-emerald-500" />
                     <h2 className="font-extrabold uppercase tracking-wider text-sm">Ученики ({currentStudents.length})</h2>
                  </div>
                  {isAdmin && (
                    <button onClick={() => setShowAddStudent(true)} className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-colors" title="Добавить ученика">
                       <Plus className="w-5 h-5" />
                    </button>
                  )}
               </div>
               <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {currentStudents.length === 0 ? (
                    <div className="p-8 text-center">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Нет учеников</p>
                    </div>
                  ) : (
                    currentStudents.map(s => (
                      <div key={s.uid} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                         <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/students/${s.uid}`)}>
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
                                 {s.displayName?.[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                               <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">{s.displayName}</p>
                               <p className="text-xs text-slate-500">{s.email}</p>
                            </div>
                         </div>
                         {isAdmin && (
                           <button onClick={() => handleRemoveStudent(s.uid)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all">
                             <X className="w-4 h-4" />
                           </button>
                         )}
                      </div>
                    ))
                  )}
               </div>
             </div>

         </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddTeacher && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowAddTeacher(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Назначить преподавателя</h2>
             <p className="text-xs font-medium text-slate-500 mb-5">Преподаватель получит доступ к группе и журналу.</p>
             
             {availableTeachers.length === 0 ? (
               <div className="bg-amber-50 text-amber-600 p-3 rounded-xl text-xs font-medium mb-4">
                 Нет доступных преподавателей. 
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500 mb-5"
               >
                 <option value="">-- Выберите --</option>
                 {availableTeachers.map(t => (
                   <option key={t.uid} value={t.uid}>{t.displayName}</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddTeacher(false)} className="px-4 py-2 font-bold text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAddTeacher} 
                 disabled={!selectedUserId || addingUser}
                 className="bg-violet-500 hover:bg-violet-600 text-white px-5 py-2 rounded-xl font-bold text-xs disabled:opacity-50 transition-colors shadow-md shadow-violet-500/20"
               >
                 {addingUser ? '...' : 'Назначить'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowAddStudent(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Добавить ученика</h2>
             <p className="text-xs font-medium text-slate-500 mb-5">Ученик получит доступ к этой группе.</p>
             
             {availableStudents.length === 0 ? (
               <div className="bg-amber-50 text-amber-600 p-3 rounded-xl text-xs font-medium mb-4">
                 Все ученики уже в группе.
               </div>
             ) : (
               <select 
                 value={selectedUserId} 
                 onChange={e => setSelectedUserId(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 mb-5"
               >
                 <option value="">-- Выберите --</option>
                 {availableStudents.map(s => (
                   <option key={s.uid} value={s.uid}>{s.displayName} ({s.email})</option>
                 ))}
               </select>
             )}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAddStudent(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAddStudent} 
                 disabled={!selectedUserId || addingUser}
                 className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-md shadow-emerald-500/20"
               >
                 {addingUser ? '...' : 'Добавить'}
               </button>
             </div>
          </div>
        </div>
      )}
      {/* Edit Group Info Modal */}
      {showEditGroupModal && isAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl" onClick={() => setShowEditGroupModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Редактировать группу</h2>
             
             <div className="space-y-4 mb-6">
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Название группы</label>
                 <input 
                   value={editGroupForm.name} 
                   onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))}
                   placeholder="Название группы" 
                   className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500" 
                 />
               </div>
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Курс</label>
                 <select 
                   value={editGroupForm.courseId} 
                   onChange={e => setEditGroupForm(f => ({ ...f, courseId: e.target.value }))}
                   className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-violet-500"
                 >
                   <option value="">-- Без курса --</option>
                   {courses.map(c => (
                     <option key={c.id} value={c.id}>{c.title}</option>
                   ))}
                 </select>
               </div>
             </div>

             <div className="flex justify-end gap-3">
               <button 
                 onClick={() => setShowEditGroupModal(false)} 
                 className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
               >
                 {t('common.cancel')}
               </button>
               <button 
                 onClick={handleSaveGroupInfo} 
                 disabled={!editGroupForm.name.trim() || savingGroup}
                 className="bg-violet-500 hover:bg-violet-600 text-white px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-md shadow-violet-500/20"
               >
                 {savingGroup ? 'Сохранение...' : t('common.save')}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetailPage;
