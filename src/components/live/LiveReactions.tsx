import React, { useState, useEffect, useRef } from 'react';
import type { LiveReactionType } from '../../types';

interface LiveReactionsProps {
  onReact: (type: LiveReactionType) => void;
  incomingReactions: { id: string; type: LiveReactionType; userName: string; createdAt: string }[];
}

const REACTIONS: LiveReactionType[] = ['👍', '😕', '🔥', '✋', '❓'];

interface FloatingEmoji {
  id: string;
  emoji: string;
  userName: string;
  x: number;
  startTime: number;
}

const LiveReactions: React.FC<LiveReactionsProps> = ({ onReact, incomingReactions }) => {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const lastSeenRef = useRef<string>('');

  // Track new reactions and add floating emojis
  useEffect(() => {
    if (incomingReactions.length === 0) return;
    const latest = incomingReactions[0]; // sorted desc
    if (latest.id === lastSeenRef.current) return;
    lastSeenRef.current = latest.id;

    const newFloat: FloatingEmoji = {
      id: latest.id,
      emoji: latest.type,
      userName: latest.userName,
      x: 10 + Math.random() * 80,
      startTime: Date.now(),
    };

    setFloating(prev => [...prev.slice(-15), newFloat]); // keep max 15

    // Auto remove after 3s
    setTimeout(() => {
      setFloating(prev => prev.filter(f => f.id !== newFloat.id));
    }, 3000);
  }, [incomingReactions]);

  const handleReact = (type: LiveReactionType) => {
    if (cooldown) return;
    onReact(type);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000); // 2s cooldown
  };

  return (
    <>
      {/* Floating emoji rain */}
      <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
        {floating.map(f => (
          <div
            key={f.id}
            className="absolute animate-float-up"
            style={{
              left: `${f.x}%`,
              bottom: '10%',
              animation: 'floatUp 3s ease-out forwards',
            }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-3xl drop-shadow-lg">{f.emoji}</span>
              <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap backdrop-blur-sm">
                {f.userName}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reaction buttons (students & teachers can both react) */}
      <div className="flex items-center gap-1.5">
        {REACTIONS.map(r => (
          <button
            key={r}
            onClick={() => handleReact(r)}
            disabled={cooldown}
            className={`
              w-10 h-10 flex items-center justify-center rounded-xl text-xl
              transition-all duration-200 hover:scale-125 active:scale-90
              ${cooldown 
                ? 'opacity-40 cursor-not-allowed grayscale' 
                : 'hover:bg-white/20 cursor-pointer'
              }
            `}
            title={r}
          >
            {r}
          </button>
        ))}
      </div>
    </>
  );
};

export default LiveReactions;
