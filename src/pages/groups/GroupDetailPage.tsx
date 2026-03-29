import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgGetCourses, orgUpdateGroup } from '../../lib/api';
import { ArrowLeft, Users, BookOpen, Calendar, Link as LinkIcon, Edit2, Check, X, Loader2 } from 'lucide-react';
import type { Group, Course } from '../../types';
import toast from 'react-hot-toast';

const GroupDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [group, setGroup] = useState<Group | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat Link Edit State
  const [isEditingChat, setIsEditingChat] = useState(false);
  const [chatForm, setChatForm] = useState({ title: '', url: '' });
  const [savingChat, setSavingChat] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      orgGetGroups().then((all: Group[]) => {
        const found = all.find((g) => g.id === id) || null;
        setGroup(found);
        if (found) {
          setChatForm({ title: found.chatLinkTitle || '', url: found.chatLinkUrl || '' });
        }
      }),
      orgGetCourses().then(setCourses).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [id]);

  const courseName = group?.courseId ? courses.find(c => c.id === group.courseId)?.title || '—' : '—';

  const handleSaveChat = async () => {
    if (!group) return;
    setSavingChat(true);
    try {
      await orgUpdateGroup({
        id: group.id,
        chatLinkTitle: chatForm.title,
        chatLinkUrl: chatForm.url
      });
      setGroup({ ...group, chatLinkTitle: chatForm.title, chatLinkUrl: chatForm.url });
      setIsEditingChat(false);
      toast.success(t('common.saved', 'Сохранено'));
    } catch (e: any) {
      toast.error(e.message || 'Error saving chat link');
    } finally {
      setSavingChat(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!group) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/groups')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/groups')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-16" />
        <div className="px-6 pb-6 pt-4">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{group.name}</h1>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <BookOpen className="w-5 h-5 text-primary-500 mx-auto mb-1" />
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{courseName}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('nav.courses')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <Users className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{group.studentIds?.length || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('nav.students')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
          <Calendar className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{group.createdAt ? new Date(group.createdAt).toLocaleDateString() : '—'}</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('common.created')}</p>
        </div>
      </div>

      {/* Chat Link Editor */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <LinkIcon className="w-4 h-4 text-blue-500" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Чат Группы</h2>
          </div>
          {!isEditingChat && (
            <button 
              onClick={() => setIsEditingChat(true)}
              className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {isEditingChat ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Название (Telegram, WhatsApp)</label>
                <input 
                  type="text" 
                  value={chatForm.title} 
                  onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white outline-none"
                  placeholder="Общий чат группы..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Ссылка</label>
                <input 
                  type="url" 
                  value={chatForm.url} 
                  onChange={e => setChatForm(f => ({ ...f, url: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white outline-none"
                  placeholder="https://t.me/..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => {
                  setChatForm({ title: group.chatLinkTitle || '', url: group.chatLinkUrl || '' });
                  setIsEditingChat(false);
                }}
                disabled={savingChat}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
              <button 
                onClick={handleSaveChat}
                disabled={savingChat}
                className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {savingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {!group.chatLinkUrl ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Чат не указан. Добавьте ссылку для учеников.</p>
            ) : (
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {group.chatLinkTitle || 'Чат Группы'}
                  </p>
                  <a href={group.chatLinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline break-all">
                    {group.chatLinkUrl}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default GroupDetailPage;
