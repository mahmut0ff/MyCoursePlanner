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
      <div className="card p-6 min-h-[300px] flex items-center justify-center">
         <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Find my rank
  const myRank = users.findIndex(u => u.uid === profile?.uid) + 1;
  const widgetUsers = users.slice(0, 5);

  const renderUser = (user: LeaderboardUser, index: number) => {
    const isMe = user.uid === profile?.uid;
    return (
      <div key={user.uid} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isMe ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'}`}>
        <div className="w-8 text-center shrink-0 flex justify-center">
          {index === 0 ? <Medal className="w-6 h-6 text-yellow-400 drop-shadow-sm" /> :
           index === 1 ? <Medal className="w-6 h-6 text-slate-300 drop-shadow-sm" /> :
           index === 2 ? <Medal className="w-6 h-6 text-amber-600 drop-shadow-sm" /> :
           <span className="text-slate-400 font-bold text-sm">#{index + 1}</span>}
        </div>
        
        <div className="relative shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-slate-100 dark:border-slate-800 shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-300 shadow-sm">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-violet-500 to-indigo-600 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm">
            {user.level}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate font-bold ${isMe ? 'text-amber-700 dark:text-amber-500' : 'text-slate-900 dark:text-white'}`}>
            {user.displayName} {isMe && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-md ml-1 font-semibold dark:bg-amber-900/50 dark:text-amber-300">Вы</span>}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-amber-500">{user.xp} XP</span>
            {user.streak > 2 && (
              <span className="flex items-center gap-0.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded text-[10px] font-bold">
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
                <div key={badgeId} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs shadow-sm" title={def.title}>
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
        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center shadow-inner">
              <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{t('gamification.leaderboardTitle', 'Рейтинг Студентов')}</h3>
              <p className="text-slate-500 text-xs text-left">Топ по организации</p>
            </div>
          </div>
        </div>
        
        <div className="p-2 sm:p-4 border-b border-slate-100 dark:border-slate-800">
          {widgetUsers.length > 0 ? (
            <div className="flex flex-col gap-1">
              {widgetUsers.map((user, index) => renderUser(user, index))}
            </div>
          ) : (
             <div className="py-8 text-center text-slate-500 text-sm">
               Пока нет данных для рейтинга
             </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/20 flex flex-col sm:flex-row items-center justify-between text-sm gap-3">
          {myRank > 0 ? (
            <span className="text-slate-500">Ваше место: <strong className="text-slate-900 dark:text-white">#{myRank}</strong></span>
          ) : (
            <span />
          )}
          {users.length > 5 && (
            <button
              onClick={() => setShowModal(true)}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-semibold flex items-center gap-1 transition-colors"
            >
              Смотреть весь рейтинг
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Рейтинг Студентов</h3>
                  <p className="text-slate-500 text-xs text-left">Топ {users.length} по организации</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-3 flex flex-col gap-1">
              {users.map((user, index) => renderUser(user, index))}
            </div>

            {myRank > 0 && myStats && (
              <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-400 w-8 text-center">#{myRank}</span>
                  <div className="text-sm text-left">
                    <p className="font-bold text-slate-900 dark:text-white">Ваш результат</p>
                    <p className="text-amber-500 font-semibold">{myStats.xp} XP</p>
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
