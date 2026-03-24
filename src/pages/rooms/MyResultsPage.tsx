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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('results.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{attempts.length} {t('results.attempts')}</p>
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
        <div className="space-y-3">
          {attempts.map((a) => (
            <Link key={a.id} to={`/results/${a.id}`} className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${a.passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {a.passed ? <Trophy className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 dark:text-white truncate">{a.examTitle}</h3>
                <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  <span>{formatDate(a.submittedAt)}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{Math.floor(a.timeSpentSeconds / 60)}m</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{a.percentage}%</p>
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

