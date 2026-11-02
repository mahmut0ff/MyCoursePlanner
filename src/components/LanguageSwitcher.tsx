import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { UI_LANGUAGES } from '../lib/locale';

const LANGS = UI_LANGUAGES;

interface Props {
  compact?: boolean;
}

const LanguageSwitcher: React.FC<Props> = ({ compact }) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const changeLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('lang', code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`${t('profile.language')}: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md transition-colors ${
          compact
            ? 'h-8 px-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            : 'px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
        }`}
      >
        <span className="text-base" aria-hidden>{current.flag}</span>
        {!compact && <span>{current.label}</span>}
        <Globe className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div role="listbox" aria-label={t('profile.language')} className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-pop p-1 min-w-[150px] z-50">
          {LANGS.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={lang.code === i18n.language}
              lang={lang.code === 'kg' ? 'ky' : lang.code}
              onClick={() => changeLang(lang.code)}
              className={`flex items-center gap-2 h-8 px-2 w-full rounded text-[13px] transition-colors ${
                lang.code === i18n.language
                  ? 'bg-slate-100 dark:bg-slate-700/60 text-slate-900 dark:text-slate-100 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              <span className="text-base" aria-hidden>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
