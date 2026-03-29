import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetQuizSessions } from '../../lib/api';
import type { QuizSession } from '../../types';
import { Radio, Users, Clock, BarChart3, Play, Gamepad2 } from 'lucide-react';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  lobby: { color: '#1368ce', bg: 'rgba(19,104,206,0.1)', label: 'Lobby' },
  in_progress: { color: '#26890c', bg: 'rgba(38,137,12,0.1)', label: 'Live' },
  paused: { color: '#d89e00', bg: 'rgba(216,158,0,0.1)', label: 'Paused' },
  completed: { color: '#666', bg: 'rgba(100,100,100,0.1)', label: 'Completed' },
  cancelled: { color: '#e21b3c', bg: 'rgba(226,27,60,0.1)', label: 'Cancelled' },
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

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="kahoot-font">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--kahoot-purple)' }}>
              <Radio className="w-5 h-5 text-white" />
            </div>
            {t('quiz.sessions')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{sessions.length} {t('quiz.totalSessions')}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-14 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--kahoot-purple)', opacity: 0.2 }}>
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">{t('quiz.noSessions')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('quiz.launchFromLibrary')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const config = STATUS_CONFIG[s.status] || STATUS_CONFIG.completed;
            return (
              <Link key={s.id} to={s.status === 'completed' ? `/quiz/analytics/${s.id}` : `/quiz/sessions/${s.id}`}
                className="kahoot-library-card flex items-center gap-4 p-4 group transition-all transform hover:-translate-y-1 hover:shadow-md">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: config.bg }}>
                  {s.status === 'completed' ? <BarChart3 className="w-6 h-6" style={{ color: config.color }} /> :
                   s.status === 'in_progress' ? <Play className="w-6 h-6" style={{ color: config.color }} /> :
                   <Radio className={`w-6 h-6 ${s.status === 'lobby' ? 'animate-pulse' : ''}`} style={{ color: config.color }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors truncate">{s.quizTitle}</h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.participantCount}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(s.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.code && <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg" style={{ color: 'var(--kahoot-purple)', backgroundColor: 'rgba(70,23,143,0.08)' }}>{s.code}</span>}
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: config.color }}>
                    {config.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SessionHistoryPage;
