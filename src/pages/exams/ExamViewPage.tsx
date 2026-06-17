import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExam, getQuestions, deleteExam, duplicateExam, updateExam } from '../../services/exams.service';
import { createRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetResults, apiGradeAttempt } from '../../lib/api';
import type { Exam, Question, Group, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Edit, Trash2, Play, Clock, Target, HelpCircle, Copy, ImageIcon, Volume2, Mic, X, QrCode, Users, Award, ChevronDown } from 'lucide-react';
import ExamShareModal from '../../components/exams/ExamShareModal';

const ExamViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, role } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
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

  const handleDelete = async () => {
    if (!id || !confirm(t('exams.confirmDelete', 'Удалить этот экзамен?'))) return;
    await deleteExam(id);
    navigate('/exams');
  };

  const handleLaunchRoom = async () => {
    if (!exam || !profile) return;
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!exam) return <div className="text-center py-20"><h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('common.notFound')}</h3></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/exams')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}</button>
        {isStaff && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowStartModal(true)} disabled={starting} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />{starting ? '...' : t('exams.startRoom')}
            </button>
            <button onClick={() => setShowShareModal(true)} className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors" title="QR-код и публичная ссылка для прохождения теста">
              <QrCode className="w-3.5 h-3.5" />QR / Поделиться
            </button>
            <Link to={`/exams/${id}/edit`} className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"><Edit className="w-3 h-3" />{t('common.edit')}</Link>
            <button onClick={handleDuplicate} className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"><Copy className="w-3 h-3" />{t('exams.duplicate')}</button>
            <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1 transition-colors"><Trash2 className="w-3 h-3" />{t('common.delete')}</button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="badge-primary text-[10px]">{exam.subject}</span>
          <span className={`text-[10px] ${exam.status === 'published' ? 'badge-green' : 'badge-yellow'}`}>{exam.status}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{exam.title}</h1>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">{exam.description}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
            <Clock className="w-4 h-4 text-primary-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase">{t('exams.duration')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{exam.durationMinutes} {t('exams.min')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
            <Target className="w-4 h-4 text-primary-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase">{t('exams.passScore')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{exam.passScore}%</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
            <HelpCircle className="w-4 h-4 text-primary-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase">{t('exams.questions')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{questions.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase">{t('common.created')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(exam.createdAt)}</p>
          </div>
        </div>
      </div>

      {isStaff && questions.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('exams.questionPreview')}</h2>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={q.id} className="border border-slate-100 dark:border-slate-700/50 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-slate-900 dark:text-white"><span className="text-primary-600 dark:text-primary-400 mr-2">Q{i + 1}.</span>{q.text}</p>
                  <span className="badge-slate text-xs">{q.points} {t('exams.pts', 'б.')}</span>
                </div>
                
                {/* Media Indicators */}
                {(q.mediaUrl || q.ttsText || q.type === 'speaking') && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {q.mediaUrl && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                        <ImageIcon className="w-3.5 h-3.5" /> Media Attached
                      </span>
                    )}
                    {q.ttsText && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                        <Volume2 className="w-3.5 h-3.5" /> TTS Audio
                      </span>
                    )}
                    {q.type === 'speaking' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        <Mic className="w-3.5 h-3.5" /> Speaking Task
                      </span>
                    )}
                  </div>
                )}
                {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
                  <div className="space-y-1 ml-6">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={`text-sm px-2 py-1 rounded ${
                        q.type === 'multiple_choice'
                          ? opt === q.correctAnswer ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500'
                          : q.correctAnswers.includes(opt) ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500'
                      }`}>
                        {q.type === 'multiple_choice' ? '○' : '□'} {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'short_answer' && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 ml-6 italic">{t('exams.textAnswer', 'Текстовый ответ')} {q.keywords.length > 0 ? `(${t('exams.keywords', 'ключ. слова')}: ${q.keywords.join(', ')})` : `(${t('exams.manualReview', 'ручная проверка')})`}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public test results (from QR / public link) */}
      {isStaff && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Результаты публичного теста ({publicAttempts.length})
            </h2>
            <button onClick={loadPublicAttempts} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Обновить</button>
          </div>

          {publicAttempts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
              Пока никто не прошёл тест по ссылке/QR. Результаты появятся здесь автоматически, как только кто-то его сдаст.
              <br />Полный список лидов с контактами — в разделе «Заявки».
            </p>
          ) : (
            <div className="space-y-2">
              {publicAttempts.map((a) => {
                const isOpen = expandedAttempt === a.id;
                const fb: any = a.aiFeedback;
                return (
                  <div key={a.id} className="border border-slate-100 dark:border-slate-700/60 rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedAttempt(isOpen ? null : a.id)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                        {a.studentName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{a.studentName}</p>
                        <p className="text-[11px] text-slate-400">{a.submittedAt ? formatDate(a.submittedAt) : ''}</p>
                      </div>
                      {fb?.level && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-bold shrink-0">
                          <Award className="w-3 h-3" />{fb.level}
                        </span>
                      )}
                      <span className={`text-sm font-black shrink-0 ${a.percentage >= 80 ? 'text-emerald-500' : a.percentage >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{a.percentage}%</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 bg-slate-50/60 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-700/40 space-y-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Баллы: <b className="text-slate-700 dark:text-slate-200">{a.score} / {a.totalPoints}</b>
                          {fb?.level && <span className="sm:hidden ml-2">· Уровень: <b className="text-indigo-600 dark:text-indigo-400">{fb.level}</b></span>}
                        </div>
                        {fb?.levelDescription && <p className="text-xs text-slate-600 dark:text-slate-300 italic">{fb.levelDescription}</p>}
                        {fb?.summary && (
                          <div>
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mb-0.5">✨ AI-вердикт</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{fb.summary}</p>
                          </div>
                        )}
                        {Array.isArray(fb?.weakTopics) && fb.weakTopics.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-0.5">Слабые темы</p>
                            <ul className="list-disc list-inside">
                              {fb.weakTopics.map((w: string, i: number) => <li key={i} className="text-xs text-slate-600 dark:text-slate-300">{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(fb?.reviewSuggestions) && fb.reviewSuggestions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-sky-500 uppercase tracking-wide mb-0.5">План действий</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {fb.reviewSuggestions.map((w: string, i: number) => <li key={i} className="text-xs text-slate-600 dark:text-slate-300">{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb?.teacherNotes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-100 dark:border-slate-700">"{fb.teacherNotes}"</p>
                        )}

                        {/* Per-question answers + editable points */}
                        {Array.isArray(a.questionResults) && a.questionResults.length > 0 && (
                          <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-700/40">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Ответы и баллы</p>
                            <div className="space-y-2">
                              {a.questionResults.map((qr, qi) => {
                                const val = gradeEdits[a.id]?.[qr.questionId] ?? qr.pointsEarned;
                                const ans = Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : (qr.studentAnswer || '—');
                                return (
                                  <div key={qr.questionId} className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1">{qi + 1}. {qr.questionText}</p>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <input
                                          type="number" min={0} max={qr.pointsPossible}
                                          value={val}
                                          onChange={(e) => setPoint(a.id, qr.questionId, e.target.value, qr.pointsPossible)}
                                          className="w-12 text-center text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-slate-900 dark:text-white"
                                        />
                                        <span className="text-[11px] text-slate-400">/ {qr.pointsPossible}</span>
                                      </div>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1"><b>Ответ:</b> {ans}</p>
                                    {qr.aiComment && <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-0.5 italic">ИИ: {qr.aiComment}</p>}
                                    <div className="flex gap-1.5 mt-1">
                                      {qr.aiGraded && <span className="text-[9px] font-bold uppercase bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 px-1.5 py-0.5 rounded">AI</span>}
                                      {qr.manuallyGraded && <span className="text-[9px] font-bold uppercase bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 px-1.5 py-0.5 rounded">Учитель</span>}
                                      {qr.status === 'pending_review' && <span className="text-[9px] font-bold uppercase bg-amber-50 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded">На проверке</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex justify-end mt-2">
                              <button
                                onClick={() => saveGrades(a)}
                                disabled={savingGrade === a.id || !gradeEdits[a.id]}
                                className="text-xs bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                              >
                                {savingGrade === a.id ? 'Сохранение…' : 'Сохранить баллы'}
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

      {/* Share / QR Modal */}
      {showShareModal && (
        <ExamShareModal
          examId={exam.id}
          examTitle={exam.title}
          published={exam.status === 'published'}
          onPublish={async () => {
            await updateExam(exam.id, { status: 'published' });
            setExam(prev => (prev ? { ...prev, status: 'published' } : prev));
            toast.success('Экзамен опубликован');
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Start Room Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 exam-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Настройка уведомлений</h3>
              <button onClick={() => setShowStartModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Кому отправить Push-уведомление о старте экзамена?</p>
              
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'group' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : ''}`}>
                <input type="radio" name="notify" value="group" checked={notifyOption === 'group'} onChange={() => setNotifyOption('group')} className="mt-0.5" />
                <div>
                  <span className="block font-medium text-slate-900 dark:text-white text-sm">Определенной группе</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Уведомление придет только студентам выбранной группы</span>
                </div>
              </label>

              {notifyOption === 'group' && (
                <div className="ml-7 mt-2">
                  <select 
                    className="input-field py-2 text-sm max-w-[250px]"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                  >
                    <option value="" disabled>-- Выберите группу --</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'none' ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700' : ''}`}>
                <input type="radio" name="notify" value="none" checked={notifyOption === 'none'} onChange={() => setNotifyOption('none')} className="mt-0.5" />
                <div>
                  <span className="block font-medium text-slate-900 dark:text-white text-sm">Не уведомлять никого</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Студенты не получат пуш-сообщения, вы запустите комнату в тихом режиме</span>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${notifyOption === 'all' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : ''}`}>
                <input type="radio" name="notify" value="all" checked={notifyOption === 'all'} onChange={() => setNotifyOption('all')} className="mt-0.5" />
                <div>
                  <span className="block font-medium text-red-700 dark:text-red-400 text-sm">Всем студентам организации</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Внимание! Уведомление придет всем студентам всей школы</span>
                </div>
              </label>

            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowStartModal(false)}
                className="btn-ghost px-4 py-2 text-sm"
              >
                Отмена
              </button>
              <button 
                onClick={handleLaunchRoom}
                disabled={starting || (notifyOption === 'group' && !selectedGroupId)}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl px-5 py-2 text-sm font-semibold flex items-center gap-2"
              >
                <Play className="w-4 h-4" /> {starting ? 'Запуск...' : 'Создать комнату'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamViewPage;
