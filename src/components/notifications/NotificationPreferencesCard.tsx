import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Settings2, ChevronDown, Loader2, MessageSquare, BookOpen, ClipboardCheck, Calendar, GraduationCap, BellRing } from 'lucide-react';
import { apiGetNotificationPreferences, apiSaveNotificationPreferences, type NotificationPreferences } from '../../lib/api';

/**
 * Личные настройки уведомлений.
 *
 * Показывает ровно те категории, которые сервер ДЕЙСТВИТЕЛЬНО учитывает при
 * доставке (utils/notifications → sendPush и телеграм чата). Тумблер, который
 * ничего не выключает, хуже отсутствующего: человек считает, что отписался.
 *
 * Сохраняем сразу по клику, без кнопки «Сохранить»: набор — это шесть
 * независимых переключателей, и отдельный шаг подтверждения здесь только
 * создаёт возможность потерять изменение, уйдя со страницы.
 */

const DEFAULTS: NotificationPreferences = {
  pushEnabled: true, chat: true, lessons: true, homework: true, schedule: true, exams: true,
};

type Key = keyof NotificationPreferences;

const ROWS: { key: Key; icon: typeof MessageSquare; labelRu: string; descRu: string }[] = [
  { key: 'chat', icon: MessageSquare, labelRu: 'Чат', descRu: 'Новые сообщения во внутреннем чате — в приложении и в телеграме' },
  { key: 'lessons', icon: BookOpen, labelRu: 'Уроки', descRu: 'Новые уроки и материалы' },
  { key: 'homework', icon: ClipboardCheck, labelRu: 'Домашние задания', descRu: 'Сданные и проверенные работы' },
  { key: 'schedule', icon: Calendar, labelRu: 'Расписание', descRu: 'Напоминания о занятиях, переносы, отметки о посещаемости' },
  { key: 'exams', icon: GraduationCap, labelRu: 'Экзамены и оценки', descRu: 'Результаты работ и выставленные оценки' },
];

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50
        ${checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform
        ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function NotificationPreferencesCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Key | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Тянем настройки при первом раскрытии, а не при монтировании: на странице
  // уведомлений этот блок свёрнут, и лишний запрос на каждый её показ не нужен.
  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    apiGetNotificationPreferences()
      .then((data) => setPrefs({ ...DEFAULTS, ...(data || {}) }))
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [open, loaded]);

  const update = async (key: Key, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);            // оптимистично: тумблер должен отвечать мгновенно
    setSaving(key);
    try {
      await apiSaveNotificationPreferences(next);
    } catch (e: any) {
      setPrefs(prefs);         // не сохранилось — возвращаем как было
      toast.error(e?.message || t('notifications.prefsSaveFailed', 'Не удалось сохранить настройку'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
      rounded-2xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left
          hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <Settings2 className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">
          {t('notifications.prefsTitle', 'Настройки уведомлений')}
        </span>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700 divide-y
          divide-slate-100 dark:divide-slate-700/50">
          <div className="flex items-center gap-3 px-4 py-3">
            <BellRing className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                {t('notifications.prefsAll', 'Все уведомления')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('notifications.prefsAllDesc', 'Общий выключатель — отключает и push, и сообщения в телеграме')}
              </div>
            </div>
            <Toggle
              checked={prefs.pushEnabled}
              disabled={saving === 'pushEnabled'}
              onChange={(v) => update('pushEnabled', v)}
            />
          </div>

          {ROWS.map(({ key, icon: Icon, labelRu, descRu }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  {t(`notifications.prefs.${key}`, labelRu)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t(`notifications.prefsDesc.${key}`, descRu)}
                </div>
              </div>
              <Toggle
                checked={prefs[key] && prefs.pushEnabled}
                // Общий выключатель главнее: пока он выключен, отдельная
                // категория ничего не решает, и делать вид, что решает, нечестно.
                disabled={!prefs.pushEnabled || saving === key}
                onChange={(v) => update(key, v)}
              />
            </div>
          ))}

          <p className="px-4 py-3 text-xs text-slate-400">
            {t('notifications.prefsChatHint', 'Отдельную переписку можно заглушить колокольчиком в самом чате — это не трогает остальные.')}
          </p>
        </div>
      )}
    </div>
  );
}
