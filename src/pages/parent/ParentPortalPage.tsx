import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetParentPortalData } from '../../lib/api';
import { Trophy, Flame, Play, BookOpen, Star, AlertCircle, Calendar } from 'lucide-react';

interface ParentPortalData {
  student: {
    uid: string;
    displayName: string;
    avatarUrl: string;
    pinnedBadges: string[];
  };
  stats: {
    totalXp: number;
    currentStreak: number;
    activeOrgsCount: number;
  };
  recentResults: {
    id: string;
    examTitle: string;
    percentage: number;
    passed: boolean;
    submittedAt: string;
    type: string;
    xpEarned: number;
  }[];
}

const ParentPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ParentPortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Неверная ссылка');
      setLoading(false);
      return;
    }

    apiGetParentPortalData(token)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || 'Ссылка недействительна или доступ закрыт.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Доступ закрыт</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  const { student, stats, recentResults } = data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      {/* Decorative header background */}
      <div className="h-48 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-10 right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-20">
        
        {/* Profile Card */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700 shadow-2xl rounded-3xl p-6 sm:p-10 mb-8 flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="relative">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt={student.displayName} className="w-32 h-32 rounded-2xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800 bg-white" />
            ) : (
              <div className="w-32 h-32 bg-indigo-600 rounded-2xl flex items-center justify-center text-4xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                {student.displayName?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center text-white shadow-lg border-2 border-white dark:border-slate-800 transform rotate-12">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          
          <div className="flex-1 text-center sm:text-left pb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold uppercase tracking-wide mb-2">
              Портал для родителей
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{student.displayName}</h1>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {/* XP Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-400/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shrink-0">
                <Star className="w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Всего очков (XP)</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.totalXp}</span>
                  <span className="text-sm text-amber-500 font-medium pb-1">XP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Streak Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-orange-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-500 flex items-center justify-center shrink-0">
                <Flame className="w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Серия дней</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.currentStreak}</span>
                  <span className="text-sm text-slate-500 font-medium pb-1">дней</span>
                </div>
              </div>
            </div>
          </div>

          {/* Courses Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Активные курсы</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.activeOrgsCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 flex items-center justify-center">
              <Play className="w-4 h-4 ml-0.5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Недавние успехи</h2>
          </div>
          
          {recentResults.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-slate-500 font-medium">Пока нет завершенных заданий</p>
              <p className="text-sm text-slate-400 mt-1">Как только студент пройдет тестирование, оно появится здесь.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {recentResults.map((result) => (
                <div key={result.id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{result.examTitle}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500">{new Date(result.submittedAt).toLocaleDateString()}</span>
                      <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                      <span className="text-sm text-slate-500 uppercase">{result.type === 'quiz' ? 'Квиз' : 'Экзамен'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    {result.xpEarned > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md text-sm">
                        +{result.xpEarned} <Star className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    <div className="text-right">
                      <span className="block text-2xl font-black tracking-tight text-slate-900 dark:text-white">{result.percentage}%</span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${result.passed ? 'text-emerald-500' : 'text-red-500'}`}>
                        {result.passed ? 'Сдано' : 'Не сдано'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ParentPortalPage;
