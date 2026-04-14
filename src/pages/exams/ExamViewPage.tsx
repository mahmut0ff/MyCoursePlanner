import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExam, getQuestions, deleteExam, duplicateExam } from '../../services/exams.service';
import { createRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups } from '../../lib/api';
import type { Exam, Question, Group } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Edit, Trash2, Play, Clock, Target, HelpCircle, Copy, ImageIcon, Volume2, Mic, X, Link2 } from 'lucide-react';

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
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

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

  const handleCopyPublicLink = () => {
    if (!exam) return;
    const url = `${window.location.origin}/test/${exam.id}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Публичная ссылка скопирована. Ученики могут пройти тест как гости без регистрации.'))
      .catch(() => toast.error('Не удалось скопировать ссылку'));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
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
            <button onClick={handleCopyPublicLink} disabled={exam.status !== 'published'} className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50" title={exam.status !== 'published' ? 'Экзамен должен быть опубликован' : 'Публичная ссылка-тест для сбора лидов'}>
              <Link2 className="w-3.5 h-3.5" />Публичная ссылка
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
