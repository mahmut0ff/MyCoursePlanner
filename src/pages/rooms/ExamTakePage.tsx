import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom } from '../../services/rooms.service';
import { getExam, getQuestions } from '../../services/exams.service';
import { saveAttempt } from '../../services/attempts.service';
import { useAuth } from '../../contexts/AuthContext';
import { gradeAttempt, shuffleArray, formatTime } from '../../utils/grading';
import type { ExamRoom, Exam, Question } from '../../types';
import { Clock, ChevronLeft, ChevronRight, Send, AlertTriangle } from 'lucide-react';

const ExamTakePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [room, setRoom] = useState<ExamRoom | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const startRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    loadData();
  }, [roomId]);

  const loadData = async () => {
    if (!roomId) return;
    try {
      const r = await getRoom(roomId);
      if (!r) { navigate('/join'); return; }
      setRoom(r);
      const e = await getExam(r.examId);
      if (!e) return;
      setExam(e);
      let qs = await getQuestions(r.examId);
      if (e.randomizeQuestions) qs = shuffleArray(qs);
      setQuestions(qs);
      setTimeLeft(e.durationMinutes * 60);
    } finally {
      setLoading(false);
    }
  };

  // Timer
  useEffect(() => {
    if (loading || submitted || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, submitted, timeLeft]);

  const setAnswer = useCallback((qId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }, []);

  const toggleMultiAnswer = useCallback((qId: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[qId] as string[]) || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [qId]: next };
    });
  }, []);

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const { questionResults, score, totalPoints, percentage } = gradeAttempt(questions, answers);
      const now = new Date().toISOString();
      const startTime = new Date(startRef.current).getTime();
      const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);

      const attemptId = await saveAttempt({
        examId: exam!.id,
        examTitle: exam!.title,
        roomId: room!.id,
        roomCode: room!.code,
        studentId: profile!.uid,
        studentName: profile!.displayName,
        answers,
        questionResults,
        score,
        totalPoints,
        percentage,
        passed: percentage >= (exam!.passScore || 60),
        startedAt: startRef.current,
        submittedAt: now,
        timeSpentSeconds,
        createdAt: now,
      });

      setSubmitted(true);

      // Trigger AI feedback in background
      try {
        fetch('/.netlify/functions/ai-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId }),
        }).catch(() => {});
      } catch {}

      navigate(`/results/${attemptId}`);
    } catch (e) {
      console.error('Submit failed:', e);
      alert('Failed to submit exam. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!exam || !questions.length) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700">Exam not available</h3></div>;

  const q = questions[currentQ];
  const isLow = timeLeft <= 60;
  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return v && (Array.isArray(v) ? v.length > 0 : v.trim() !== '');
  }).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Fixed Timer Bar */}
      <div className={`sticky top-0 z-50 border-b ${isLow ? 'bg-red-600 text-white' : 'bg-white text-slate-900'} shadow-sm`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-sm">{exam.title}</h1>
            <p className={`text-xs ${isLow ? 'text-red-200' : 'text-slate-500'}`}>
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className="text-xl font-mono font-bold">{formatTime(timeLeft)}</span>
            {isLow && <AlertTriangle className="w-5 h-5 animate-pulse" />}
          </div>
          <button
            onClick={() => { if (confirm('Submit your exam? You cannot change answers after submission.')) handleSubmit(); }}
            disabled={submitting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm ${
              isLow ? 'bg-white text-red-600 hover:bg-red-50' : 'btn-primary'
            }`}
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Question Navigation Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {questions.map((_, i) => {
            const qId = questions[i].id;
            const answered = answers[qId] && (Array.isArray(answers[qId]) ? (answers[qId] as string[]).length > 0 : String(answers[qId]).trim() !== '');
            return (
              <button
                key={i}
                onClick={() => setCurrentQ(i)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  i === currentQ
                    ? 'bg-primary-600 text-white'
                    : answered
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Question Card */}
        <div className="card p-8">
          <div className="flex items-center justify-between mb-4">
            <span className="badge-primary">Question {currentQ + 1} of {questions.length}</span>
            <span className="text-sm text-slate-500">{q.points} point{q.points !== 1 ? 's' : ''}</span>
          </div>

          <h2 className="text-xl font-semibold text-slate-900 mb-6">{q.text}</h2>

          {q.type === 'single_choice' && (
            <div className="space-y-3">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    answers[q.id] === opt
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswer(q.id, opt)}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-slate-800">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {q.type === 'multiple_choice' && (
            <div className="space-y-3">
              {q.options.map((opt, oi) => {
                const selected = ((answers[q.id] as string[]) || []).includes(opt);
                return (
                  <label
                    key={oi}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selected ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleMultiAnswer(q.id, opt)}
                      className="w-4 h-4 rounded text-primary-600"
                    />
                    <span className="text-slate-800">{opt}</span>
                  </label>
                );
              })}
              <p className="text-xs text-slate-400">Select all correct answers</p>
            </div>
          )}

          {q.type === 'text' && (
            <div>
              <textarea
                value={(answers[q.id] as string) || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="input min-h-[150px]"
                placeholder="Type your answer here..."
              />
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
            className="btn-secondary flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />Previous
          </button>
          <button
            onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
            disabled={currentQ === questions.length - 1}
            className="btn-secondary flex items-center gap-2"
          >
            Next<ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamTakePage;
