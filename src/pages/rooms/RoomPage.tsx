import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRoom, closeRoom, startRoom } from '../../services/rooms.service';
import { getAttemptsByRoom } from '../../services/attempts.service';
import { useAuth } from '../../contexts/AuthContext';
import type { ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
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

  // Модалка приложения вместо window.confirm — как удаление занятия в расписании.
  const [pending, setPending] = useState<'start' | 'close' | null>(null);
  const [busy, setBusy] = useState(false);
  const runPending = async () => {
    if (!id || !pending) return;
    setBusy(true);
    try {
      await (pending === 'close' ? closeRoom(id) : startRoom(id));
      setPending(null);
      loadRoom();
    } finally { setBusy(false); }
  };
  const handleClose = () => setPending('close');
  const handleStart = () => setPending('start');

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;
  if (!room) return <div className="text-center py-20"><h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('common.notFound')}</h3></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/rooms')} className="btn-ghost inline-flex items-center gap-1.5"><ArrowLeft className="w-3.5 h-3.5" />{t('common.back')}</button>
        <div className="flex items-center gap-2">
          {room.status === 'waiting' && (
            <button onClick={handleStart} className="btn-primary inline-flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 fill-current" />
              {t('rooms.startExam', 'Запустить экзамен')}
            </button>
          )}
          {room.status === 'active' && (
            <button onClick={handleClose} className="btn-danger inline-flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" />{t('rooms.close')}</button>
          )}
        </div>
      </div>

      {/* Room Code Card */}
      <div className="card p-6 mb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Radio className={`w-3.5 h-3.5 ${room.status === 'active' ? 'text-emerald-500 animate-pulse' : 'text-slate-400 dark:text-slate-500'}`} />
          <span className={room.status === 'active' ? 'badge-green' : room.status === 'waiting' ? 'badge-yellow' : 'badge-slate'}>
            {room.status === 'active' ? t('rooms.active') : room.status === 'waiting' ? t('rooms.waiting', 'ОЖИДАНИЕ УЧЕНИКОВ') : t('rooms.closed')}
          </span>
        </div>
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{room.examTitle}</h2>
        <div className="mt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('rooms.roomCode')}</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-semibold tracking-[0.3em] text-slate-900 dark:text-slate-100 font-mono">{room.code}</span>
            <button onClick={handleCopy} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800" title={t('common.copy')}>
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            {room.status === 'closed' ? t('rooms.closedHint', 'Комната закрыта — по этому коду больше не войти.') : t('rooms.shareCode')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="card p-3 text-center">
          <Users className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{(room.participants || []).length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.participants')}</p>
        </div>
        <div className="card p-3 text-center">
          <CheckCircle className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{attempts.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.submitted')}</p>
        </div>
        <div className="card p-3 text-center">
          <Clock className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{Math.max(0, (room.participants || []).length - attempts.length)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.inProgress')}</p>
        </div>
      </div>

      {/* Attempts */}
      {attempts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700"><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('rooms.submissions')}</h3></div>
          <table className="w-full">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"><tr className="h-8">
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.student')}</th>
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.score')}</th>
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.result')}</th>
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.antiCheat', 'Сворачивания')}</th>
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('results.timeSpent')}</th>
              <th className="text-left px-3 text-xs font-medium text-slate-500 dark:text-slate-400">{t('rooms.submittedAt')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {attempts.map((a) => (
                <tr key={a.id} onClick={() => navigate(`/results/${a.id}`)} className="h-10 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors click-action">
                  <td className="px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{a.studentName}</td>
                  <td className="px-3 py-1.5 text-sm tabular-nums text-slate-700 dark:text-slate-300">{a.percentage}%</td>
                  <td className="px-3 py-1.5"><span className={a.passed ? 'badge-green' : 'badge-red'}>{a.passed ? t('rooms.passed') : t('rooms.failed')}</span></td>
                  <td className="px-3 py-1.5">
                    {a.cheatAttempts && a.cheatAttempts > 0 ? (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 w-fit">
                        <AlertTriangle className="w-3 h-3" />
                        {t('rooms.timesCount', { count: a.cheatAttempts, defaultValue: '{{count}} раз' })}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-sm tabular-nums text-slate-700 dark:text-slate-300">{Math.floor(a.timeSpentSeconds / 60)}m {a.timeSpentSeconds % 60}s</td>
                  <td className="px-3 py-1.5 text-sm tabular-nums text-slate-500 dark:text-slate-400">{formatDate(a.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        title={pending === 'close' ? t('rooms.close') : t('rooms.startExam', 'Запустить экзамен')}
        message={pending === 'close' ? t('rooms.closeConfirm') : t('rooms.startConfirm', 'Начать экзамен для всех ожидающих учеников?')}
        confirmLabel={pending === 'close' ? t('rooms.close') : t('rooms.startExam', 'Запустить экзамен')}
        danger={pending === 'close'}
        busy={busy}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />
    </div>
  );
};

export default RoomPage;
