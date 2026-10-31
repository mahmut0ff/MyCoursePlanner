import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiStudentGetMyHomeworks, apiAIGradeHomework } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import {
  ClipboardCheck, Clock, CheckCircle2, AlertCircle, BookOpen,
  FileVideo, ImageIcon, FileAudio, FileArchive, FileText, Inbox, ExternalLink, Sparkles
} from 'lucide-react';
import { HomeworkTelegramNotice } from '../../components/lessons/HomeworkTelegramNotice';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { intlLocale } from '../../lib/locale';

const statusConfig = {
  pending: {
    label: 'Ожидает проверки',
    icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/10',
    border: 'border-amber-200/60 dark:border-amber-700/40',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-400'
  },
  reviewing: {
    label: 'На проверке',
    icon: AlertCircle,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/10',
    border: 'border-blue-200/60 dark:border-blue-700/40',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-400'
  },
  graded: {
    label: 'Оценено',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/10',
    border: 'border-emerald-200/60 dark:border-emerald-700/40',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-400'
  }
};

type FilterStatus = 'all' | 'pending' | 'reviewing' | 'graded';

const StudentHomeworkPage: React.FC = () => {
  const { t } = useTranslation();
  const statusLabel = (key: keyof typeof statusConfig) => t(`student.homework.status.${key}`, statusConfig[key].label);
  const { organizationId } = useAuth();
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const handleSelfCheck = async (sub: HomeworkSubmission, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (checkingId) return;
    setCheckingId(sub.id);
    try {
      const analysis = await apiAIGradeHomework(sub.id);
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, aiAnalysis: analysis } : s));
      toast.success(t('student.homework.aiChecked', 'Работа проверена ИИ'), { icon: '✨' });
    } catch (err: any) {
      toast.error(err?.message || t('student.homework.checkFailed', 'Не удалось проверить работу'));
    } finally {
      setCheckingId(null);
    }
  };

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    apiStudentGetMyHomeworks()
      .then((data) => {
        if (Array.isArray(data)) {
          setSubmissions(data);
        }
      })
      .catch(() => toast.error(t('student.homework.loadFailed', 'Не удалось загрузить домашние задания')))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const filtered = filter === 'all' ? submissions : submissions.filter(s => s.status === filter);
  
  const counts = {
    all: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    reviewing: submissions.filter(s => s.status === 'reviewing').length,
    graded: submissions.filter(s => s.status === 'graded').length,
  };

  const getAttachmentIcons = (sub: HomeworkSubmission) => {
    if (!sub.attachments || sub.attachments.length === 0) return null;
    const types = new Set(sub.attachments.map(a => a.type));
    return (
      <div className="flex items-center gap-1.5">
        {types.has('image') && <ImageIcon className="w-3 h-3 text-emerald-500" />}
        {types.has('video') && <FileVideo className="w-3 h-3 text-indigo-500" />}
        {types.has('audio') && <FileAudio className="w-3 h-3 text-amber-500" />}
        {types.has('archive') && <FileArchive className="w-3 h-3 text-red-500" />}
        {types.has('document') && <FileText className="w-3 h-3 text-blue-500" />}
        <span className="text-[10px] text-slate-400 font-medium">{sub.attachments.length}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-accent-teal border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">{t('common.loading', 'Загрузка...')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          {t('student.homework.title', 'Мои домашние задания')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 ml-[52px]">
          {t('student.homework.subtitle', 'Все сданные работы и их статусы')}
        </p>
      </div>

      {/* Сдача идёт через бота — на этой странице работы только просматривают */}
      <div className="mb-6">
        <HomeworkTelegramNotice />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {([
          { key: 'all' as const, label: t('common.all', 'Все') },
          { key: 'pending' as const, label: t('student.homework.filter.pending', 'Ожидают') },
          { key: 'reviewing' as const, label: t('student.homework.status.reviewing', 'На проверке') },
          { key: 'graded' as const, label: t('student.homework.status.graded', 'Оценено') },
        ]).map(ft => (
          <button
            key={ft.key}
            onClick={() => setFilter(ft.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 whitespace-nowrap ${
              filter === ft.key
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/10 dark:shadow-white/10'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/60'
            }`}
          >
            {ft.label}
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-lg text-[10px] font-bold ${
              filter === ft.key
                ? 'bg-white/20 dark:bg-slate-900/30 text-white dark:text-slate-900'
                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400'
            }`}>
              {counts[ft.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 rounded-2xl flex items-center justify-center mb-4">
            <Inbox className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
            {filter === 'all' ? t('student.homework.emptyAll', 'Нет сданных работ') : t('student.homework.emptyStatus', 'Нет работ со статусом «{{status}}»', { status: statusLabel(filter as keyof typeof statusConfig) })}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            {filter === 'all' 
              ? t('student.homework.emptyAllHint', 'Когда преподаватель задаст домашнее задание, отправьте работу боту в Telegram — она появится здесь.')
              : t('student.homework.emptyFilterHint', 'Попробуйте выбрать другой фильтр для просмотра.')
            }
          </p>
          {filter === 'all' && (
            <Link
              to="/courses"
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-accent-teal text-white rounded-xl font-semibold text-sm shadow-lg shadow-accent-teal/20 hover:shadow-xl hover:shadow-accent-teal/30 hover:-translate-y-0.5 transition-all"
            >
              <BookOpen className="w-4 h-4" /> {t('student.homework.toCourses', 'Перейти к курсам')}
            </Link>
          )}
        </div>
      )}

      {/* Submissions List */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(sub => {
            const cfg = statusConfig[sub.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const canSelfCheck = !!(sub.content && sub.content.trim()) ||
              !!sub.attachments?.some(a => a.type === 'image' || (a.type === 'document' && /\.pdf($|\?)/i.test(`${a.url || ''} ${a.name || ''}`)));
            return (
              <Link
                key={sub.id}
                to={`/lessons/${sub.lessonId}`}
                className={`group block bg-white dark:bg-slate-900 rounded-2xl border ${cfg.border} p-5 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 hover:-translate-y-0.5 hover:border-accent-teal/50`}
              >
                <div className="flex items-start gap-4">
                  {/* Status indicator */}
                  <div className={`p-2.5 rounded-xl ${cfg.bg} shrink-0 mt-0.5`}>
                    <StatusIcon className={`w-5 h-5 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-[15px] text-slate-900 dark:text-white truncate group-hover:text-accent-teal transition-colors">
                          {sub.lessonTitle}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(sub.submittedAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {getAttachmentIcons(sub)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Grade if graded */}
                        {sub.status === 'graded' && typeof sub.finalScore === 'number' && (
                          <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 px-3 py-1.5 rounded-xl">
                            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{sub.finalScore}</span>
                            <span className="text-[11px] text-emerald-500/70 font-medium">/{sub.maxPoints || 10}</span>
                          </div>
                        )}

                        {/* Status badge */}
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-bold ${cfg.badge}`}>
                          {statusLabel(statusConfig[sub.status] ? sub.status as keyof typeof statusConfig : 'pending')}
                        </span>
                      </div>
                    </div>

                    {/* Preview of submission content */}
                    {sub.content && (
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {sub.content}
                      </p>
                    )}

                    {/* Teacher feedback */}
                    {sub.status === 'graded' && sub.teacherFeedback && (
                      <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200/50 dark:border-indigo-700/30 rounded-xl">
                        <p className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1">{t('student.homework.teacherFeedback', 'Отзыв преподавателя')}</p>
                        <p className="text-[13px] text-indigo-800 dark:text-indigo-200 italic line-clamp-2">"{sub.teacherFeedback}"</p>
                      </div>
                    )}

                    {/* AI analysis (read-only) */}
                    {sub.aiAnalysis && (
                      ((sub.aiAnalysis.strengths?.length || 0) > 0 ||
                       (sub.aiAnalysis.weaknesses?.length || 0) > 0 ||
                       (sub.aiAnalysis.grammarIssues?.length || 0) > 0) && (
                      <div className="mt-3 p-3 bg-violet-50 dark:bg-violet-900/10 border border-violet-200/50 dark:border-violet-700/30 rounded-xl space-y-2">
                        <p className="text-[11px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> {t('student.homework.aiReview', 'Разбор ИИ')}
                        </p>
                        {sub.aiAnalysis.strengths && sub.aiAnalysis.strengths.length > 0 && (
                          <ul className="space-y-1">
                            {sub.aiAnalysis.strengths.map((s, i) => (
                              <li key={`s${i}`} className="text-[12px] text-slate-600 dark:text-slate-300 flex gap-1.5"><span className="text-emerald-500 font-bold shrink-0">+</span>{s}</li>
                            ))}
                          </ul>
                        )}
                        {sub.aiAnalysis.weaknesses && sub.aiAnalysis.weaknesses.length > 0 && (
                          <ul className="space-y-1">
                            {sub.aiAnalysis.weaknesses.map((s, i) => (
                              <li key={`w${i}`} className="text-[12px] text-slate-600 dark:text-slate-300 flex gap-1.5"><span className="text-amber-500 font-bold shrink-0">−</span>{s}</li>
                            ))}
                          </ul>
                        )}
                        {sub.aiAnalysis.grammarIssues && sub.aiAnalysis.grammarIssues.length > 0 && (
                          <p className="text-[11.5px] text-violet-700 dark:text-violet-300 font-medium">{t('student.homework.issuesCount', 'Замечаний и правок: {{n}}', { n: sub.aiAnalysis.grammarIssues.length })}</p>
                        )}
                      </div>
                      )
                    )}
                    {/* Self-check button (text and/or photo/PDF) */}
                    {canSelfCheck && (
                      <button
                        type="button"
                        onClick={(e) => handleSelfCheck(sub, e)}
                        disabled={checkingId === sub.id}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-60"
                      >
                        {checkingId === sub.id
                          ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('student.homework.checking', 'Проверяю…')}</>
                          : <><Sparkles className="w-3.5 h-3.5" /> {sub.aiAnalysis ? t('student.homework.recheck', 'Перепроверить работу') : t('student.homework.check', 'Проверить работу')}</>}
                      </button>
                    )}
                  </div>

                  {/* Link arrow */}
                  <ExternalLink className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-accent-teal transition-colors shrink-0 mt-1.5" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentHomeworkPage;
