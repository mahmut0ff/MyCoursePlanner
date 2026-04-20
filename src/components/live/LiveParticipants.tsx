import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserMinus, Crown } from 'lucide-react';
import type { LiveParticipant } from '../../types';

interface LiveParticipantsProps {
  participants: LiveParticipant[];
  isTeacher: boolean;
  onKick?: (userId: string) => void;
}

const LiveParticipants: React.FC<LiveParticipantsProps> = ({ participants, isTeacher, onKick }) => {
  const { t } = useTranslation();
  const onlineCount = participants.filter(p => p.isOnline).length;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
        <Users className="w-4 h-4" />
        <span>{t('live.participants')}</span>
        <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full text-xs">
          {onlineCount} {t('live.online')}
        </span>
      </div>

      {/* Participant list */}
      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
        {participants.map(p => (
          <div
            key={p.userId}
            className="group relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs"
          >
            {/* Online indicator */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${p.isOnline ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-slate-500'}`} />

            {/* Avatar or initials */}
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white/80">
                {p.name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name */}
            <span className="text-white/90 font-medium truncate max-w-[80px]">
              {p.name}
            </span>

            {/* Teacher badge */}
            {p.role === 'teacher' && (
              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
            )}

            {/* Kick button (teacher only, not self) */}
            {isTeacher && p.role !== 'teacher' && onKick && (
              <button
                onClick={() => {
                  if (confirm(t('live.kickConfirm'))) onKick(p.userId);
                }}
                className="hidden group-hover:flex items-center justify-center w-4 h-4 rounded bg-red-500/80 hover:bg-red-500 text-white shrink-0 transition-colors"
                title={t('live.kick')}
              >
                <UserMinus className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveParticipants;
