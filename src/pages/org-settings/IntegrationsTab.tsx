import React, { useEffect, useState } from 'react';
import { Save, Loader2, MessageCircle, Link2 } from 'lucide-react';
import { apiGetAIManagerSettings, apiUpdateAIManagerSettings } from '../../lib/api';
import type { OrgAIManagerSettings } from '../../types';
import toast from 'react-hot-toast';

export const IntegrationsTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [settings, setSettings] = useState<OrgAIManagerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    apiGetAIManagerSettings(organizationId)
      .then((res) => setSettings(res.data))
      .catch((err) => {
        console.error(err);
        toast.error('Не удалось загрузить интеграции');
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  const update = <K extends keyof OrgAIManagerSettings>(key: K, value: OrgAIManagerSettings[K]) => {
    setSettings(s => s ? { ...s, [key]: value } as OrgAIManagerSettings : null);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiUpdateAIManagerSettings(settings);
      toast.success('Интеграции сохранены (Telegram Webhook установлен)');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Ошибка связи с API или Telegram');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-500">Не удалось загрузить интеграции.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Telegram Integration ── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Telegram Бот + Webhooks</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Автоматическая синхронизация вебхуков для приема сообщений
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Bot Token (API Ключ от @BotFather)
          </label>
          <input
            type="text"
            value={settings.telegramBotToken || ''}
            onChange={e => update('telegramBotToken', e.target.value)}
            className="input"
            placeholder="Например: 1234567890:AAH_XYZ..."
          />
        </div>

        {settings.telegramBotUsername && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
            <Link2 className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm">
              <strong>Вебхук активен!</strong> Подключенный канал: <a href={`https://t.me/${settings.telegramBotUsername}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">@{settings.telegramBotUsername}</a>
            </div>
          </div>
        )}
      </div>

      {/* ── Save Action ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить и активировать Webhook
        </button>
      </div>
    </div>
  );
};
