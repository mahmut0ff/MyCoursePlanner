import { useState } from 'react';
import { Users } from 'lucide-react';

interface ChatAvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  type?: 'direct' | 'group';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name[0]?.toUpperCase() || '?';
}

export default function ChatAvatar({ src, name, size = 'md', type = 'direct', className = '' }: ChatAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  const colorClasses = type === 'direct'
    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';

  return (
    <div className={`${sizeMap[size]} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${colorClasses} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : type === 'group' && !src ? (
        <Users className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'} />
      ) : (
        <span className="font-bold leading-none">{getInitials(name)}</span>
      )}
    </div>
  );
}
