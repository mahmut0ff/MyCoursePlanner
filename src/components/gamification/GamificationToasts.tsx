import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';

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
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-4 rounded-2xl shadow-2xl flex items-center gap-4 text-white pointer-events-auto border border-white/20`}>
         <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-3xl shrink-0 shadow-inner">
            ⭐
         </div>
         <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-violet-200 mb-0.5">Повышение!</p>
            <h3 className="font-extrabold text-lg leading-tight">Новый уровень!</h3>
            <p className="text-white/80 text-xs mt-1">Вы достигли нового уровня. Так держать!</p>
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
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white dark:bg-slate-800 border-[3px] border-emerald-500 rounded-3xl p-4 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.5)] flex items-center gap-4 pointer-events-auto`}>
            <div className="w-16 h-16 shrink-0 bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/60 dark:to-emerald-800/40 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-emerald-300 dark:border-emerald-700/50">
              {badge.icon}
            </div>
            <div>
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 mb-0.5">Новое достижение!</p>
              <h4 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight mb-1">{badge.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug">{badge.description}</p>
            </div>
          </div>
        ), { duration: 6000, position: 'bottom-center' });
      }, index * 2500 + (leveledUp ? 2500 : 0));
    });
  }
};
