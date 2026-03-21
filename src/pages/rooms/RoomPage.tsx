import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom, closeRoom } from '../../services/rooms.service';
import { getAttemptsByRoom } from '../../services/attempts.service';
import { useAuth } from '../../contexts/AuthContext';
import type { ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Copy, Users, XCircle, CheckCircle, Clock, Radio } from 'lucide-react';

const RoomPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuth();
  const [room, setRoom] = useState<ExamRoom | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadRoom();
    const interval = setInterval(loadRoom, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [id]);

  const loadRoom = async () => {
    if (!id) return;
    try {
      const [r, a] = await Promise.all([getRoom(id), getAttemptsByRoom(id)]);
      setRoom(r);
      setAttempts(a);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (room) {
      navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = async () => {
    if (!id || !confirm('Close this exam room? Students will no longer be able to join.')) return;
    await closeRoom(id);
    loadRoom();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!room) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700">Room not found</h3></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/rooms')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
        {room.status === 'active' && (
          <button onClick={handleClose} className="btn-danger flex items-center gap-2"><XCircle className="w-4 h-4" />Close Room</button>
        )}
      </div>

      {/* Room Code Card */}
      <div className="card p-8 mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Radio className={`w-5 h-5 ${room.status === 'active' ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
          <span className={room.status === 'active' ? 'badge-green' : 'badge-slate'}>{room.status}</span>
        </div>
        <h2 className="text-lg text-slate-600 mb-2">{room.examTitle}</h2>
        <div className="mt-4">
          <p className="text-sm text-slate-500 mb-2">Room Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-bold tracking-[0.3em] text-primary-600 font-mono">{room.code}</span>
            <button onClick={handleCopy} className="btn-ghost p-2" title="Copy code">
              {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-sm text-slate-400 mt-3">Share this code with students to join the exam</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <Users className="w-5 h-5 text-primary-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{room.participants.length}</p>
          <p className="text-xs text-slate-500">Participants</p>
        </div>
        <div className="card p-4 text-center">
          <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{attempts.length}</p>
          <p className="text-xs text-slate-500">Submitted</p>
        </div>
        <div className="card p-4 text-center">
          <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{room.participants.length - attempts.length}</p>
          <p className="text-xs text-slate-500">In Progress</p>
        </div>
      </div>

      {/* Attempts */}
      {attempts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Submissions</h3></div>
          <table className="w-full">
            <thead className="border-b"><tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Student</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Score</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Result</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Time</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Submitted</th>
            </tr></thead>
            <tbody className="divide-y">
              {attempts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{a.studentName}</td>
                  <td className="px-6 py-4 text-sm">{a.percentage}%</td>
                  <td className="px-6 py-4"><span className={a.passed ? 'badge-green' : 'badge-red'}>{a.passed ? 'Pass' : 'Fail'}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-600">{Math.floor(a.timeSpentSeconds / 60)}m {a.timeSpentSeconds % 60}s</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{formatDate(a.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
