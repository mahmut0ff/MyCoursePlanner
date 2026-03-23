import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetGroups, orgGetCourses } from '../../lib/api';
import { ArrowLeft, Users, BookOpen, Calendar } from 'lucide-react';
import type { Group, Course } from '../../types';

const GroupDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [group, setGroup] = useState<Group | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      orgGetGroups().then((all: Group[]) => setGroup(all.find((g) => g.id === id) || null)),
      orgGetCourses().then(setCourses).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [id]);

  const courseName = group?.courseId ? courses.find(c => c.id === group.courseId)?.title || '—' : '—';

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!group) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/groups')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/groups')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 h-16" />
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
    </div>
  );
};

export default GroupDetailPage;
