import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getExam, getQuestions, deleteExam } from '../../services/exams.service';
import { createRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import type { Exam, Question } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Edit, Trash2, Play, Clock, Target, HelpCircle } from 'lucide-react';

const ExamViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, role } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    if (id) {
      Promise.all([getExam(id), getQuestions(id)])
        .then(([e, qs]) => { setExam(e); setQuestions(qs); })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm('Delete this exam?')) return;
    await deleteExam(id);
    navigate('/exams');
  };

  const handleStartRoom = async () => {
    if (!exam || !profile) return;
    setStarting(true);
    try {
      const room = await createRoom(exam.id, exam.title, profile.uid, profile.displayName);
      navigate(`/rooms/${room.id}`);
    } catch (e) {
      console.error('Failed to start room:', e);
      toast.error('Failed to start exam room');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!exam) return <div className="text-center py-20"><h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('common.notFound')}</h3></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/exams')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}</button>
        {isStaff && (
          <div className="flex items-center gap-1.5">
            <button onClick={handleStartRoom} disabled={starting} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />{starting ? '...' : t('exams.startRoom')}
            </button>
            <Link to={`/exams/${id}/edit`} className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"><Edit className="w-3 h-3" />{t('common.edit')}</Link>
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
              <div key={q.id} className="border border-slate-100 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-slate-900"><span className="text-primary-600 mr-2">Q{i + 1}.</span>{q.text}</p>
                  <span className="badge-slate text-xs">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                </div>
                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div className="space-y-1 ml-6">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={`text-sm px-2 py-1 rounded ${
                        q.type === 'single_choice'
                          ? opt === q.correctAnswer ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500'
                          : q.correctAnswers.includes(opt) ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500'
                      }`}>
                        {q.type === 'single_choice' ? '○' : '□'} {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 ml-6 italic">Text answer {q.keywords.length > 0 ? `(keywords: ${q.keywords.join(', ')})` : '(manual review)'}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamViewPage;
