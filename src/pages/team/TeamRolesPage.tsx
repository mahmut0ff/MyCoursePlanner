import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Shield, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import RoleMatrix from './RoleMatrix';
import MembersTab from './MembersTab';

type Tab = 'users' | 'roles';

const TeamRolesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { canRead } = usePermissions();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const [tab, setTab] = useState<Tab>('users');

  if (!isAdmin && !canRead('team')) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="flex items-center justify-center mx-auto mb-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-sm font-medium text-slate-900 dark:text-white">{t('team.denied', 'Доступ ограничен')}</h2>
        <p className="text-xs text-slate-500 mt-1">{t('team.deniedDesc', 'У вас нет прав на просмотр команды и ролей.')}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'users', label: t('team.tabUsers', 'Пользователи'), icon: Users },
    { key: 'roles', label: t('team.tabRoles', 'Роли и доступы'), icon: Shield },
  ];

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('team.title', 'Команда и роли')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs">
          {t('team.subtitle', 'Управляйте сотрудниками и тонко настраивайте их права доступа (RBAC).')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-4 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(tb => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 h-8 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary-600 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <tb.icon className="w-3.5 h-3.5" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'users' && <MembersTab isAdmin={isAdmin} />}
      {tab === 'roles' && <RoleMatrix isAdmin={isAdmin} />}
    </div>
  );
};

export default TeamRolesPage;
