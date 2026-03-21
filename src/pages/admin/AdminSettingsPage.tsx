import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Palette, Mail, Globe, Shield } from 'lucide-react';

const AdminSettingsPage: React.FC = () => {
  const { t } = useTranslation();

  const sections = [
    { icon: Settings, title: t('admin.settings.general'), desc: t('admin.settings.generalDesc'), color: 'from-slate-500 to-slate-600' },
    { icon: Palette, title: t('admin.settings.branding'), desc: t('admin.settings.brandingDesc'), color: 'from-pink-500 to-rose-600' },
    { icon: Mail, title: t('admin.settings.emailTemplates'), desc: t('admin.settings.emailTemplatesDesc'), color: 'from-blue-500 to-indigo-600' },
    { icon: Globe, title: t('admin.settings.localization'), desc: t('admin.settings.localizationDesc'), color: 'from-emerald-500 to-teal-600' },
    { icon: Shield, title: t('admin.settings.security'), desc: t('admin.settings.securityDesc'), color: 'from-amber-500 to-orange-600' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.settings')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.settings.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <div key={s.title} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all cursor-pointer group">
            <div className={`w-10 h-10 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{s.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminSettingsPage;
