import React from 'react';
import { useTranslation } from 'react-i18next';
import { Puzzle, Key, Webhook, Plus } from 'lucide-react';

const AdminIntegrationsPage: React.FC = () => {
  const { t } = useTranslation();

  const integrations = [
    { id: 'freedom_pay', name: 'Freedom Pay', status: 'active', icon: '💳', description: 'Payment processing' },
    { id: 'google_oauth', name: 'Google OAuth', status: 'active', icon: '🔐', description: 'Social login' },
    { id: 'sendgrid', name: 'SendGrid', status: 'inactive', icon: '📧', description: 'Email delivery' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.integrations')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('admin.integrations.subtitle')}</p>
        </div>
        <button className="btn-primary text-sm flex items-center gap-1"><Plus className="w-4 h-4" />{t('admin.integrations.addIntegration')}</button>
      </div>

      {/* Integrations */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Puzzle className="w-4 h-4" />{t('admin.integrations.connected')}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {integrations.map((i) => (
            <div key={i.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-xl">{i.icon}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{i.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{i.description}</p>
              </div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${i.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {i.status === 'active' ? t('common.active') : t('common.disabled')}
              </span>
              <button className="btn-secondary text-xs">{t('admin.integrations.configure')}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Webhooks & API Keys */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Webhook className="w-4 h-4" />Webhooks</h3>
          </div>
          <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('admin.integrations.noWebhooks')}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Key className="w-4 h-4" />API Keys</h3>
          </div>
          <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('admin.integrations.noApiKeys')}</div>
        </div>
      </div>
    </div>
  );
};

export default AdminIntegrationsPage;
