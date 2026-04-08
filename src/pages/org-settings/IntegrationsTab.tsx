import React, { useEffect, useState } from 'react';
import { Save, Loader2, MessageCircle, Link2, Lock, HelpCircle } from 'lucide-react';
import { apiGetAIManagerSettings, apiUpdateAIManagerSettings } from '../../lib/api';
import type { OrgAIManagerSettings } from '../../types';
import toast from 'react-hot-toast';
import { usePlanGate } from '../../contexts/PlanContext';

export const IntegrationsTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [settings, setSettings] = useState<OrgAIManagerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { canAccess } = usePlanGate();
  
  const hasAccess = canAccess('ai');

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    // Only attempt to fetch settings if the user has a plan supporting it just to prevent extraneous API errors, though the API handles it normally.
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
    if (!settings || !hasAccess) return;
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
    <div className="space-y-6 relative">
      {!hasAccess && (
        <div className="absolute inset-0 z-10 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center border border-slate-200/50 dark:border-slate-700/50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm text-center border border-slate-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Интеграции недоступны</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Ваш текущий тариф не поддерживает расширенные настройки интеграций и автоматизацию Telegram.
            </p>
          </div>
        </div>
      )}

      {/* ── Telegram Integration ── */}
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 ${!hasAccess ? 'opacity-50 pointer-events-none filter blur-[1px]' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Telegram Бот AI-ассистента</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Собственный Telegram-бот для автоматической поддержки ваших клиентов (Webhooks синхронизируются автоматически)
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)} 
            className={`p-2 rounded-full transition-colors ${showHelp ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700'}`}
            title="Как настроить бота?"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {showHelp && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 text-sm text-blue-900 dark:text-blue-100 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Как создать своего бота?
            </h4>
            <ol className="list-decimal pl-5 space-y-2.5">
              <li>Откройте Telegram и найдите официального бота <b><a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline hover:text-blue-600">@BotFather</a></b>.</li>
              <li>Отправьте ему команду <code className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs">/newbot</code>.</li>
              <li>Придумайте <b>название бота</b> (оно будет отображаться в чатах над сообщениями, например: "AI Колледж").</li>
              <li>Укажите <b>уникальное имя (username)</b>, которое обязательно должно заканчиваться на <code className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs">bot</code> (например, <code>my_college_ai_bot</code>).</li>
              <li>Скопируйте полученный <b>HTTP API Token</b> и вставьте его напрямую в поле ниже.</li>
              <li className="pt-2 text-xs opacity-90 border-t border-blue-200/50 dark:border-blue-800/50">
                <i>Совет:</i> Прямо в чате с @BotFather вы можете загрузить логотип бота (<code className="font-mono">/setuserpic</code>), короткое описание (<code className="font-mono">/setdescription</code>) и информацию о вашем учебном центре (<code className="font-mono">/setabouttext</code>). Это сделает профиль бота привлекательным и профессиональным.
              </li>
            </ol>
          </div>
        )}

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
            disabled={!hasAccess}
          />
        </div>

        {settings.telegramBotUsername && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
            <Link2 className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm">
              <strong>Вебхук активен!</strong> Подключенный AI-ассистент: <a href={`https://t.me/${settings.telegramBotUsername}`} target="_blank" rel="noreferrer" className="font-bold hover:underline">@{settings.telegramBotUsername}</a>
            </div>
          </div>
        )}
      </div>

      {/* ── Save Action ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !hasAccess} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить и активировать Webhook
        </button>
      </div>
    </div>
  );
};
