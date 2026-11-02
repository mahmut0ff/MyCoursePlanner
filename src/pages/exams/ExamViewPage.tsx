import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExam, getQuestions, deleteExam, duplicateExam, updateExam } from '../../services/exams.service';
import { firstExamIssue } from '../../lib/examValidation';
import { usePermissions } from '../../contexts/PermissionsContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { createRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetResults, apiGradeAttempt } from '../../lib/api';
import type { Exam, Question, Group, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Edit, Trash2, Play, Clock, Target, HelpCircle, Copy, ImageIcon, Volume2, Mic, X, QrCode, Users, Award, ChevronDown, KeyRound } from 'lucide-react';
import GroupAccessModal from '../../components/students/GroupAccessModal';
import ExamShareModal from '../../components/exams/ExamShareModal';

const ExamViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, role } = useAuth();
  // Уведомить всю организацию или любую группу — администрация; преподаватель — только свои группы.
  const orgWideNotify = role === 'admin' || role === 'manager' || role === 'super_admin';
  // Подсказка про «Заявки» — только тем, кому этот раздел открыт.
  const { canRead } = usePermissions();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // Раздать логины прямо перед стартом: у части учеников входа ещё нет,
  // а без него они не зайдут в комнату.
  const [showGroupAccess, setShowGroupAccess] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [notifyOption, setNotifyOption] = useState<'all' | 'group' | 'none'>('none');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [publicAttempts, setPublicAttempts] = useState<ExamAttempt[]>([]);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [gradeEdits, setGradeEdits] = useState<Record<string, Record<string, number>>>({});
  const [savingGrade, setSavingGrade] = useState<string | null>(null);
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

  const setPoint = (attemptId: string, questionId: string, value: string, max: number) => {
    const v = Math.max(0, Math.min(Number(value) || 0, max));
    setGradeEdits(prev => ({ ...prev, [attemptId]: { ...(prev[attemptId] || {}), [questionId]: v } }));
  };

  const saveGrades = async (attempt: ExamAttempt) => {
    const edits = gradeEdits[attempt.id] || {};
    const grades = (attempt.questionResults || []).map(qr => ({
      questionId: qr.questionId,
      pointsEarned: edits[qr.questionId] ?? qr.pointsEarned,
    }));
    setSavingGrade(attempt.id);
    try {
      await apiGradeAttempt(attempt.id, grades);
      toast.success(t('exams.gradesSaved', 'Баллы сохранены'));
      setGradeEdits(prev => { const n = { ...prev }; delete n[attempt.id]; return n; });
      loadPublicAttempts();
    } catch {
      toast.error(t('exams.gradesSaveFailed', 'Не удалось сохранить баллы'));
    } finally {
      setSavingGrade(null);
    }
  };

  const loadPublicAttempts = React.useCallback(() => {
    if (!id) return;
    orgGetResults({ examId: id })
      .then((res: ExamAttempt[]) => setPublicAttempts((res || []).filter(a => a.roomId === 'public')))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (showStartModal && groups.length === 0) {
      orgGetGroups().then(setGroups).catch(() => {});
    }
  }, [showStartModal, groups.length]);

  useEffect(() => {
    if (id) {
      Promise.all([getExam(id), getQuestions(id)])
        .then(([e, qs]) => { setExam(e); setQuestions(qs); })
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    if (isStaff) loadPublicAttempts();
  }, [isStaff, loadPublicAttempts]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const handleDelete = async () => {
    if (!id) return;
    await deleteExam(id);
    toast.success(t('exams.deleted', 'Экзамен удалён'));
    navigate('/exams');
  };

  const handleLaunchRoom = async () => {
    if (!exam || !profile) return;
    const issue = firstExamIssue(questions);
    if (issue) {
      toast.error(t(`exams.validation.${issue.issue}`, { n: issue.n }));
      setShowStartModal(false);
      return;
    }
    setStarting(true);
    try {
      const room = await createRoom(exam.id, exam.title, profile.uid, profile.displayName, notifyOption, notifyOption === 'group' ? selectedGroupId : undefined);
      navigate(`/rooms/${room.id}`);
    } catch (e) {
      console.error('Failed to start room:', e);
      toast.error(t('exams.startFailed', 'Не удалось запустить комнату'));
    } finally {
      setStarting(false);
      setShowStartModal(false);
    }
  };

  const handleDuplicate = async () => {
    if (!id) return;
    try {
      const newId = await duplicateExam(id);
      toast.success(t('exams.duplicated'));
      navigate(`/exams/${newId}`);
    } catch { toast.error(t('exams.duplicateFailed')); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!exam) return <div className="text-center py-20"><h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('common.notFound')}</h3></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/exams')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}</button>
        {isStaff && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowStartModal(true)} disabled={starting} className="btn-primary inline-flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" />{starting ? '...' : t('exams.startRoom')}
            </button>
            <button onClick={() => setShowShareModal(true)} className="btn-secondary inline-flex items-center gap-1.5" title={t('exams.shareHint', 'QR-код и публичная ссылка для прохождения теста')}>
              <QrCode className="w-3.5 h-3.5" />{t('exams.shareBtn', 'QR / Поделиться')}
            </button>
            <Link to={`/exams/${id}/edit`} className="btn-secondary inline-flex items-center gap-1.5"><Edit className="w-3.5 h-3.5" />{t('common.edit')}</Link>
            <button onClick={handleDuplicate} className="btn-secondary inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />{t('exams.duplicate')}</button>
            <button onClick={() => setConfirmingDelete(true)} className="btn-ghost inline-flex items-center gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400"><Trash2 className="w-3.5 h-3.5" />{t('common.delete')}</button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="badge-primary">{exam.subject}</span>
          <span className={`${exam.status === 'published' ? 'badge-green' : 'badge-yellow'}`}>{exam.status === 'published' ? t('common.published') : exam.status === 'archived' ? t('common.archived', 'Архив') : t('common.draft')}</span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{exam.title}</h1>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">{exam.description}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <Clock className="w-3.5 h-3.5 text-slate-400 mb-1" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('exams.duration')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{exam.durationMinutes} {t('exams.min')}</p>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <Target className="w-3.5 h-3.5 text-slate-400 mb-1" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('exams.passScore')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{exam.passScore}%</p>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 mb-1" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('exams.questions')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{questions.length}</p>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('common.created')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{formatDate(exam.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Вопросы и результаты публичного теста — рядом на широком экране */}
      <div className="grid gap-4 xl:grid-cols-2 items-start">
      {isStaff && questions.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 xl:only:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('exams.questionPreview')}</h2>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100"><span className="text-slate-400 dark:text-slate-500 tabular-nums mr-2">Q{i + 1}.</span>{q.text}</p>
                  <span className="badge-slate text-xs">{q.points} {t('exams.pts', 'б.')}</span>
                </div>
                
                {/* Media Indicators */}
                {(q.mediaUrl || q.ttsText || q.type === 'speaking') && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {q.mediaUrl && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <ImageIcon className="w-3 h-3" /> {t('exams.mediaAttached', 'Медиа прикреплено')}
                      </span>
                    )}
                    {q.ttsText && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Volume2 className="w-3 h-3" /> {t('exams.ttsAudio', 'Озвучка (TTS)')}
                      </span>
                    )}
                    {q.type === 'speaking' && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <Mic className="w-3 h-3" /> {t('exams.speakingTask', 'Устное задание')}
                      </span>
                    )}
                  </div>
                )}
                {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
                  <div className="space-y-1 ml-6">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={`text-sm px-2 py-1 rounded ${
                        q.type === 'multiple_choice'
                          ? opt === q.correctAnswer ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium' : 'text-slate-600 dark:text-slate-400'
                          : q.correctAnswers.includes(opt) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {q.type === 'multiple_choice' ? '○' : '□'} {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'short_answer' && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 ml-6 italic">{t('exams.textAnswer', 'Текстовый ответ')} {q.keywords.length > 0 ? `(${t('exams.keywordsShort', 'ключ. слова')}: ${q.keywords.join(', ')})` : `(${t('exams.manualReview', 'ручная проверка')})`}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public test results (from QR / public link) */}
      {isStaff && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 xl:only:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              {t('exams.publicResults', 'Результаты публичного теста ({{count}})', { count: publicAttempts.length })}
            </h2>
            <button onClick={loadPublicAttempts} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">{t('common.refresh', 'Обновить')}</button>
          </div>

          {publicAttempts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
              {t('exams.publicResultsEmpty', 'Пока никто не прошёл тест по ссылке/QR. Результаты появятся здесь автоматически, как только кто-то его сдаст.')}
              {canRead('leads') && <><br />{t('exams.publicResultsLeadsHint', 'Полный список лидов с контактами — в разделе «Заявки».')}</>}
            </p>
          ) : (
            <div className="space-y-2">
              {publicAttempts.map((a) => {
                const isOpen = expandedAttempt === a.id;
                const fb: any = a.aiFeedback;
                return (
                  <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedAttempt(isOpen ? null : a.id)} className="w-full flex items-center gap-2 min-h-[40px] px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center shrink-0">
                        {a.studentName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{a.studentName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{a.submittedAt ? formatDate(a.submittedAt) : ''}</p>
                      </div>
                      {fb?.level && (
                        <span className="hidden sm:inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 shrink-0">
                          <Award className="w-3 h-3" />{fb.level}
                        </span>
                      )}
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${a.percentage >= 80 ? 'text-emerald-600 dark:text-emerald-400' : a.percentage >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{a.percentage}%</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {t('exams.pointsLabel', 'Баллы')}: <b className="text-slate-700 dark:text-slate-200">{a.score} / {a.totalPoints}</b>
                          {fb?.level && <span className="sm:hidden ml-2">· {t('exams.levelLabel', 'Уровень')}: <b className="text-slate-900 dark:text-slate-100">{fb.level}</b></span>}
                        </div>
                        {fb?.levelDescription && <p className="text-xs text-slate-600 dark:text-slate-300 italic">{fb.levelDescription}</p>}
                        {fb?.summary && (
                          <div>
                            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-0.5">✨ {t('exams.aiVerdict', 'AI-вердикт')}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{fb.summary}</p>
                          </div>
                        )}
                        {Array.isArray(fb?.weakTopics) && fb.weakTopics.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-0.5">{t('exams.weakTopics', 'Слабые темы')}</p>
                            <ul className="list-disc list-inside">
                              {fb.weakTopics.map((w: string, i: number) => <li key={i} className="text-xs text-slate-600 dark:text-slate-300">{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(fb?.reviewSuggestions) && fb.reviewSuggestions.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5">{t('exams.actionPlan', 'План действий')}</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {fb.reviewSuggestions.map((w: string, i: number) => <li key={i} className="text-xs text-slate-600 dark:text-slate-300">{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb?.teacherNotes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-800 rounded-md p-2 border border-slate-200 dark:border-slate-700">"{fb.teacherNotes}"</p>
                        )}

                        {/* Per-question answers + editable points */}
                        {Array.isArray(a.questionResults) && a.questionResults.length > 0 && (
                          <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('exams.answersAndPoints', 'Ответы и баллы')}</p>
                            <div className="space-y-2">
                              {a.questionResults.map((qr, qi) => {
                                const val = gradeEdits[a.id]?.[qr.questionId] ?? qr.pointsEarned;
                                const ans = Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : (qr.studentAnswer || '—');
                                return (
                                  <div key={qr.questionId} className="bg-white dark:bg-slate-800 rounded-md p-2.5 border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1">{qi + 1}. {qr.questionText}</p>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <input
                                          type="number" min={0} max={qr.pointsPossible}
                                          value={val}
                                          onChange={(e) => setPoint(a.id, qr.questionId, e.target.value, qr.pointsPossible)}
                                          className="w-12 h-6 text-center text-xs font-medium tabular-nums bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                        />
                                        <span className="text-xs text-slate-400 tabular-nums">/ {qr.pointsPossible}</span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1"><b>{t('exams.answerLabel', 'Ответ')}:</b> {ans}</p>
                                    {qr.aiComment && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5 italic">{t('exams.aiShort', 'ИИ')}: {qr.aiComment}</p>}
                                    <div className="flex gap-1.5 mt-1">
                                      {qr.aiGraded && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300">AI</span>}
                                      {qr.manuallyGraded && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t('exams.gradedByTeacher', 'Учитель')}</span>}
                                      {qr.status === 'pending_review' && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('exams.pendingReview', 'На проверке')}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex justify-end mt-2">
                              <button
                                onClick={() => saveGrades(a)}
                                disabled={savingGrade === a.id || !gradeEdits[a.id]}
                                className="btn-primary"
                              >
                                {savingGrade === a.id ? t('common.saving', 'Сохранение...') : t('exams.saveGrades', 'Сохранить баллы')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Share / QR Modal */}
      {showShareModal && (
        <ExamShareModal
          examId={exam.id}
          examTitle={exam.title}
          published={exam.status === 'published'}
          acceptingResponses={exam.acceptingResponses}
          onPublish={async () => {
            await updateExam(exam.id, { status: 'published' });
            setExam(prev => (prev ? { ...prev, status: 'published' } : prev));
            toast.success(t('exams.publishedToast', 'Экзамен опубликован'));
          }}
          onToggleResponses={async (next) => {
            await updateExam(exam.id, { acceptingResponses: next });
            setExam(prev => (prev ? { ...prev, acceptingResponses: next } : prev));
            toast.success(next ? t('exams.responsesOpened', 'Приём ответов открыт') : t('exams.responsesClosed', 'Приём ответов закрыт'));
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Start Room Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-[480px] shadow-pop overflow-hidden border border-slate-200 dark:border-slate-700 exam-slide-up">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('exams.notifySetupTitle', 'Настройка уведомлений')}</h3>
              <button onClick={() => setShowStartModal(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="px-4 py-2 space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('exams.notifyWho', 'Кому отправить Push-уведомление о старте экзамена?')}</p>
              
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'group' ? 'bg-primary-50 border-primary-300 dark:bg-primary-950 dark:border-primary-800' : ''}`}>
                <input type="radio" name="notify" value="group" checked={notifyOption === 'group'} onChange={() => setNotifyOption('group')} className="mt-0.5 w-3.5 h-3.5 accent-primary-600" />
                <div>
                  <span className="block font-medium text-slate-900 dark:text-white text-sm">{t('exams.notifyGroup', 'Определенной группе')}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t('exams.notifyGroupHint', 'Уведомление придет только студентам выбранной группы')}</span>
                </div>
              </label>

              {notifyOption === 'group' && (
                <div className="ml-7 mt-2">
                  <select 
                    className="input max-w-[250px]"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                  >
                    <option value="" disabled>{t('exams.selectGroupOption', '-- Выберите группу --')}</option>
                    {groups.filter(g => orgWideNotify || (g.teacherIds || []).includes(profile?.uid || '')).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {/* Без логина ученик в комнату не войдёт — выдать доступы можно
                      здесь же, не уходя с экрана запуска. */}
                  {selectedGroupId && (
                    <button
                      type="button"
                      onClick={() => setShowGroupAccess(true)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {t('exams.groupLogins', 'Логины и пароли для этой группы')}
                    </button>
                  )}
                </div>
              )}

              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'none' ? 'bg-primary-50 border-primary-300 dark:bg-primary-950 dark:border-primary-800' : ''}`}>
                <input type="radio" name="notify" value="none" checked={notifyOption === 'none'} onChange={() => setNotifyOption('none')} className="mt-0.5 w-3.5 h-3.5 accent-primary-600" />
                <div>
                  <span className="block font-medium text-slate-900 dark:text-white text-sm">{t('exams.notifyNone', 'Не уведомлять никого')}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t('exams.notifyNoneHint', 'Студенты не получат пуш-сообщения, вы запустите комнату в тихом режиме')}</span>
                </div>
              </label>

              {/* «Всем студентам организации» — только администрации (сервер: api-rooms). */}
              {orgWideNotify && <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'all' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : ''}`}>
                <input type="radio" name="notify" value="all" checked={notifyOption === 'all'} onChange={() => setNotifyOption('all')} className="mt-0.5 w-3.5 h-3.5 accent-primary-600" />
                <div>
                  <span className="block font-medium text-red-700 dark:text-red-400 text-sm">{t('exams.notifyAll', 'Всем студентам организации')}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t('exams.notifyAllHint', 'Внимание! Уведомление придет всем студентам всей школы')}</span>
                </div>
              </label>}

            </div>

            <div className="px-4 pt-2 pb-4 flex items-center justify-end gap-2">
              <button 
                onClick={() => setShowStartModal(false)}
                className="btn-ghost"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button 
                onClick={handleLaunchRoom}
                disabled={starting || (notifyOption === 'group' && !selectedGroupId)}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> {starting ? t('exams.launching', 'Запуск...') : t('exams.createRoom', 'Создать комнату')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupAccess && selectedGroupId && (
        <GroupAccessModal
          groupId={selectedGroupId}
          groupName={groups.find(g => g.id === selectedGroupId)?.name || ''}
          onClose={() => setShowGroupAccess(false)}
        />
      )}
      <ConfirmDialog
        open={confirmingDelete}
        title={t('exams.confirmDelete', 'Удалить этот экзамен?')}
        message={exam?.title || ''}
        confirmLabel={t('common.delete', 'Удалить')}
        danger
        onConfirm={() => { setConfirmingDelete(false); void handleDelete(); }}
        onClose={() => setConfirmingDelete(false)}
      />
    </div>
  );
};

export default ExamViewPage;
