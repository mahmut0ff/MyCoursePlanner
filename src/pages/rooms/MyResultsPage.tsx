import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAttemptsByStudent } from '../../services/attempts.service';
import { useAuth } from '../../contexts/AuthContext';
import type { ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ClipboardList, Trophy, XCircle, Clock } from 'lucide-react';

const MyResultsPage: React.FC = () => {
  const { profile } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.uid) {
      getAttemptsByStudent(profile.uid).then(setAttempts).finally(() => setLoading(false));
    }
  }, [profile?.uid]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Results</h1>
        <p className="text-slate-500 text-sm mt-1">{attempts.length} exam attempts</p>
      </div>

      {attempts.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">No results yet</h3>
          <p className="text-slate-500 text-sm">Join an exam to see your results here.</p>
          <Link to="/join" className="btn-primary inline-block mt-4">Join an Exam</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {attempts.map((a) => (
            <Link key={a.id} to={`/results/${a.id}`} className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${a.passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {a.passed ? <Trophy className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{a.examTitle}</h3>
                <div className="flex items-center gap-3 text-sm text-slate-500 mt-0.5">
                  <span>{formatDate(a.submittedAt)}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{Math.floor(a.timeSpentSeconds / 60)}m</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{a.percentage}%</p>
                <span className={a.passed ? 'badge-green' : 'badge-red'}>{a.passed ? 'Pass' : 'Fail'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyResultsPage;
