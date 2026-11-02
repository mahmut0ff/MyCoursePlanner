import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiStudentGetMyHomeworks, apiAIGradeHomework } from '../../lib/api';
import type { HomeworkSubmission } from '../../types';
import {
  Clock, CheckCircle2, AlertCircle, BookOpen,
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
    border: 'border-slate-200 dark:border-slate-700',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-400'
  },
  reviewing: {
    label: 'На проверке',
    icon: AlertCircle,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/10',
    border: 'border-slate-200 dark:border-slate-700',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-400'
  },
  graded: {
    label: 'Оценено',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/10',
    border: 'border-slate-200 dark:border-slate-700',
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
        {types.has('video') && <FileVideo className="w-3 h-3 text-primary-500" />}
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
        <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('common.loading', 'Загрузка...')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('student.homework.title', 'Мои домашние задания')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('student.homework.subtitle', 'Все сданные работы и их статусы')}
        </p>
      </div>

      {/* Сдача идёт через бота — на этой странице работы только просматривают */}
      <div className="mb-4">
        <HomeworkTelegramNotice />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {([
          { key: 'all' as const, label: t('common.all', 'Все') },
          { key: 'pending' as const, label: t('student.homework.filter.pending', 'Ожидают') },
          { key: 'reviewing' as const, label: t('student.homework.status.reviewing', 'На проверке') },
          { key: 'graded' as const, label: t('student.homework.status.graded', 'Оценено') },
        ]).map(ft => (
          <button
            key={ft.key}
            onClick={() => setFilter(ft.key)}
            className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-sm transition-colors whitespace-nowrap ${
              filter === ft.key
                ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {ft.label}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded text-[11px] font-medium tabular-nums ${
              filter === ft.key
                ? 'bg-white/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {counts[ft.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="text-slate-400 flex items-center justify-center mb-2">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            {filter === 'all' ? t('student.homework.emptyAll', 'Нет сданных работ') : t('student.homework.emptyStatus', 'Нет работ со статусом «{{status}}»', { status: statusLabel(filter as keyof typeof statusConfig) })}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            {filter === 'all' 
              ? t('student.homework.emptyAllHint', 'Когда преподаватель задаст домашнее задание, отправьте работу боту в Telegram — она появится здесь.')
              : t('student.homework.emptyFilterHint', 'Попробуйте выбрать другой фильтр для просмотра.')
            }
          </p>
          {filter === 'all' && (
            <Link
              to="/courses"
              className="mt-3 btn-primary inline-flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" /> {t('student.homework.toCourses', 'Перейти к курсам')}
            </Link>
          )}
        </div>
      )}

      {/* Submissions List */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(sub => {
            const cfg = statusConfig[sub.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const canSelfCheck = !!(sub.content && sub.content.trim()) ||
              !!sub.attachments?.some(a => a.type === 'image' || (a.type === 'document' && /\.pdf($|\?)/i.test(`${a.url || ''} ${a.name || ''}`)));
            return (
              <Link
                key={sub.id}
                to={`/lessons/${sub.lessonId}`}
                className={`group block bg-white dark:bg-slate-900 rounded-lg border ${cfg.border} p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60`}
              >
                <div className="flex items-start gap-3">
                  {/* Status indicator */}
                  <div className={`w-7 h-7 flex items-center justify-center rounded-md ${cfg.bg} shrink-0`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                          {sub.lessonTitle}
                        </h3>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 tabular-nums">
                            <Clock className="w-3 h-3" />
                            {new Date(sub.submittedAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {getAttachmentIcons(sub)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Grade if graded */}
                        {sub.status === 'graded' && typeof sub.finalScore === 'number' && (
                          <div className="inline-flex items-baseline gap-0.5 h-5 px-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{sub.finalScore}</span>
                            <span className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 tabular-nums">/{sub.maxPoints || 10}</span>
                          </div>
                        )}

                        {/* Status badge */}
                        <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${cfg.badge}`}>
                          {statusLabel(statusConfig[sub.status] ? sub.status as keyof typeof statusConfig : 'pending')}
                        </span>
                      </div>
                    </div>

                    {/* Preview of submission content */}
                    {sub.content && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                        {sub.content}
                      </p>
                    )}

                    {/* Teacher feedback */}
                    {sub.status === 'graded' && sub.teacherFeedback && (
                      <div className="mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">{t('student.homework.teacherFeedback', 'Отзыв преподавателя')}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 italic line-clamp-2">"{sub.teacherFeedback}"</p>
                      </div>
                    )}

                    {/* AI analysis (read-only) */}
                    {sub.aiAnalysis && (
                      ((sub.aiAnalysis.strengths?.length || 0) > 0 ||
                       (sub.aiAnalysis.weaknesses?.length || 0) > 0 ||
                       (sub.aiAnalysis.grammarIssues?.length || 0) > 0) && (
                      <div className="mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md space-y-1.5">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-primary-600 dark:text-primary-400" /> {t('student.homework.aiReview', 'Разбор ИИ')}
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
                          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{t('student.homework.issuesCount', 'Замечаний и правок: {{n}}', { n: sub.aiAnalysis.grammarIssues.length })}</p>
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
                        className="mt-2 btn-secondary inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {checkingId === sub.id
                          ? <><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300 rounded-full animate-spin" /> {t('student.homework.checking', 'Проверяю…')}</>
                          : <><Sparkles className="w-3.5 h-3.5" /> {sub.aiAnalysis ? t('student.homework.recheck', 'Перепроверить работу') : t('student.homework.check', 'Проверить работу')}</>}
                      </button>
                    )}
                  </div>

                  {/* Link arrow */}
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors shrink-0 mt-1" />
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
