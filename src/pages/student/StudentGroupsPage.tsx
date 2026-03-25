import { useTranslation } from 'react-i18next';

export default function StudentGroupsPage() {
  const { t } = useTranslation();
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        {t('student.groups', 'Мои группы')}
      </h1>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400">
          {t('common.comingSoon', 'Раздел находится в разработке')}
        </p>
      </div>
    </div>
  );
}
