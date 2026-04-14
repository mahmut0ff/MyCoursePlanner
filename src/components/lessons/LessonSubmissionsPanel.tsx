import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiOrgGetHomeworks } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import { ExternalLink, Clock, CheckCircle, FileText, FileVideo, ImageIcon, FileAudio, FileArchive, Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface LessonSubmissionsPanelProps {
  lessonId: string;
  organizationId: string;
}

export const LessonSubmissionsPanel: React.FC<LessonSubmissionsPanelProps> = ({ lessonId, organizationId }) => {
  const navigate = useNavigate();
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
        toast.error('Не удалось загрузить списки работ');
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
        return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider"><CheckCircle className="w-3 h-3" /> Проверено</span>;
      case 'reviewing':
        return <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> На проверке</span>;
      default:
         return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> Ожидает</span>;
    }
  };

  const getAttachmentIcon = (type: string) => {
    if (type === 'video') return <FileVideo className="w-4 h-4" />;
    if (type === 'image') return <ImageIcon className="w-4 h-4" />;
    if (type === 'audio') return <FileAudio className="w-4 h-4" />;
    if (type === 'archive') return <FileArchive className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  if (loading) {
     return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm mt-8 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-4">
        <div>
           <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">Сданные работы <span className="px-2 py-0.5 bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-lg text-sm">{submissions.length}</span></h3>
           <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Отслеживание и статистика выполнения заданий студентами.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Поиск по имени..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white"
            />
          </div>
          <button onClick={() => navigate('/homework')} className="btn-primary shrink-0 flex items-center gap-2 py-2 px-4 rounded-xl text-[13px] font-semibold">
            Проверить <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-3 whitespace-nowrap">Полное Имя</th>
              <th className="px-6 py-3 whitespace-nowrap">Дата загрузки</th>
              <th className="px-6 py-3 whitespace-nowrap">Файлы</th>
              <th className="px-6 py-3 whitespace-nowrap">Статус</th>
              <th className="px-6 py-3 whitespace-nowrap text-right">Оценка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredSubmissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                  {submissions.length === 0 ? 'Ни один студент еще не сдал работу.' : 'Студенты по вашему запросу не найдены.'}
                </td>
              </tr>
            ) : (
              filteredSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900 dark:text-white text-[14px]">{sub.studentName}</div>
                    {sub.content && <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] mt-0.5">{sub.content}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                      {new Date(sub.submittedAt).toLocaleDateString()}
                    </span>
                    <br />
                    <span className="text-[11px] text-slate-400">
                      {new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {sub.attachments && sub.attachments.length > 0 ? (
                      <div className="flex gap-2">
                        {sub.attachments.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noreferrer" title={att.name} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
                            {getAttachmentIcon(att.type)}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-slate-400 italic">Текст</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(sub.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {sub.status === 'graded' && typeof sub.finalScore === 'number' ? (
                       <div className="inline-flex items-end gap-1">
                          <span className="text-lg font-black text-slate-900 dark:text-white">{sub.finalScore}</span>
                          <span className="text-xs font-bold text-slate-400 mb-0.5">/ {sub.maxPoints || 10}</span>
                       </div>
                    ) : (
                      <span className="text-[13px] text-slate-400">—</span>
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
