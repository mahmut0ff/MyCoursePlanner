import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionLink?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, actionLabel, actionLink, onAction }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
      <Icon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
      <h3 className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>}
      {actionLabel && actionLink && (
        <Link to={actionLink} className="btn-primary mt-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionLink && (
        <button onClick={onAction} className="btn-primary mt-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
