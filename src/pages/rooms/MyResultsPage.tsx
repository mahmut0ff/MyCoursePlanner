import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetAttemptsByStudent } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import type { ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { ClipboardList, Trophy, XCircle, Clock } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const MyResultsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.uid) {
      apiGetAttemptsByStudent(profile.uid).then(setAttempts).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [profile?.uid]);

  if (loading) return <ListSkeleton rows={5} />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('results.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs">{t('counts.attempts', { count: attempts.length })}</p>
      </div>

      {attempts.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('results.noResults')}
          description={t('results.noResultsDesc')}
          actionLabel={t('rooms.joinButton')}
          actionLink="/join"
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {attempts.map((a) => (
            <Link key={a.id} to={`/results/${a.id}`} className="flex items-center gap-3 min-h-[40px] px-3 py-2 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                {a.passed ? <Trophy className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{a.examTitle}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{formatDate(a.submittedAt)}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.floor(a.timeSpentSeconds / 60)}m</span>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{a.percentage}%</p>
                <span className={a.passed ? 'badge-green' : 'badge-red'}>{a.passed ? t('results.pass') : t('results.fail')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyResultsPage;

