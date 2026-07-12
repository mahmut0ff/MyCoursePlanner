import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS, type Locale } from 'date-fns/locale';
import { kyrgyz } from '../../lib/dateFnsKyrgyz';

const DATE_FNS_LOCALES: Record<string, Locale> = { ru, en: enUS, kg: kyrgyz };

function localeFor(lang: string): Locale {
  return DATE_FNS_LOCALES[lang.split('-')[0]] ?? ru;
}

/**
 * Small colored status dot. Positioned absolutely by the caller when used as
 * an avatar overlay (`className="absolute -bottom-0.5 -right-0.5 ..."`).
 */
export const PresenceDot: React.FC<{ online: boolean; className?: string; title?: string }> = ({
  online,
  className = '',
  title,
}) => (
  <span
    title={title}
    className={`inline-block rounded-full ring-2 ring-white dark:ring-slate-800 ${
      online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
    } ${className}`}
  />
);

interface PresenceBadgeProps {
  online: boolean;
  lastSeenMs: number | null;
}

/**
 * "В сети" when online, otherwise "был(а) в сети <relative>" (or "не в сети"
 * when there has never been a heartbeat). Hover reveals the exact timestamp.
 */
export const PresenceBadge: React.FC<PresenceBadgeProps> = ({ online, lastSeenMs }) => {
  const { t, i18n } = useTranslation();

  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        {t('presence.online', 'В сети')}
      </span>
    );
  }

  const relative =
    lastSeenMs != null
      ? formatDistanceToNow(lastSeenMs, { addSuffix: true, locale: localeFor(i18n.language) })
      : null;

  return (
    <span
      title={lastSeenMs != null ? new Date(lastSeenMs).toLocaleString() : undefined}
      className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
    >
      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
      {relative
        ? t('presence.lastSeen', { time: relative, defaultValue: 'был(а) в сети {{time}}' })
        : t('presence.offline', 'Не в сети')}
    </span>
  );
};
