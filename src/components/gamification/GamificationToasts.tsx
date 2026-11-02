import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import i18n from 'i18next';

export const showGamificationToasts = (newBadges: any[], leveledUp?: boolean) => {
  if (leveledUp) {
    // Fire confetti from the center
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.5 },
      colors: ['#8b5cf6', '#d946ef', '#f43f5e', '#10b981', '#fbbf24'],
      zIndex: 100000,
    });
    
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white dark:bg-slate-800 p-3 rounded-lg shadow-float flex items-center gap-3 text-slate-900 dark:text-slate-100 pointer-events-auto border border-slate-200 dark:border-slate-700`}>
         <div className="w-10 h-10 bg-primary-50 dark:bg-primary-950 rounded-lg flex items-center justify-center text-2xl shrink-0">
            ⭐
         </div>
         <div>
            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-0.5">{i18n.t('gamification.levelUpKicker', 'Повышение!')}</p>
            <h3 className="text-sm font-semibold leading-tight">{i18n.t('gamification.levelUp', 'Новый уровень!')}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{i18n.t('gamification.levelUpText', 'Вы достигли нового уровня. Так держать!')}</p>
         </div>
      </div>
    ), { duration: 6000, position: 'top-center' });
  }

  if (newBadges && newBadges.length > 0) {
    // Stagger toasts if multiple badges were unlocked simultaneously
    newBadges.forEach((badge, index) => {
      setTimeout(() => {
        // Subtle confetti from the bottom for badges
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.9 },
          zIndex: 100000,
        });

        toast.custom((t) => (
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-float flex items-center gap-3 pointer-events-auto`}>
            <div className="w-10 h-10 shrink-0 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-2xl">
              {badge.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-0.5">{i18n.t('gamification.newAchievement', 'Новое достижение!')}</p>
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-tight mb-0.5">{i18n.t(`gamification.badgesList.${badge.id}.title`, { defaultValue: String(badge.title ?? '') })}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">{i18n.t(`gamification.badgesList.${badge.id}.description`, { defaultValue: String(badge.description ?? '') })}</p>
            </div>
          </div>
        ), { duration: 6000, position: 'bottom-center' });
      }, index * 2500 + (leveledUp ? 2500 : 0));
    });
  }
};
