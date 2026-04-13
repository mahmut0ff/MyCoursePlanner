import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getActiveRooms, getAllRooms } from '../../services/rooms.service';
import type { ExamRoom } from '../../types';
import { formatDate } from '../../utils/grading';
import { Radio, Users, Plus, Network, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const RoomListPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';

  useEffect(() => {
    (isStaff ? getAllRooms() : getActiveRooms())
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [isStaff]);

  return (
    <div className="max-w-7xl mx-auto pb-12 font-sans animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <Network className="w-6 h-6 text-slate-700 dark:text-slate-300" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('rooms.title', 'Exam Rooms')}</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">
            {rooms.filter(r => r.status !== 'closed').length} {t('rooms.activeRooms', 'Live Sessions')}
          </p>
        </div>
        
        {isStaff && (
          <div className="flex items-center">
            <Link to="/exams" className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow-md">
              <Plus className="w-4 h-4" />{t('rooms.startFromExam', 'Start New Room')}
            </Link>
          </div>
        )}
      </div>

      {loading ? (
         <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>
      ) : rooms.length === 0 ? (
        <div className="exam-slide-up bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Radio className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('rooms.noRooms', 'No Active Rooms')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">{t('rooms.noRoomsDesc', 'Go to the Exams Library to launch a new live assessment session.')}</p>
          {isStaff && (
            <Link to="/exams" className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-all shadow-md">
              {t('rooms.startFromExam', 'Browse Exams')} <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rooms.map((room, i) => (
            <Link 
              key={room.id} 
              to={`/rooms/${room.id}`} 
              className="exam-slide-up exam-card-hover bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 group flex flex-col justify-between h-full relative overflow-hidden"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {room.status === 'active' && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
              )}
              
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Radio className={`w-4 h-4 ${room.status === 'active' ? 'text-emerald-500 animate-pulse' : room.status === 'waiting' ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
                      room.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' : 
                      room.status === 'waiting' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' :
                      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}>
                      {room.status === 'waiting' ? t('rooms.waiting', 'ОЖИДАНИЕ') : room.status}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold tracking-widest text-slate-900 dark:text-white px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md select-all">
                    {room.code}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors leading-snug mb-1 line-clamp-2">
                  {room.examTitle}
                </h3>
                
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">
                  {t('rooms.host', 'Host')}: {room.hostName}
                </p>
              </div>

              <div className="mt-auto pt-5 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
                      <Users className="w-3.5 h-3.5" />
                      {room.participants?.length || 0}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 font-medium">
                      {formatDate(room.createdAt)}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors">
                    <ChevronRight className="w-4 h-4 ml-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default RoomListPage;
