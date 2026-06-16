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
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('team.denied', 'Доступ ограничен')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('team.deniedDesc', 'У вас нет прав на просмотр команды и ролей.')}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'users', label: t('team.tabUsers', 'Пользователи'), icon: Users },
    { key: 'roles', label: t('team.tabRoles', 'Роли и доступы'), icon: Shield },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1.5">{t('team.title', 'Команда и роли')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          {t('team.subtitle', 'Управляйте сотрудниками и тонко настраивайте их права доступа (RBAC).')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(tb => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <tb.icon className="w-4 h-4" />
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
