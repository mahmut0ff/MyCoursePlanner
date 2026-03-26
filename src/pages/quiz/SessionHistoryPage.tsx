import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetQuizSessions } from '../../lib/api';
import type { QuizSession } from '../../types';
import { Radio, Users, Clock, BarChart3, Play, Gamepad2 } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  lobby: 'badge-blue',
  in_progress: 'badge-green',
  paused: 'badge-yellow',
  completed: 'badge-slate',
  cancelled: 'badge-red',
};

const SessionHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetQuizSessions().then((data: any) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (d?: string) => d ? new Date(d).toLocaleString() : '—';

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary-500" />{t('quiz.sessions')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sessions.length} {t('quiz.totalSessions')}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
          <Gamepad2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('quiz.noSessions')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('quiz.launchFromLibrary')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <Link key={s.id} to={s.status === 'completed' ? `/quiz/analytics/${s.id}` : `/quiz/sessions/${s.id}`}
              className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                {s.status === 'completed' ? <BarChart3 className="w-5 h-5 text-primary-500" /> :
                 s.status === 'in_progress' ? <Play className="w-5 h-5 text-emerald-500" /> :
                 <Radio className={`w-5 h-5 ${s.status === 'lobby' ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors truncate">{s.quizTitle}</h3>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.participantCount}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(s.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.code && <span className="font-mono text-xs text-primary-500 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">{s.code}</span>}
                <span className={`${STATUS_COLORS[s.status] || 'badge-slate'} text-[10px]`}>{s.status.replace('_', ' ')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SessionHistoryPage;
