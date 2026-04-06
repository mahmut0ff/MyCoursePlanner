import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Smartphone } from 'lucide-react';

/**
 * BeforeInstallPromptEvent is not yet in TS lib.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA Install Prompt — shows a dismissible banner when the browser
 * detects the app is installable. Auto-hides after install or dismiss.
 */
const PWAInstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('planula_pwa_dismissed') === 'true'
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect if already installed
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.matches) setInstalled(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('planula_pwa_dismissed', 'true');
  };

  if (!deferredPrompt || dismissed || installed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-slate-900/20 p-4 flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/30">
          <Smartphone className="w-6 h-6 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {t('pwa.installTitle', 'Установите приложение')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('pwa.installDesc', 'Быстрый доступ с рабочего стола — работает как нативное приложение')}
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              {t('pwa.install', 'Установить')}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {t('pwa.later', 'Позже')}
            </button>
          </div>
        </div>

        {/* Close */}
        <button
          onClick={handleDismiss}
          className="p-1 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
