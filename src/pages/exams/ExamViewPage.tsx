import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getExam, getQuestions, deleteExam } from '../../services/exams.service';
import { createRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import type { Exam, Question } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Edit, Trash2, Play, Clock, Target, HelpCircle } from 'lucide-react';

const ExamViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      alert('Failed to start exam room');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!exam) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700">Exam not found</h3></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/exams')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
        {isStaff && (
          <div className="flex items-center gap-2">
            <button onClick={handleStartRoom} disabled={starting} className="btn-primary flex items-center gap-2">
              <Play className="w-4 h-4" />{starting ? 'Starting...' : 'Start Exam Room'}
            </button>
            <Link to={`/exams/${id}/edit`} className="btn-secondary flex items-center gap-2"><Edit className="w-4 h-4" />Edit</Link>
            <button onClick={handleDelete} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete</button>
          </div>
        )}
      </div>

      <div className="card p-8 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-primary">{exam.subject}</span>
          <span className={exam.status === 'published' ? 'badge-green' : 'badge-yellow'}>{exam.status}</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{exam.title}</h1>
        <p className="text-slate-600 mb-6">{exam.description}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <Clock className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-sm text-slate-500">Duration</p>
            <p className="font-semibold text-slate-900">{exam.durationMinutes} min</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <Target className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-sm text-slate-500">Pass Score</p>
            <p className="font-semibold text-slate-900">{exam.passScore}%</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <HelpCircle className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-sm text-slate-500">Questions</p>
            <p className="font-semibold text-slate-900">{questions.length}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-500 mt-1">Created</p>
            <p className="font-semibold text-slate-900 text-sm">{formatDate(exam.createdAt)}</p>
          </div>
        </div>
      </div>

      {isStaff && questions.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Question Preview</h2>
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
                          ? opt === q.correctAnswer ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600'
                          : q.correctAnswers.includes(opt) ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600'
                      }`}>
                        {q.type === 'single_choice' ? '○' : '□'} {opt}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <p className="text-sm text-slate-500 ml-6 italic">Text answer {q.keywords.length > 0 ? `(keywords: ${q.keywords.join(', ')})` : '(manual review)'}</p>
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
