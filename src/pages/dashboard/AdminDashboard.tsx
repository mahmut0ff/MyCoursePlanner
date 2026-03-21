import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import { getAllAttempts } from '../../services/attempts.service';
import type { LessonPlan, Exam, ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, ClipboardList, Radio, Users, TrendingUp, ArrowRight } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLessonPlans(), getExams(), getActiveRooms(), getAllAttempts()])
      .then(([l, e, r, a]) => { setLessons(l); setExams(e); setRooms(r); setAttempts(a); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of your educational center</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{lessons.length}</p><p className="text-xs text-slate-500">Lesson Plans</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center"><ClipboardList className="w-5 h-5 text-violet-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{exams.length}</p><p className="text-xs text-slate-500">Exams</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Radio className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{rooms.length}</p><p className="text-xs text-slate-500">Active Rooms</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{avgScore}%</p><p className="text-xs text-slate-500">Avg Score</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Lessons */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
            <h2 className="font-semibold text-slate-900">Recent Lessons</h2>
            <Link to="/lessons" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y">
            {lessons.slice(0, 5).map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                <p className="font-medium text-slate-900 text-sm">{l.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{l.subject} · {formatDate(l.createdAt)}</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-5 py-6 text-center text-slate-400 text-sm">No lessons yet</div>}
          </div>
        </div>

        {/* Recent Exams */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
            <h2 className="font-semibold text-slate-900">Recent Exams</h2>
            <Link to="/exams" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y">
            {exams.slice(0, 5).map((e) => (
              <Link key={e.id} to={`/exams/${e.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900 text-sm">{e.title}</p>
                  <span className={e.status === 'published' ? 'badge-green text-xs' : 'badge-yellow text-xs'}>{e.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{e.subject} · {e.questionCount || 0} questions</p>
              </Link>
            ))}
            {exams.length === 0 && <div className="px-5 py-6 text-center text-slate-400 text-sm">No exams yet</div>}
          </div>
        </div>

        {/* Active Rooms */}
        {rooms.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
              <h2 className="font-semibold text-slate-900">Active Rooms</h2>
              <Link to="/rooms" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="divide-y">
              {rooms.slice(0, 5).map((r) => (
                <Link key={r.id} to={`/rooms/${r.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <p className="font-medium text-slate-900 text-sm">{r.examTitle}</p>
                    </div>
                    <span className="font-mono text-xs text-primary-600">{r.code}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Users className="w-3 h-3" />{r.participants.length} participants</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-900">Recent Results</h2>
          </div>
          <div className="divide-y">
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{a.studentName}</p>
                    <p className="text-xs text-slate-500">{a.examTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{a.percentage}%</p>
                    <span className={`text-xs ${a.passed ? 'text-emerald-600' : 'text-red-500'}`}>{a.passed ? 'Pass' : 'Fail'}</span>
                  </div>
                </div>
              </div>
            ))}
            {attempts.length === 0 && <div className="px-5 py-6 text-center text-slate-400 text-sm">No results yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
