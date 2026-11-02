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
    <div className="card overflow-hidden">
      {/* Level Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-50 dark:bg-primary-950 rounded-lg flex items-center justify-center text-lg font-semibold tabular-nums text-primary-700 dark:text-primary-300">
              {level.level}
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.level')} {level.level}</p>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(`gamification.levels.${level.level}`, level.title)}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.xp} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">XP</span></p>
          </div>
        </div>
        {/* XP bar */}
        <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary-600 rounded-full h-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {level.nextLevelXp && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex justify-between tabular-nums">
            <span>{data.xp - level.xp} / {level.nextLevelXp - level.xp} XP</span>
            <span>→ {t(`gamification.levels.${level.level + 1}`, level.nextLevelTitle || '')}</span>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.streak}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.streak')}</p>
        </div>
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Trophy className="w-4 h-4 text-emerald-500" />
            <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.passedExams}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.passed')}</p>
        </div>
        <div className="p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.badgeDetails?.length || 0}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('gamification.badges')}</p>
        </div>
      </div>

      {/* Badges */}
      {(data.badgeDetails?.length || 0) > 0 && (
        <div className="px-4 pb-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('gamification.earned')}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.badgeDetails?.map((b) => (
              <div
                key={b.id}
                className="inline-flex items-center gap-1 h-6 bg-slate-100 dark:bg-slate-700 rounded px-1.5 text-xs"
                title={t(`gamification.badgesList.${b.id}.description`, b.description)}
              >
                <span>{b.icon}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{t(`gamification.badgesList.${b.id}.title`, b.title)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationWidget;
