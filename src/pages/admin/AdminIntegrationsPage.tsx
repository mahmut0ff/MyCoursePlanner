import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Puzzle, Key, Webhook, Plus, Copy, Trash2, Eye, EyeOff,
  ExternalLink, Check, RefreshCw, AlertTriangle,
} from 'lucide-react';

/* ── Types ── */
interface Integration {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  configFields: { key: string; label: string; type: 'text' | 'password'; placeholder: string }[];
  config: Record<string, string>;
  docsUrl?: string;
}

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastTriggered?: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed?: string;
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN PAGE                                         */
/* ═══════════════════════════════════════════════════ */
const AdminIntegrationsPage: React.FC = () => {
  const { t } = useTranslation();

  /* ── Integrations state ── */
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'google_oauth',
      name: 'Google OAuth',
      icon: '🔐',
      description: t('admin.integrations.googleDesc'),
      enabled: true,
      configFields: [
        { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'xxx.apps.googleusercontent.com' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '••••••••' },
        { key: 'redirectUri', label: 'Redirect URI', type: 'text', placeholder: 'https://yourapp.com/auth/callback' },
      ],
      config: { clientId: '', clientSecret: '', redirectUri: '' },
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    {
      id: 'freedom_pay',
      name: 'Freedom Pay',
      icon: '💳',
      description: t('admin.integrations.freedomPayDesc'),
      enabled: false,
      configFields: [
        { key: 'merchantId', label: 'Merchant ID', type: 'text', placeholder: 'MER-XXXX' },
        { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: '••••••••' },
        { key: 'callbackUrl', label: 'Callback URL', type: 'text', placeholder: 'https://yourapp.com/api/payment/callback' },
      ],
      config: { merchantId: '', secretKey: '', callbackUrl: '' },
    },
    {
      id: 'sendgrid',
      name: 'SendGrid',
      icon: '📧',
      description: t('admin.integrations.sendgridDesc'),
      enabled: false,
      configFields: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'SG.xxxx' },
        { key: 'fromEmail', label: 'From Email', type: 'text', placeholder: 'noreply@yourapp.com' },
        { key: 'fromName', label: 'From Name', type: 'text', placeholder: 'SabakHub' },
      ],
      config: { apiKey: '', fromEmail: '', fromName: '' },
    },
    {
      id: 'telegram',
      name: 'Telegram Bot',
      icon: '🤖',
      description: t('admin.integrations.telegramDesc'),
      enabled: false,
      configFields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...' },
        { key: 'chatId', label: 'Admin Chat ID', type: 'text', placeholder: '-100123456789' },
      ],
      config: { botToken: '', chatId: '' },
    },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  /* ── Webhooks state ── */
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('');

  /* ── API Keys state ── */
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ── Handlers ── */
  const toggleIntegration = (id: string) => {
    setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, enabled: !i.enabled } : i));
  };

  const updateConfig = (intId: string, key: string, value: string) => {
    setIntegrations((prev) => prev.map((i) => i.id === intId ? { ...i, config: { ...i.config, [key]: value } } : i));
  };

  const addWebhook = () => {
    if (!newWebhookUrl.trim()) return;
    const wh: WebhookItem = {
      id: Date.now().toString(),
      url: newWebhookUrl.trim(),
      events: newWebhookEvents.split(',').map((e) => e.trim()).filter(Boolean),
      active: true,
    };
    setWebhooks((p) => [...p, wh]);
    setNewWebhookUrl('');
    setNewWebhookEvents('');
  };

  const removeWebhook = (id: string) => setWebhooks((p) => p.filter((w) => w.id !== id));
  const toggleWebhook = (id: string) => setWebhooks((p) => p.map((w) => w.id === id ? { ...w, active: !w.active } : w));

  const generateApiKey = () => {
    if (!newKeyName.trim()) return;
    const key: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName.trim(),
      key: `mcp_live_sk_${Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`,
      created: new Date().toISOString().split('T')[0],
    };
    setApiKeys((p) => [...p, key]);
    setNewKeyName('');
    setRevealedKeys((s) => new Set(s).add(key.id));
  };

  const deleteApiKey = (id: string) => setApiKeys((p) => p.filter((k) => k.id !== id));

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys((s) => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  };

  const EVENT_OPTIONS = ['user.created', 'user.deleted', 'payment.success', 'payment.failed', 'exam.completed', 'org.created', 'org.suspended'];

  return (
    <div className="space-y-4">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.integrations')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('admin.integrations.subtitle')}</p>
        </div>
      </div>

      {/* ═══ Connected Services ═══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Puzzle className="w-3.5 h-3.5 text-slate-400" />{t('admin.integrations.connected')}</h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {integrations.map((intg) => (
            <div key={intg.id}>
              {/* Integration Row */}
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <div className="w-8 h-8 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-md flex items-center justify-center text-base">{intg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{intg.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{intg.description}</p>
                  </div>
                  {/* Mobile Toggle */}
                  <button
                    onClick={() => toggleIntegration(intg.id)}
                    className={`sm:hidden relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${intg.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${intg.enabled ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
                  {/* Desktop Toggle */}
                  <button
                    onClick={() => toggleIntegration(intg.id)}
                    className={`hidden sm:block relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${intg.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${intg.enabled ? 'left-4' : 'left-0.5'}`} />
                  </button>

                  {/* Configure Button */}
                  <button
                    onClick={() => setEditingId(editingId === intg.id ? null : intg.id)}
                    className={`btn-secondary flex-1 sm:flex-none ${editingId === intg.id ? 'ring-2 ring-primary-500/30 border-primary-500' : ''}`}
                  >
                    {editingId === intg.id ? t('common.close') : t('admin.integrations.configure')}
                  </button>

                  {intg.docsUrl && (
                    <a href={intg.docsUrl} target="_blank" rel="noreferrer" className="w-7 h-7 flex items-center justify-center rounded-md shrink-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Config Panel (expandable) */}
              {editingId === intg.id && (
                <div className="px-4 pb-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                  <div className="pt-4 space-y-3">
                    {intg.configFields.map((field) => (
                      <div key={field.key}>
                        <label className="label">{field.label}</label>
                        <div className="relative">
                          <input
                            type={field.type === 'password' && !showSecrets[`${intg.id}-${field.key}`] ? 'password' : 'text'}
                            value={intg.config[field.key] || ''}
                            onChange={(e) => updateConfig(intg.id, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="input pr-10"
                          />
                          {field.type === 'password' && (
                            <button
                              onClick={() => setShowSecrets((s) => ({ ...s, [`${intg.id}-${field.key}`]: !s[`${intg.id}-${field.key}`] }))}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              {showSecrets[`${intg.id}-${field.key}`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2">
                      <button className="btn-ghost inline-flex items-center gap-1.5"><RefreshCw className="w-3 h-3" />{t('admin.integrations.testConnection')}</button>
                      <button className="btn-primary">{t('admin.settings.saveChanges')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Webhooks ═══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Webhook className="w-3.5 h-3.5 text-slate-400" />{t('admin.integrations.webhooksTitle')}</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">{webhooks.length} {t('admin.integrations.configured')}</span>
        </div>

        {/* Existing Webhooks */}
        {webhooks.length > 0 && (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {webhooks.map((wh) => (
              <div key={wh.id} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => toggleWebhook(wh.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${wh.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${wh.active ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <p className="text-sm font-mono text-slate-900 dark:text-white truncate flex-1 block sm:hidden">{wh.url}</p>
                  <button onClick={() => removeWebhook(wh.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0 sm:hidden"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-slate-900 dark:text-white truncate hidden sm:block">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 md:mt-1">
                    {wh.events.map((e) => (
                      <span key={e} className="inline-flex items-center h-5 px-1.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{e}</span>
                    ))}
                  </div>
                </div>
                {wh.lastTriggered && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 hidden sm:block">{new Date(wh.lastTriggered).toLocaleDateString()}</span>
                )}
                <button onClick={() => removeWebhook(wh.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0 hidden sm:flex"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Add Webhook */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{t('admin.integrations.addWebhook')}</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="input flex-1"
            />
            <button onClick={addWebhook} className="btn-primary shrink-0 inline-flex items-center"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_OPTIONS.map((ev) => (
              <button
                key={ev}
                onClick={() => {
                  const evts = newWebhookEvents.split(',').map((e) => e.trim()).filter(Boolean);
                  if (evts.includes(ev)) {
                    setNewWebhookEvents(evts.filter((e) => e !== ev).join(', '));
                  } else {
                    setNewWebhookEvents([...evts, ev].join(', '));
                  }
                }}
                className={`inline-flex items-center h-6 px-2 rounded text-xs border transition-colors ${
                  newWebhookEvents.includes(ev)
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                    : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {ev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ API Keys ═══ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Key className="w-3.5 h-3.5 text-slate-400" />{t('admin.integrations.apiKeysTitle')}</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">{apiKeys.length} {t('common.active')}</span>
        </div>

        {/* API Key warning */}
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/20 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{t('admin.integrations.apiKeyWarning')}</p>
        </div>

        {/* Existing Keys */}
        {apiKeys.length > 0 && (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {apiKeys.map((ak) => (
              <div key={ak.id} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ak.name}</p>
                    <button onClick={() => deleteApiKey(ak.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors sm:hidden shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded flex-1 truncate sm:flex-none">
                      {revealedKeys.has(ak.id) ? ak.key : ak.key.slice(0, 12) + '••••••••••••'}
                    </code>
                    <button onClick={() => toggleReveal(ak.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
                      {revealedKeys.has(ak.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(ak.key, ak.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      {copiedId === ak.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t('admin.integrations.created')}: {ak.created}{ak.lastUsed ? ` · ${t('admin.integrations.lastUsed')}: ${ak.lastUsed}` : ''}</p>
                </div>
                <button onClick={() => deleteApiKey(ak.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors hidden sm:flex shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Generate Key */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{t('admin.integrations.generateKey')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('admin.integrations.keyNamePlaceholder')}
              className="input flex-1"
            />
            <button onClick={generateApiKey} className="btn-primary shrink-0 inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />{t('admin.integrations.generate')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminIntegrationsPage;
