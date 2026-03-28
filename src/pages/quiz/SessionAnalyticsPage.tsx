import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetQuizSessionAnalytics } from '../../lib/api';
import {
  BarChart3, Users, Trophy, CheckCircle, Clock, ArrowLeft,
  Zap, Target, Medal, Gamepad2
} from 'lucide-react';

const SessionAnalyticsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      apiGetQuizSessionAnalytics(id)
        .then(setAnalytics)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );

  if (!analytics) return (
    <div className="text-center py-20 kahoot-font">
      <Gamepad2 className="w-14 h-14 mx-auto mb-3" style={{ color: 'var(--kahoot-purple)', opacity: 0.3 }} />
      <p className="text-slate-500 dark:text-slate-400 font-bold">{t('quiz.analyticsNotFound')}</p>
    </div>
  );

  const { session, participants = [], questions = [] } = analytics;
  const sorted = [...participants].sort((a: any, b: any) => b.score - a.score);
  const avgScore = sorted.length > 0 ? Math.round(sorted.reduce((s: number, p: any) => s + p.score, 0) / sorted.length) : 0;
  const avgCorrect = sorted.length > 0 ? Math.round(sorted.reduce((s: number, p: any) => s + (p.correctCount || 0), 0) / sorted.length) : 0;

  return (
    <div className="max-w-5xl mx-auto kahoot-font">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/sessions')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{session?.quizTitle || t('quiz.analytics')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {session?.createdAt ? new Date(session.createdAt).toLocaleString() : ''} · {sorted.length} {t('quiz.participants')}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatsCard icon={<Users className="w-5 h-5 text-white" />} bg="var(--kahoot-purple)" label={t('quiz.participants')} value={sorted.length} />
        <StatsCard icon={<Target className="w-5 h-5 text-white" />} bg="var(--kahoot-green)" label={t('quiz.avgCorrect')} value={`${avgCorrect}/${session?.totalQuestions || 0}`} />
        <StatsCard icon={<Trophy className="w-5 h-5 text-white" />} bg="var(--kahoot-yellow)" label={t('quiz.avgScore')} value={avgScore} />
        <StatsCard icon={<Zap className="w-5 h-5 text-white" />} bg="var(--kahoot-red)" label={t('quiz.totalQuestions')} value={session?.totalQuestions || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leaderboard */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderBottomColor: 'var(--kahoot-purple)', borderBottomWidth: '2px' }}>
            <Trophy className="w-4 h-4" style={{ color: 'var(--kahoot-purple)' }} />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{t('quiz.leaderboard')}</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {sorted.map((p: any, i: number) => (
              <div key={p.participantId} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700/50">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>
                  {i < 3 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{p.participantName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" />{p.correctCount || 0} correct</span>
                    {p.streakBest > 0 && <span className="text-[10px] text-orange-500 font-semibold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{p.streakBest} streak</span>}
                  </div>
                </div>
                <span className="font-extrabold text-sm" style={{ color: 'var(--kahoot-purple)' }}>{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Performance */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderBottomColor: 'var(--kahoot-green)', borderBottomWidth: '2px' }}>
            <BarChart3 className="w-4 h-4" style={{ color: 'var(--kahoot-green)' }} />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{t('quiz.questionPerformance')}</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {questions.map((q: any, i: number) => {
              const correctPct = q.totalAnswered > 0 ? Math.round((q.correctCount / q.totalAnswered) * 100) : 0;
              return (
                <div key={q.questionId || i} className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: 'var(--kahoot-purple)' }}>Q{i + 1}</span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{q.text || `Question ${i + 1}`}</p>
                    </div>
                    <span className={`text-xs font-extrabold ml-2 ${correctPct >= 70 ? 'text-green-600' : correctPct >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{correctPct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${correctPct}%`,
                        backgroundColor: correctPct >= 70 ? 'var(--kahoot-green)' : correctPct >= 40 ? 'var(--kahoot-yellow)' : 'var(--kahoot-red)',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{q.totalAnswered} answered</span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{q.avgResponseTime ? `${(q.avgResponseTime / 1000).toFixed(1)}s` : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatsCard: React.FC<{ icon: React.ReactNode; bg: string; label: string; value: string | number }> = ({ icon, bg, label, value }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>{icon}</div>
      <div>
        <p className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  </div>
);

export default SessionAnalyticsPage;
