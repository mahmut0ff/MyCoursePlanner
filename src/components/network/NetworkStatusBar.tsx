import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Global network status bar — shows a warning banner when offline,
 * and a brief "Back online" confirmation when connectivity returns.
 */
const NetworkStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // Auto-hide "back online" after 3s
      setTimeout(() => setShowReconnected(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Offline banner
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg animate-in slide-in-from-top duration-200">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>{t('network.offline', 'Нет подключения к интернету. Данные могут быть неактуальны.')}</span>
      </div>
    );
  }

  // Brief "back online" confirmation
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-emerald-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg animate-in slide-in-from-top duration-200">
        <Wifi className="w-4 h-4 shrink-0" />
        <span>{t('network.online', 'Подключение восстановлено!')}</span>
      </div>
    );
  }

  return null;
};

export default NetworkStatusBar;
