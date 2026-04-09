import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetCourse, orgUpdateCourse, orgDeleteCourse, orgGetGroups, orgCreateGroup } from '../../lib/api';
import { ArrowLeft, BookOpen, Calendar, Users, FileText, Edit, Trash2, Plus, MessageSquare, Coins, LayoutGrid } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Course, Group } from '../../types';

const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [course, setCourse] = useState<Course | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  
  // Form states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [editForm, setEditForm] = useState<{
    title: string; description: string; subject: string; status: 'draft' | 'published';
    price?: number; paymentFormat?: 'one-time' | 'monthly'; durationMonths?: number;
  }>({ title: '', description: '', subject: '', status: 'draft', price: 0, paymentFormat: 'monthly', durationMonths: 1 });

  const [groupForm, setGroupForm] = useState({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingGroupId, setExistingGroupId] = useState('');

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([orgGetCourse(id), orgGetGroups()])
      .then(([found, allGroupsData]) => {
        setCourse(found || null);
        if (found) {
          setEditForm({ 
            title: found.title, 
            description: found.description || '', 
            subject: found.subject || '', 
            status: found.status as any || 'draft', 
            price: found.price || 0, 
            paymentFormat: found.paymentFormat || 'monthly', 
            durationMonths: found.durationMonths || 1 
          });
          setAllGroups(allGroupsData);
          setGroups(allGroupsData.filter((g: Group) => g.courseId === found.id));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleUpdateCourse = async () => {
    if (!course || !editForm.title.trim()) return;
    setSaving(true); setError('');
    try {
      const u = await orgUpdateCourse({ id: course.id, ...editForm });
      setCourse({ ...course, ...u });
      setShowEditModal(false);
    } catch (e: any) { setError(e.message || 'Error updating course'); } finally { setSaving(false); }
  };

  const handleDeleteCourse = async () => {
    if (!course) return;
    if (!confirm(t('common.confirmDelete', 'Вы уверены, что хотите удалить?'))) return;
    try { 
      await orgDeleteCourse(course.id); 
      navigate('/courses');
    } catch (e: any) { setError(e.message); }
  };

  const handleCreateGroup = async () => {
    if (!course || !groupForm.name.trim()) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateGroup({ 
        ...groupForm,
        courseId: course.id,
        courseName: course.title 
      });
      setGroups(prev => [created, ...prev]);
      setAllGroups(prev => [...prev, created]);
      setShowGroupModal(false);
      setGroupForm({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
    } catch (e: any) { setError(e.message || 'Error creating group'); } finally { setSaving(false); }
  };

  const handleAttachExistingGroup = async () => {
    import('../../lib/api').then(async ({ orgUpdateGroup }) => {
      if (!course || !existingGroupId) return;
      setSaving(true); setError('');
      try {
        const updated = await orgUpdateGroup({
          id: existingGroupId,
          courseId: course.id,
          courseName: course.title
        });
        setGroups(prev => [updated, ...prev]);
        setAllGroups(prev => prev.map(g => g.id === existingGroupId ? updated : g));
        setShowGroupModal(false);
        setExistingGroupId('');
      } catch (e: any) { 
        setError(e.message || 'Error attaching group'); 
      } finally { 
        setSaving(false); 
      }
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" />
    </div>
  );
  
  if (!course) return (
    <div className="text-center py-20 animate-fade-in">
      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
        <BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('common.notFound', 'Не найдено')}</h3>
      <button onClick={() => navigate('/courses')} className="mt-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">{t('common.back', 'Назад к курсам')}</button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16 font-sans animate-fade-in space-y-8">
      {/* Back Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/courses')} className="group flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          {t('common.back', 'Назад')}
        </button>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-slate-700 dark:text-slate-300 shadow-sm hover:shadow">
              <Edit className="w-4 h-4 text-primary-500" /> Редактировать
            </button>
            <button onClick={handleDeleteCourse} className="flex items-center justify-center w-9 h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 transition-all text-slate-400 hover:text-red-500 shadow-sm">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Premium Hero Section */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
        {/* Background Decorative Graphic */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-primary-500/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50 pointer-events-none" />
        
        <div className="relative p-8 md:p-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <span className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border ${course.status === 'published' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'}`}>
                  {course.status === 'published' ? t('common.published') : t('common.draft')}
                </span>
                {course.subject && (
                  <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                    {course.subject}
                  </span>
                )}
              </div>
              
              <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-4">
                {course.title}
              </h1>
              
              <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                {course.description || 'Описание курса не добавлено. Добавьте описание, чтобы студентам было проще понять, о чем курс.'}
              </p>

              <div className="flex flex-wrap items-center gap-4">
                {(course.price && course.price > 0) ? (
                  <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl font-bold border border-emerald-100 dark:border-emerald-800/50">
                    <Coins className="w-5 h-5" />
                    <span className="text-lg">{course.price.toLocaleString()} с.</span>
                    <span className="text-xs font-medium opacity-70">
                      /{course.paymentFormat === 'monthly' ? t('common.monthly', 'мес') : t('common.oneTime', 'разово')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-bold border border-slate-200 dark:border-slate-700">
                    <Coins className="w-5 h-5 opacity-50" />
                    <span>Бесплатно</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Keycards Grid */}
            <div className="grid grid-cols-2 gap-3 shrink-0 md:w-80">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <FileText className="w-6 h-6 text-blue-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{course.lessonIds?.length || 0}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('nav.lessons', 'Уроки')}</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <Users className="w-6 h-6 text-violet-500 mb-2" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{groups.length}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Групп</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl col-span-2 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      {course.createdAt ? new Date(course.createdAt).toLocaleDateString() : '—'}
                    </span>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.created', 'Создан')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Course Groups Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Группы на курсе</h2>
          </div>
          {isAdmin && (
            <button onClick={() => setShowGroupModal(true)} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95">
              <Plus className="w-4 h-4" /> Добавить группу
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 border-dashed dark:border-slate-700 rounded-3xl p-12 text-center">
            <LayoutGrid className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Нет привязанных групп</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">Создайте группу и добавьте в неё студентов, чтобы они могли начать обучение на этом курсе.</p>
            {isAdmin && (
              <button onClick={() => setShowGroupModal(true)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white px-5 py-2.5 rounded-xl font-semibold inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
                <Plus className="w-4 h-4" /> Добавить группу
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => (
              <div key={group.id} onClick={() => navigate(`/groups/${group.id}`)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-700/50 transition-all group/item">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 rounded-xl flex items-center justify-center font-bold">
                      {group.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white group-hover/item:text-violet-600 dark:group-hover/item:text-violet-400 transition-colors">{group.name}</h4>
                      <p className="text-xs text-slate-500">{group.studentIds?.length || 0} учеников</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 group-hover/item:bg-violet-50 group-hover/item:text-violet-600 dark:group-hover/item:bg-violet-900/30 dark:group-hover/item:text-violet-400 transition-colors">
                    <ArrowLeft className="w-4 h-4 rotate-135" style={{ transform: 'rotate(135deg)' }} />
                  </div>
                </div>
                {group.chatLinkUrl && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {group.chatLinkTitle || 'Чат группы'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Course Modal */}
      {showEditModal && isAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Редактировать курс</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.name')}</label>
                <input placeholder={t('org.courses.titlePlaceholder')} value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.courses.subject', 'Предмет')}</label>
                <input placeholder={t('org.courses.subjectPlaceholder')} value={editForm.subject} onChange={(e) => setEditForm(f => ({ ...f, subject: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.description', 'Описание')}</label>
                <textarea placeholder={t('org.courses.descPlaceholder')} value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none min-h-[120px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('common.status')}</label>
                  <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as any }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none">
                    <option value="draft">{t('common.draft')}</option><option value="published">{t('common.published')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Стоимость (с.)</label>
                  <input type="number" min="0" placeholder="0" value={editForm.price} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Формат оплаты</label>
                  <select value={editForm.paymentFormat} onChange={(e) => setEditForm(f => ({ ...f, paymentFormat: e.target.value as any }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none appearance-none">
                    <option value="monthly">{t('common.monthly', 'Ежемесячно')}</option>
                    <option value="one-time">{t('common.oneTime', 'Единоразово')}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowEditModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleUpdateCourse} disabled={saving || !editForm.title.trim()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50">{saving ? 'Сохранение...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Group Modal */}
      {showGroupModal && isAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Добавить группу</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">Курс: <span className="text-slate-900 dark:text-white font-bold">{course.title}</span></p>
            
            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl mb-6">
              <button 
                onClick={() => setAddMode('new')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${addMode === 'new' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Создать новую
              </button>
              <button 
                onClick={() => setAddMode('existing')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${addMode === 'existing' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Выбрать существующую
              </button>
            </div>

            {addMode === 'new' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Название группы *</label>
                  <input placeholder="Например: Фронтенд 2024" value={groupForm.name} onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none" autoFocus />
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Ссылка на чат</span>
                  </div>
                  <div className="space-y-3">
                    <input placeholder="Название чата (напр. Telegram)" value={groupForm.chatLinkTitle} onChange={(e) => setGroupForm(f => ({ ...f, chatLinkTitle: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none" />
                    <input placeholder="https://t.me/..." value={groupForm.chatLinkUrl} onChange={(e) => setGroupForm(f => ({ ...f, chatLinkUrl: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Выберите группу</label>
                  <select 
                    value={existingGroupId} 
                    onChange={e => setExistingGroupId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none"
                  >
                    <option value="">-- Выберите группу --</option>
                    {allGroups.filter(g => g.courseId !== course.id).map(g => (
                      <option key={g.id} value={g.id}>{g.name} {g.courseId ? `(${g.courseName})` : '(Без курса)'}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => {
                  setShowGroupModal(false);
                  setAddMode('new');
                  setExistingGroupId('');
                  setGroupForm({ name: '', chatLinkTitle: '', chatLinkUrl: '' });
                }} 
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={addMode === 'new' ? handleCreateGroup : handleAttachExistingGroup} 
                disabled={saving || (addMode === 'new' ? !groupForm.name.trim() : !existingGroupId)} 
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : (addMode === 'new' ? 'Создать группу' : 'Привязать группу')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetailPage;
