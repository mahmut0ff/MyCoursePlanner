import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiOrgGetHomeworks } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { Clock, CheckCircle, FileText, FileVideo, ImageIcon, FileAudio, FileArchive, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { intlLocale } from '../../lib/locale';

interface LessonSubmissionsPanelProps {
  lessonId: string;
  organizationId: string;
}

export const LessonSubmissionsPanel: React.FC<LessonSubmissionsPanelProps> = ({ lessonId, organizationId }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const data = await apiOrgGetHomeworks(organizationId, lessonId);
        setSubmissions(data || []);
      } catch (err: any) {
        console.error('Failed to fetch submissions', err);
        toast.error(t('homework.panel.loadFailed', 'Не удалось загрузить списки работ'));
      } finally {
        setLoading(false);
      }
    };
    if (organizationId && lessonId) {
      fetchSubmissions();
    }
  }, [lessonId, organizationId]);

  const filteredSubmissions = submissions.filter(sub => 
    sub.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'graded':
        return <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle className="w-3 h-3" /> {t('homework.panel.graded', 'Проверено')}</span>;
      case 'reviewing':
        return <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="w-3 h-3" /> {t('lessons.view.statusReviewing', 'На проверке')}</span>;
      default:
         return <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3" /> {t('homework.panel.pending', 'Ожидает')}</span>;
    }
  };

  const getAttachmentIcon = (type: string) => {
    if (type === 'video') return <FileVideo className="w-3.5 h-3.5" />;
    if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
    if (type === 'audio') return <FileAudio className="w-3.5 h-3.5" />;
    if (type === 'archive') return <FileArchive className="w-3.5 h-3.5" />;
    return <FileText className="w-3.5 h-3.5" />;
  };

  if (loading) {
     return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg mt-4 overflow-hidden">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
           <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">{t('homework.panel.title', 'Сданные работы')} <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{submissions.length}</span></h3>
           <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('homework.panel.desc', 'Отслеживание и статистика выполнения заданий студентами.')}</p>
        </div>
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t('homework.panel.searchByName', 'Поиск по имени...')} 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full min-w-0 pl-8"
            />
          </div>
          <button onClick={() => navigate('/homework')} className="btn-primary shrink-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
            {t('homework.panel.review', 'Проверить')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
              <th className="h-8 px-3 font-medium whitespace-nowrap">{t('homework.panel.colName', 'Полное имя')}</th>
              <th className="h-8 px-3 font-medium whitespace-nowrap">{t('homework.panel.colDate', 'Дата загрузки')}</th>
              <th className="h-8 px-3 font-medium whitespace-nowrap">{t('homework.panel.colFiles', 'Файлы')}</th>
              <th className="h-8 px-3 font-medium whitespace-nowrap">{t('common.status', 'Статус')}</th>
              <th className="h-8 px-3 font-medium whitespace-nowrap text-right">{t('homework.panel.colGrade', 'Оценка')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredSubmissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400 text-sm">
                  {submissions.length === 0 ? t('homework.panel.noneSubmitted', 'Ни один студент ещё не сдал работу.') : t('homework.panel.noMatches', 'Студенты по вашему запросу не найдены.')}
                </td>
              </tr>
            ) : (
              filteredSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">{sub.studentName}</div>
                    {sub.content && <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] mt-0.5">{sub.content}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                      {new Date(sub.submittedAt).toLocaleDateString(intlLocale())}
                    </span>
                    <br />
                    <span className="text-xs tabular-nums text-slate-400">
                      {new Date(sub.submittedAt).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {sub.attachments && sub.attachments.length > 0 ? (
                      <div className="flex gap-1">
                        {sub.attachments.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noreferrer" title={att.name} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors">
                            {getAttachmentIcon(att.type)}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">{t('homework.panel.textOnly', 'Текст')}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {getStatusBadge(sub.status)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {sub.status === 'graded' && typeof sub.finalScore === 'number' ? (
                       <div className="inline-flex items-baseline gap-1 tabular-nums">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{sub.finalScore}</span>
                          <span className="text-xs text-slate-400">/ {sub.maxPoints || 10}</span>
                       </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
