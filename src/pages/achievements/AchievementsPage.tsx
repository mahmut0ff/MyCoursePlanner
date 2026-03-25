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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-20 text-slate-500">{t('common.error')}</div>;

  const earnedSet = new Set(data.badges || []);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">{t('gamification.badges')}</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { icon: <Zap className="w-5 h-5 text-indigo-500" />, value: data.xp, label: 'XP' },
          { icon: <Star className="w-5 h-5 text-amber-500" />, value: `Lv.${data.level.level}`, label: t(`gamification.levels.${data.level.level}`, data.level.title) },
          { icon: <Flame className="w-5 h-5 text-orange-500" />, value: data.streak, label: t('gamification.streak') },
          { icon: <Trophy className="w-5 h-5 text-emerald-500" />, value: data.passedExams, label: t('gamification.passed') },
        ].map((s, i) => (
          <div key={i} className="card p-4 text-center">
            <div className="flex justify-center mb-2">{s.icon}</div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Level Progress */}
      {data.levelDefs && (
        <div className="card p-6 mb-8">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t('gamification.level')}</h2>
          <div className="space-y-2">
            {data.levelDefs.map((l) => {
              const isReached = data.xp >= l.xp;
              const isCurrent = data.level.level === l.level;
              return (
                <div key={l.level} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500/30' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isReached ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    {l.level}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isReached ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{t(`gamification.levels.${l.level}`, l.title)}</p>
                  </div>
                  <span className="text-xs text-slate-400">{l.xp} XP</span>
                  {isReached && <span className="text-emerald-500 text-xs">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Badges */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t('gamification.earned')}</h2>
        {data.allBadgeDefs ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.allBadgeDefs).map(([id, badge]) => {
              const earned = earnedSet.has(id);
              return (
                <div
                  key={id}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    earned
                      ? 'bg-gradient-to-b from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                      : 'bg-slate-100 dark:bg-slate-700/50 opacity-50'
                  }`}
                >
                  <span className="text-3xl block mb-2">{badge.icon}</span>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{t(`gamification.badges.${id}.title`, badge.title)}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t(`gamification.badges.${id}.description`, badge.description)}</p>
                  {!earned && <Lock className="w-3.5 h-3.5 text-slate-400 absolute top-2 right-2" />}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('common.noData', 'Нет данных о достижениях')}</p>
        )}
      </div>
    </div>
  );
};

export default AchievementsPage;
