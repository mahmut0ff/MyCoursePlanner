import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getAttemptsByStudent } from '../../services/attempts.service';
import type { LessonPlan, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Radio, Trophy, XCircle, ArrowRight, Brain } from 'lucide-react';

const StudentDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.uid) {
      Promise.all([getLessonPlans(), getAttemptsByStudent(profile.uid)])
        .then(([l, a]) => { setLessons(l); setAttempts(a); })
        .finally(() => setLoading(false));
    }
  }, [profile?.uid]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
  const passRate = attempts.length > 0 ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100) : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.displayName}!</h1>
        <p className="text-slate-500 text-sm mt-1">Here's your learning overview</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link to="/join" className="card p-6 hover:shadow-md transition-shadow group text-center">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-primary-200 transition-colors">
            <Radio className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Join Exam</h3>
          <p className="text-xs text-slate-500">Enter a room code</p>
        </Link>
        <Link to="/lessons" className="card p-6 hover:shadow-md transition-shadow group text-center">
          <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-violet-200 transition-colors">
            <BookOpen className="w-6 h-6 text-violet-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Lesson Plans</h3>
          <p className="text-xs text-slate-500">{lessons.length} available</p>
        </Link>
        <Link to="/results" className="card p-6 hover:shadow-md transition-shadow group text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-emerald-200 transition-colors">
            <Trophy className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">My Results</h3>
          <p className="text-xs text-slate-500">{attempts.length} attempts</p>
        </Link>
      </div>

      {/* Stats */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{attempts.length}</p>
            <p className="text-xs text-slate-500">Exams Taken</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{avgScore}%</p>
            <p className="text-xs text-slate-500">Average Score</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{passRate}%</p>
            <p className="text-xs text-slate-500">Pass Rate</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Lessons */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
            <h2 className="font-semibold text-slate-900">Available Lessons</h2>
            <Link to="/lessons" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y">
            {lessons.slice(0, 5).map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                <p className="font-medium text-slate-900 text-sm">{l.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{l.subject} · {l.level} · {l.duration}min</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-5 py-6 text-center text-slate-400 text-sm">No lessons available</div>}
          </div>
        </div>

        {/* Recent Results */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
            <h2 className="font-semibold text-slate-900">Recent Exams</h2>
            <Link to="/results" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y">
            {attempts.slice(0, 5).map((a) => (
              <Link key={a.id} to={`/results/${a.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {a.passed ? <Trophy className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <p className="font-medium text-slate-900 text-sm">{a.examTitle}</p>
                  </div>
                  <p className="font-semibold text-sm">{a.percentage}%</p>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  {a.aiFeedback && <span className="flex items-center gap-1 text-xs text-primary-600"><Brain className="w-3 h-3" />AI feedback</span>}
                  <span className="text-xs text-slate-400">{formatDate(a.submittedAt)}</span>
                </div>
              </Link>
            ))}
            {attempts.length === 0 && <div className="px-5 py-6 text-center text-slate-400 text-sm">No exams taken yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
