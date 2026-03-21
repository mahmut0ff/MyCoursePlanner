import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { Menu } from 'lucide-react';

interface TopbarProps {
  onMenuClick: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { t } = useTranslation();
  const { profile } = useAuth();

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dashboard.welcome')},</h2>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white -mt-0.5">
            {profile?.displayName || 'User'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="badge-primary capitalize">{profile?.role?.replace('_', ' ')}</span>
      </div>
    </header>
  );
};

export default Topbar;
