import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetSessionAnalytics, apiExportSessionResults } from '../../lib/api';
import {
  ArrowLeft, Trophy, Users, BarChart3, Download, Target,
  Clock, CheckCircle, XCircle, Zap, TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';

const SessionAnalyticsPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    apiGetSessionAnalytics(sessionId)
      .then(setData)
      .catch(() => toast.error(t('common.error')))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleExport = async () => {
    try {
      const csv = await apiExportSessionResults(sessionId!);
      // Handle CSV download
      const blob = new Blob([typeof csv === 'string' ? csv : JSON.stringify(csv)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `quiz-results-${sessionId}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(t('quiz.exported'));
    } catch { toast.error(t('common.error')); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!data) return <div className="text-center py-20 text-slate-500">{t('common.error')}</div>;

  const { session, participants, questionStats, summary } = data;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quiz/sessions')} className="btn-ghost p-2"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{session?.quizTitle}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('quiz.sessionAnalytics')}</p>
          </div>
        </div>
        <button onClick={handleExport} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />{t('quiz.exportCSV')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: <Users className="w-5 h-5 text-primary-500" />, value: summary?.totalParticipants || 0, label: t('quiz.participants') },
          { icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, value: summary?.avgScore || 0, label: t('quiz.avgScore') },
          { icon: <Target className="w-5 h-5 text-amber-500" />, value: `${summary?.completionRate || 0}%`, label: t('quiz.completionRate') },
          { icon: <Zap className="w-5 h-5 text-purple-500" />, value: summary?.maxScore || 0, label: t('quiz.topScore') },
        ].map((card, i) => (
          <div key={i} className="card p-4 text-center">
            <div className="flex justify-center mb-2">{card.icon}</div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Participant Rankings */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />{t('quiz.rankings')}
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-96 overflow-y-auto">
            {participants?.map((p: any, i: number) => (
              <div key={p.participantId} className={`flex items-center gap-3 px-5 py-3 ${i < 3 ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.participantName}</p>
                  <div className="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                    <span className="flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5 text-emerald-400" />{p.correctCount}</span>
                    <span className="flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5 text-red-400" />{p.incorrectCount}</span>
                    <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 text-orange-400" />{p.streakBest} streak</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Performance */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary-500" />{t('quiz.questionPerformance')}
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-96 overflow-y-auto">
            {questionStats?.map((qs: any, i: number) => (
              <div key={qs.questionId} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">Q{i + 1}: {qs.questionText || 'Question'}</p>
                  <span className={`text-xs font-bold ml-2 ${qs.correctRate >= 70 ? 'text-emerald-500' : qs.correctRate >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                    {qs.correctRate}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-1">
                  <div className={`h-2 rounded-full transition-all ${qs.correctRate >= 70 ? 'bg-emerald-400' : qs.correctRate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${qs.correctRate}%` }} />
                </div>
                <div className="flex gap-3 text-[10px] text-slate-400">
                  <span>{qs.totalAnswers} answers</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{(qs.avgResponseTimeMs / 1000).toFixed(1)}s avg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionAnalyticsPage;
