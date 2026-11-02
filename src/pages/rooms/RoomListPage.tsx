import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getActiveRooms, getAllRooms, closeRoom } from '../../services/rooms.service';
import type { ExamRoom } from '../../types';
import { formatDate } from '../../utils/grading';
import { Radio, Users, Plus, Network, ChevronRight, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const RoomListPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher';
  const [closing, setClosing] = useState<ExamRoom | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmClose = async () => {
    if (!closing) return;
    setBusy(true);
    try {
      await closeRoom(closing.id);
      setRooms(prev => prev.map(r => r.id === closing.id ? { ...r, status: 'closed' as const } : r));
      toast.success(t('rooms.closed', 'Комната закрыта'));
      setClosing(null);
    } catch (e: any) {
      toast.error(e?.message || t('rooms.closeFailed', 'Не удалось закрыть комнату'));
    } finally { setBusy(false); }
  };

  // Закрытые комнаты не удаляются — уходят в архив вместе с результатами учеников.
  const [showArchive, setShowArchive] = useState(false);
  const visible = rooms.filter(r => (r.status === 'closed') === showArchive);

  useEffect(() => {
    (isStaff ? getAllRooms() : getActiveRooms())
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [isStaff]);

  return (
    <div className="pb-12 font-sans animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="hidden">
              <Network className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('rooms.title', 'Exam Rooms')}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('rooms.activeRoomsCount', 'Активные сессии: {{count}}', { count: rooms.filter(r => r.status !== 'closed').length })}
          </p>
        </div>
        
        {isStaff && (
          <div className="flex items-center">
            <Link to="/exams" className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />{t('rooms.startFromExam', 'Start New Room')}
            </Link>
          </div>
        )}
      </div>

      {isStaff && (
        <div className="flex gap-1 mb-3" role="tablist">
          {[false, true].map(archive => (
            <button
              key={String(archive)}
              role="tab"
              aria-selected={showArchive === archive}
              onClick={() => setShowArchive(archive)}
              className={`h-7 px-2 rounded-md text-sm transition-colors ${showArchive === archive ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {archive ? t('common.archived', 'Архив') : t('org.students.statusActive', 'Активные')}
              {' '}({rooms.filter(r => (r.status === 'closed') === archive).length})
            </button>
          ))}
        </div>
      )}

      {loading ? (
         <div className="flex items-center justify-center py-32"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin dark:border-slate-700 dark:border-t-white" /></div>
      ) : visible.length === 0 ? (
        <div className="exam-slide-up bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-12 px-4 text-center">
          <div className="flex items-center justify-center mx-auto mb-2">
            <Radio className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('rooms.noRooms', 'No Active Rooms')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">{t('rooms.noRoomsDesc', 'Go to the Exams Library to launch a new live assessment session.')}</p>
          {isStaff && (
            <Link to="/exams" className="btn-primary inline-flex items-center gap-1.5">
              {t('rooms.startFromExam', 'Browse Exams')} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((room, i) => (
            <Link 
              key={room.id} 
              to={`/rooms/${room.id}`} 
              className="exam-slide-up bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors rounded-lg p-4 group flex flex-col justify-between h-full relative overflow-hidden"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {room.status === 'active' && (
                <div className="hidden" />
              )}
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className={`w-3.5 h-3.5 ${room.status === 'active' ? 'text-emerald-500 animate-pulse' : room.status === 'waiting' ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium ${
                      room.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                      room.status === 'waiting' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {room.status === 'waiting' ? t('rooms.waiting', 'ОЖИДАНИЕ')
                        : room.status === 'active' ? t('rooms.statusActive', 'ИДЁТ')
                        : room.status === 'closed' ? t('rooms.statusClosed', 'ЗАКРЫТА')
                        : room.status}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-medium tracking-widest text-slate-900 dark:text-slate-100 h-6 inline-flex items-center px-2 border border-slate-200 dark:border-slate-700 rounded select-all">
                    {room.code}
                  </span>
                </div>
                
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5 line-clamp-2">
                  {room.examTitle}
                </h3>
                
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {t('rooms.host', 'Host')}: {room.hostName}
                </p>
              </div>

              <div className="mt-auto pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1 tabular-nums">
                      <Users className="w-3.5 h-3.5" />
                      {room.participants?.length || 0}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatDate(room.createdAt)}
                    </span>
                  </div>
                  {isStaff && room.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setClosing(room); }}
                      title={t('rooms.closeRoom', 'Закрыть комнату')}
                      aria-label={t('rooms.closeRoom', 'Закрыть комнату')}
                      className="ml-auto mr-1 w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 dark:group-hover:text-slate-100 dark:group-hover:bg-slate-800 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!closing}
        title={t('rooms.closeRoom', 'Закрыть комнату')}
        message={t('rooms.closeConfirm', 'Ученики больше не смогут войти по коду. Результаты сохранятся.')}
        confirmLabel={t('rooms.closeRoom', 'Закрыть комнату')}
        danger
        busy={busy}
        onConfirm={confirmClose}
        onClose={() => setClosing(null)}
      />
    </div>
  );
};

export default RoomListPage;
