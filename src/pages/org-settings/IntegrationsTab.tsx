import React, { useEffect, useState } from 'react';
import { Save, Loader2, MessageCircle, Link2, Lock, HelpCircle } from 'lucide-react';
import { apiGetAIManagerOwnerSettings, apiUpdateAIManagerSettings } from '../../lib/api';
import type { OrgAIManagerSettings, AIManagerSettingsUpdate } from '../../types';
import toast from 'react-hot-toast';
import { useTranslation, Trans } from 'react-i18next';
import { usePlanGate } from '../../contexts/PlanContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export const IntegrationsTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OrgAIManagerSettings | null>(null);
  // The stored token never comes back from the server, so this field only takes a new one.
  const [newToken, setNewToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { canAccess } = usePlanGate();
  
  const hasAccess = canAccess('ai');

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    // Only attempt to fetch settings if the user has a plan supporting it just to prevent extraneous API errors, though the API handles it normally.
    apiGetAIManagerOwnerSettings(organizationId)
      .then((res) => setSettings(res.data))
      .catch((err) => {
        // The bot is the owner's to configure: anyone else gets a 403 here.
        if (err?.status === 403) {
          setNotOwner(true);
          return;
        }
        console.error(err);
        toast.error(t('integrations.loadFailed', 'Не удалось загрузить интеграции'));
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  const save = async (change: Omit<AIManagerSettingsUpdate, 'organizationId'>, successMessage: string) => {
    if (!hasAccess) return;
    setSaving(true);
    try {
      const res = await apiUpdateAIManagerSettings({ organizationId, ...change });
      setSettings(res.data);
      setNewToken('');
      setConfirmDisconnect(false);
      toast.success(successMessage);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('integrations.saveFailed', 'Ошибка связи с API или Telegram'));
    } finally {
      setSaving(false);
    }
  };

  // A new token connects that bot. With the field empty, saving re-registers the
  // webhook of the bot already connected, from the token the server keeps.
  const handleSave = () => {
    const token = newToken.trim();
    if (token) save({ telegramBotToken: token }, t('integrations.saved', 'Интеграции сохранены (Telegram Webhook установлен)'));
    else if (settings?.hasTelegramBot) save({ reconnectTelegram: true }, t('integrations.reconnected', 'Telegram Webhook установлен заново'));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (notOwner) {
    return <div className="text-center py-12 text-slate-500">{t('integrations.notOwner', 'Telegram-бота подключает только владелец организации.')}</div>;
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-500">{t('integrations.loadFailedLong', 'Не удалось загрузить интеграции.')}</div>;
  }

  const canSave = hasAccess && !saving && (!!newToken.trim() || settings.hasTelegramBot);

  return (
    <div className="space-y-6 relative">
      {!hasAccess && (
        <div className="absolute inset-0 z-10 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center border border-slate-200/50 dark:border-slate-700/50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm text-center border border-slate-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('integrations.unavailable', 'Интеграции недоступны')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {t('integrations.unavailableDesc', 'Ваш текущий тариф не поддерживает расширенные настройки интеграций и автоматизацию Telegram.')}
            </p>
          </div>
        </div>
      )}

      {/* ── Telegram Integration ── */}
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3 ${!hasAccess ? 'opacity-50 pointer-events-none filter blur-[1px]' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{t('integrations.botTitle', 'Telegram Бот AI-ассистента')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('integrations.botDesc', 'Собственный Telegram-бот для автоматической поддержки ваших клиентов (Webhooks синхронизируются автоматически)')}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)} 
            className={`p-2 rounded-full transition-colors ${showHelp ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700'}`}
            title={t('integrations.helpTitle', 'Как настроить бота?')}
            aria-label={t('integrations.helpTitle', 'Как настроить бота?')}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {showHelp && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 text-sm text-blue-900 dark:text-blue-100 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> {t('integrations.howTo', 'Как создать своего бота?')}
            </h4>
            <ol className="list-decimal pl-5 space-y-2.5">
              <li><Trans i18nKey="integrations.step1" defaults="Откройте Telegram и найдите официального бота <b><a>@BotFather</a></b>." components={{ b: <b />, a: <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline hover:text-blue-600" /> }} /></li>
              <li><Trans i18nKey="integrations.step2" defaults="Отправьте ему команду <code>/newbot</code>." components={{ code: <code className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs" /> }} /></li>
              <li><Trans i18nKey="integrations.step3" defaults="Придумайте <b>название бота</b> (оно будет отображаться в чатах над сообщениями, например: «AI Колледж»)." components={{ b: <b /> }} /></li>
              <li><Trans i18nKey="integrations.step4" defaults="Укажите <b>уникальное имя (username)</b>, которое обязательно должно заканчиваться на <code>bot</code> (например, <plain>my_college_ai_bot</plain>)." components={{ b: <b />, code: <code className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs" />, plain: <code /> }} /></li>
              <li><Trans i18nKey="integrations.step5" defaults="Скопируйте полученный <b>HTTP API Token</b> и вставьте его напрямую в поле ниже." components={{ b: <b /> }} /></li>
              <li className="pt-2 text-xs opacity-90 border-t border-blue-200/50 dark:border-blue-800/50">
                <Trans i18nKey="integrations.tip" defaults="<i>Совет:</i> Прямо в чате с @BotFather вы можете загрузить логотип бота (<code>/setuserpic</code>), короткое описание (<code>/setdescription</code>) и информацию о вашем учебном центре (<code>/setabouttext</code>). Это сделает профиль бота привлекательным и профессиональным." components={{ i: <i />, code: <code className="font-mono" /> }} />
              </li>
            </ol>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {settings.hasTelegramBot
              ? t('integrations.tokenLabelNew', 'Новый Bot Token (чтобы подключить другого бота)')
              : t('integrations.tokenLabel', 'Bot Token (API Ключ от @BotFather)')}
          </label>
          <input
            type="text"
            value={newToken}
            onChange={e => setNewToken(e.target.value)}
            className="input"
            placeholder={settings.hasTelegramBot
              ? t('integrations.tokenPhStored', 'Токен сохранён и скрыт. Вставьте новый, чтобы сменить бота')
              : t('integrations.tokenPh', 'Например: 1234567890:AAH_XYZ...')}
            autoComplete="off"
            disabled={!hasAccess}
          />
        </div>

        {settings.hasTelegramBot && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
            <Link2 className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm flex-1 min-w-0">
              <strong>{t('integrations.webhookActive', 'Вебхук активен!')}</strong> {t('integrations.connectedBot', 'Подключенный AI-ассистент:')}{' '}
              {settings.telegramBotUsername ? (
                <a href={`https://t.me/${settings.telegramBotUsername}`} target="_blank" rel="noreferrer" className="font-bold hover:underline">@{settings.telegramBotUsername}</a>
              ) : t('integrations.botConnected', 'бот подключён')}
            </div>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              disabled={saving || !hasAccess}
              className="shrink-0 text-sm font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {t('integrations.disconnect', 'Отключить')}
            </button>
          </div>
        )}
      </div>

      {/* ── Save Action ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={!canSave} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('integrations.saveActivate', 'Сохранить и активировать Webhook')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        title={t('integrations.disconnectTitle', 'Отключить Telegram-бота?')}
        message={t('integrations.disconnectMessage', 'Бот перестанет отвечать клиентам. Подключить его снова можно тем же токеном от @BotFather.')}
        confirmLabel={t('integrations.disconnect', 'Отключить')}
        danger
        busy={saving}
        onConfirm={() => save({ telegramBotToken: '' }, t('integrations.disconnected', 'Telegram-бот отключён'))}
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
};
