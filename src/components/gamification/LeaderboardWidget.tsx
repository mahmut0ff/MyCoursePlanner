import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetGamificationLeaderboard, apiGetGamification } from '../../lib/api';
import { Trophy, Medal, Flame, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { GamificationData } from '../../types';

interface LeaderboardUser {
  uid: string;
  displayName: string;
  avatarUrl: string;
  pinnedBadges: string[];
  xp: number;
  level: number;
  streak: number;
}

const LeaderboardWidget: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myStats, setMyStats] = useState<GamificationData | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGetGamificationLeaderboard(profile?.activeOrgId, 100),
      apiGetGamification()
    ]).then(([leaderboardData, gamificationData]) => {
      setUsers(leaderboardData || []);
      setMyStats(gamificationData);
    }).catch(console.error).finally(() => setLoading(false));
  }, [profile?.activeOrgId]);

  if (loading) {
    return (
      <div className="card p-4 min-h-[300px] flex items-center justify-center">
         <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-primary-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Find my rank
  const myRank = users.findIndex(u => u.uid === profile?.uid) + 1;
  const widgetUsers = users.slice(0, 5);

  const renderUser = (user: LeaderboardUser, index: number) => {
    const isMe = user.uid === profile?.uid;
    return (
      <div key={user.uid} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors ${isMe ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}`}>
        <div className="w-6 text-center shrink-0 flex justify-center">
          {index === 0 ? <Medal className="w-4 h-4 text-yellow-400" /> :
           index === 1 ? <Medal className="w-4 h-4 text-slate-300" /> :
           index === 2 ? <Medal className="w-4 h-4 text-amber-600" /> :
           <span className="text-slate-400 font-medium text-xs tabular-nums">#{index + 1}</span>}
        </div>
        
        <div className="relative shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-700 dark:text-slate-200">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary-600 border border-white dark:border-slate-900 rounded-full flex items-center justify-center text-[9px] font-semibold text-white">
            {user.level}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate font-medium ${isMe ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {user.displayName} {isMe && <span className="inline-flex items-center h-4 text-[10px] bg-amber-100 text-amber-700 px-1 rounded ml-1 font-medium dark:bg-amber-900/30 dark:text-amber-400">{t('chat.you', 'Вы')}</span>}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{user.xp} XP</span>
            {user.streak > 2 && (
              <span className="inline-flex items-center gap-0.5 h-4 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1 rounded text-[10px] font-medium tabular-nums">
                <Flame className="w-3 h-3" /> {user.streak}
              </span>
            )}
          </div>
        </div>
        
        {user.pinnedBadges && user.pinnedBadges.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {myStats?.allBadgeDefs && user.pinnedBadges.map(badgeId => {
              const def = myStats.allBadgeDefs?.[badgeId];
              if (!def) return null;
              return (
                <div key={badgeId} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs" title={t(`gamification.badgesList.${badgeId}.title`, def.title)}>
                   {def.icon}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('gamification.leaderboardTitle', 'Рейтинг Студентов')}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs text-left">{t('gamification.topInOrg', 'Топ по организации')}</p>
            </div>
          </div>
        </div>
        
        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
          {widgetUsers.length > 0 ? (
            <div className="flex flex-col gap-1">
              {widgetUsers.map((user, index) => renderUser(user, index))}
            </div>
          ) : (
             <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
               {t('gamification.noLeaderboardData', 'Пока нет данных для рейтинга')}
             </div>
          )}
        </div>

        <div className="px-4 py-2 flex flex-col sm:flex-row items-center justify-between text-sm gap-2">
          {myRank > 0 ? (
            <span className="text-slate-500 dark:text-slate-400">{t('gamification.yourRank', 'Ваше место:')} <strong className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">#{myRank}</strong></span>
          ) : (
            <span />
          )}
          {users.length > 5 && (
            <button
              onClick={() => setShowModal(true)}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium flex items-center gap-1 transition-colors"
            >
              {t('gamification.viewFullLeaderboard', 'Смотреть весь рейтинг')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/30" onClick={() => setShowModal(false)}>
          <div 
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-[640px] shadow-pop overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('gamification.leaderboardTitle', 'Рейтинг Студентов')}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs text-left">{t('gamification.topNInOrg', 'Топ {{n}} по организации', { n: users.length })}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                aria-label={t('common.close', 'Закрыть')}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
              {users.map((user, index) => renderUser(user, index))}
            </div>

            {myRank > 0 && myStats && (
              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums text-slate-400 w-8 text-center">#{myRank}</span>
                  <div className="text-sm text-left">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{t('gamification.yourResult', 'Ваш результат')}</p>
                    <p className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">{myStats.xp} XP</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LeaderboardWidget;
