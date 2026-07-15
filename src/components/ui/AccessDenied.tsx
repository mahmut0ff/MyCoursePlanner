import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';

/**
 * Standard "your role can't see this" screen. Shown by PermissionRoute when a
 * member's resolved RBAC set lacks the required resource:action, and reusable by
 * any page that gates a section behind a granular permission.
 */
const AccessDenied: React.FC<{ title?: string; description?: string }> = ({ title, description }) => {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto text-center py-20 px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
        {title || t('access.deniedTitle', 'Доступ ограничен')}
      </h2>
      <p className="text-sm text-slate-500 mt-1">
        {description || t('access.deniedDesc', 'У вашей роли нет прав на этот раздел. Обратитесь к администратору организации.')}
      </p>
    </div>
  );
};

export default AccessDenied;
