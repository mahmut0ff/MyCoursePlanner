import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveRooms, getAllRooms } from '../../services/rooms.service';
import type { ExamRoom } from '../../types';
import { formatDate } from '../../utils/grading';
import { Radio, Users, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const RoomListPage: React.FC = () => {
  const { role } = useAuth();
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const isStaff = role === 'admin' || role === 'teacher';

  useEffect(() => {
    (isStaff ? getAllRooms() : getActiveRooms())
      .then(setRooms)
      .finally(() => setLoading(false));
  }, [isStaff]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exam Rooms</h1>
          <p className="text-slate-500 text-sm mt-1">{rooms.filter(r => r.status === 'active').length} active rooms</p>
        </div>
        {isStaff && (
          <Link to="/exams" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />Start from Exam
          </Link>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="card p-12 text-center">
          <Radio className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">No exam rooms</h3>
          <p className="text-slate-500 text-sm">Go to an exam and click "Start Exam Room" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Link key={room.id} to={`/rooms/${room.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <Radio className={`w-4 h-4 ${room.status === 'active' ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className={room.status === 'active' ? 'badge-green' : 'badge-slate'}>{room.status}</span>
                <span className="font-mono text-sm text-primary-600 ml-auto">{room.code}</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{room.examTitle}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Host: {room.hostName}</p>
              <div className="flex items-center justify-between mt-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{room.participants.length}</span>
                <span>{formatDate(room.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default RoomListPage;
