import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Menu, Sun, Moon, Bell, Search } from 'lucide-react';
import LanguageSwitcher from '../LanguageSwitcher';

interface TopbarProps {
  onMenuClick: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { isDark, toggle } = useTheme();

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between px-4 md:px-6 shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search bar — BigShop style */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-700/60 rounded-xl px-4 py-2 min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none w-full"
          />
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-[10px] font-mono text-slate-400 dark:text-slate-400">⌘K</kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher compact />

        <button
          onClick={toggle}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          {isDark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
        </button>

        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full ring-2 ring-white dark:ring-slate-800" />
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

        <div className="flex items-center gap-3 pl-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
            {profile?.displayName?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{profile?.displayName || 'User'}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
