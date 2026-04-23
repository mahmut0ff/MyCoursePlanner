import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRoom, closeRoom, startRoom } from '../../services/rooms.service';
import { getAttemptsByRoom } from '../../services/attempts.service';
import { useAuth } from '../../contexts/AuthContext';
import type { ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ArrowLeft, Copy, Users, XCircle, CheckCircle, Clock, Radio, Play, AlertTriangle } from 'lucide-react';

const RoomPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useAuth();
  const [room, setRoom] = useState<ExamRoom | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadRoom();
    const interval = setInterval(loadRoom, 5000);
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
    if (!id || !confirm(t('rooms.closeConfirm'))) return;
    await closeRoom(id);
    loadRoom();
  };

  const handleStart = async () => {
    if (!id || !confirm(t('rooms.startConfirm', 'Начать экзамен для всех ожидающих учеников?'))) return;
    await startRoom(id);
    loadRoom();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!room) return <div className="text-center py-20"><h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('common.notFound')}</h3></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/rooms')} className="btn-ghost flex items-center gap-2"><ArrowLeft className="w-4 h-4" />{t('common.back')}</button>
        <div className="flex items-center gap-2">
          {room.status === 'waiting' && (
            <button onClick={handleStart} className="bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95">
              <Play className="w-5 h-5 fill-current" />
              {t('rooms.startExam', 'Запустить экзамен')}
            </button>
          )}
          {room.status === 'active' && (
            <button onClick={handleClose} className="btn-danger flex items-center gap-2"><XCircle className="w-4 h-4" />{t('rooms.close')}</button>
          )}
        </div>
      </div>

      {/* Room Code Card */}
      <div className="card p-8 mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Radio className={`w-5 h-5 ${room.status === 'active' ? 'text-emerald-500 animate-pulse' : 'text-slate-400 dark:text-slate-500'}`} />
          <span className={room.status === 'active' ? 'badge-green' : room.status === 'waiting' ? 'badge-yellow px-3 py-1 text-sm font-bold animate-pulse' : 'badge-slate'}>
            {room.status === 'active' ? t('rooms.active') : room.status === 'waiting' ? t('rooms.waiting', 'ОЖИДАНИЕ УЧЕНИКОВ') : t('rooms.closed')}
          </span>
        </div>
        <h2 className="text-lg text-slate-600 dark:text-slate-400 mb-2">{room.examTitle}</h2>
        <div className="mt-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('rooms.roomCode')}</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-bold tracking-[0.3em] text-primary-600 dark:text-primary-400 font-mono">{room.code}</span>
            <button onClick={handleCopy} className="btn-ghost p-2" title={t('common.copy')}>
              {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">{t('rooms.shareCode')}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <Users className="w-5 h-5 text-primary-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{(room.participants || []).length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.participants')}</p>
        </div>
        <div className="card p-4 text-center">
          <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{attempts.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.submitted')}</p>
        </div>
        <div className="card p-4 text-center">
          <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{Math.max(0, (room.participants || []).length - attempts.length)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.inProgress')}</p>
        </div>
      </div>

      {/* Attempts */}
      {attempts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50"><h3 className="font-semibold text-slate-900 dark:text-white">{t('rooms.submissions')}</h3></div>
          <table className="w-full">
            <thead className="border-b border-slate-200 dark:border-slate-700"><tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('rooms.student')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('rooms.score')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('rooms.result')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('rooms.antiCheat', 'Сворачивания')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('results.timeSpent')}</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('rooms.submittedAt')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {attempts.map((a) => (
                <tr key={a.id} onClick={() => navigate(`/results/${a.id}`)} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors click-action">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{a.studentName}</td>
                  <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{a.percentage}%</td>
                  <td className="px-6 py-4"><span className={a.passed ? 'badge-green' : 'badge-red'}>{a.passed ? t('rooms.passed') : t('rooms.failed')}</span></td>
                  <td className="px-6 py-4">
                    {a.cheatAttempts && a.cheatAttempts > 0 ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-md w-fit">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {a.cheatAttempts} {t('rooms.times', 'раз')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{Math.floor(a.timeSpentSeconds / 60)}m {a.timeSpentSeconds % 60}s</td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(a.submittedAt)}</td>
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
