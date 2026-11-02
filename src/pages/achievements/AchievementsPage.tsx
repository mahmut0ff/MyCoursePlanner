import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetGamification } from '../../lib/api';
import { Flame, Star, Trophy, Zap, Lock } from 'lucide-react';

import type { GamificationData } from '../../types';

const AchievementsPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetGamification().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!data) return <div className="text-center py-20 text-sm text-slate-500 dark:text-slate-400">{t('common.error')}</div>;

  const earnedSet = new Set(data.badges || []);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('gamification.badges')}</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { icon: <Zap className="w-3.5 h-3.5 text-primary-500" />, value: data.xp, label: 'XP' },
          { icon: <Star className="w-3.5 h-3.5 text-amber-500" />, value: t('achievements.levelShort', 'Ур. {{level}}', { level: data.level.level }), label: t(`gamification.levels.${data.level.level}`, data.level.title) },
          { icon: <Flame className="w-3.5 h-3.5 text-orange-500" />, value: data.streak, label: t('gamification.streak') },
          { icon: <Trophy className="w-3.5 h-3.5 text-emerald-500" />, value: data.passedExams, label: t('gamification.passed') },
        ].map((s, i) => (
          <div key={i} className="card p-3 text-center">
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Level Progress */}
      {data.levelDefs && (
        <div className="card p-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('gamification.level')}</h2>
          <div className="space-y-1">
            {data.levelDefs.map((l) => {
              const isReached = data.xp >= l.xp;
              const isCurrent = data.level.level === l.level;
              return (
                <div key={l.level} className={`flex items-center gap-3 px-2 py-1.5 rounded-md ${isCurrent ? 'bg-primary-50 dark:bg-primary-950/40 ring-1 ring-primary-500/30' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums ${isReached ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    {l.level}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isReached ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{t(`gamification.levels.${l.level}`, l.title)}</p>
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums">{l.xp} XP</span>
                  {isReached && <span className="text-emerald-500 text-xs">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Badges */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('gamification.earned')}</h2>
        {data.allBadgeDefs ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.allBadgeDefs).map(([id, badge]) => {
              const earned = earnedSet.has(id);
              return (
                <div
                  key={id}
                  className={`relative p-3 rounded-lg text-center border ${
                    earned
                      ? 'bg-white dark:bg-slate-800 border-primary-200 dark:border-primary-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50'
                  }`}
                >
                  <span className="text-2xl block mb-1">{badge.icon}</span>
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{t(`gamification.badgesList.${id}.title`, badge.title)}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t(`gamification.badgesList.${id}.description`, badge.description)}</p>
                  {!earned && <Lock className="w-3.5 h-3.5 text-slate-400 absolute top-2 right-2" />}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.noData', 'Нет данных о достижениях')}</p>
        )}
      </div>
    </div>
  );
};

export default AchievementsPage;
