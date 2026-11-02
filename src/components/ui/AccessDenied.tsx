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
      <ShieldAlert className="w-6 h-6 text-slate-400 mx-auto mb-3" />
      <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {title || t('access.deniedTitle', 'Доступ ограничен')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {description || t('access.deniedDesc', 'У вашей роли нет прав на этот раздел. Обратитесь к администратору организации.')}
      </p>
    </div>
  );
};

export default AccessDenied;
