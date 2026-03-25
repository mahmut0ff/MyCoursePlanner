import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetGamification } from '../../lib/api';
import { Flame, Star, Trophy } from 'lucide-react';
import type { GamificationData } from '../../types';

const GamificationWidget: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<GamificationData | null>(null);

  useEffect(() => {
    apiGetGamification().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const { level } = data;
  const progressPercent = level.nextLevelXp
    ? Math.round(((data.xp - level.xp) / (level.nextLevelXp - level.xp)) * 100)
    : 100;

  return (
    <div className="card overflow-hidden mb-6">
      {/* Level Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl font-bold">
              {level.level}
            </div>
            <div>
              <p className="text-sm text-white/70">{t('gamification.level')} {level.level}</p>
              <h3 className="text-lg font-bold">{t(`gamification.levels.${level.level}`, level.title)}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{data.xp} <span className="text-sm font-normal text-white/70">XP</span></p>
          </div>
        </div>
        {/* XP bar */}
        <div className="bg-white/20 rounded-full h-3 overflow-hidden">
          <div
            className="bg-white rounded-full h-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {level.nextLevelXp && (
          <p className="text-xs text-white/60 mt-1.5">
            {data.xp - level.xp} / {level.nextLevelXp - level.xp} XP → {t(`gamification.levels.${level.level + 1}`, level.nextLevelTitle || '')}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">{data.streak}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.streak')}</p>
        </div>
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Trophy className="w-4 h-4 text-emerald-500" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">{data.passedExams}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.passed')}</p>
        </div>
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">{data.badgeDetails?.length || 0}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.badges')}</p>
        </div>
      </div>

      {/* Badges */}
      {(data.badgeDetails?.length || 0) > 0 && (
        <div className="px-5 pb-4 pt-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('gamification.earned')}</p>
          <div className="flex flex-wrap gap-2">
            {data.badgeDetails?.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 rounded-full px-3 py-1.5 text-xs"
                title={b.description}
              >
                <span>{b.icon}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{t(`gamification.badges.${b.id}.title`, b.title)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationWidget;
