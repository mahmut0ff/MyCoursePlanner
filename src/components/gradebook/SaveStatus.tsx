import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, AlertTriangle, Save } from 'lucide-react';
import type { SaveQueueState } from '../../hooks/useSaveQueue';

interface Props {
  state: SaveQueueState;
  pendingCount: number;
  savingCount: number;
  failedCount: number;
  lastSavedAt: number | null;
  onSave: () => void;
  onRetry: () => void;
}

/** «14:32» в часах организации не нуждается — это время СЕАНСА, а не запись в базе. */
const clock = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/**
 * Состояние записи журнала: сохранено / сохраняется / не сохранено.
 *
 * Показывать статус обязательно именно здесь. Оценки ставят подряд, по десятку
 * за минуту, глядя в тетрадь, а не в экран, — и до сих пор единственным
 * признаком записи была секундная крутилка в углу ячейки. Преподаватель не мог
 * ответить на вопрос «всё записалось?» иначе как перезагрузив страницу.
 *
 * Четыре состояния и ровно один смысл у каждого:
 *   idle    — на диске всё, что на экране;
 *   dirty   — правки ждут отправки (кнопка «Сохранить» отправляет немедленно);
 *   saving  — запрос летит;
 *   error   — сервер отказал, значение на экране НЕ записано, нужен повтор.
 *
 * Кнопка не исчезает в состоянии `idle`, а становится неактивной: пропадающий
 * элемент управления заставляет искать его глазами каждый раз.
 */
const SaveStatus: React.FC<Props> = ({
  state, pendingCount, savingCount, failedCount, lastSavedAt, onSave, onRetry,
}) => {
  const { t } = useTranslation();
  const unsavedCount = pendingCount + savingCount;

  const label = (() => {
    if (state === 'error') {
      return t('journal.saveFailed', 'Не сохранено: {{n}}', { n: failedCount });
    }
    if (state === 'saving') return t('journal.saving', 'Сохранение…');
    if (state === 'dirty') {
      return t('journal.unsaved', 'Не сохранено: {{n}}', { n: unsavedCount });
    }
    return lastSavedAt
      ? t('journal.savedAt', 'Сохранено в {{time}}', { time: clock(lastSavedAt) })
      : t('journal.allSaved', 'Все изменения сохранены');
  })();

  const tone =
    state === 'error' ? 'text-rose-600 dark:text-rose-400'
      : state === 'saving' ? 'text-slate-500 dark:text-slate-400'
        : state === 'dirty' ? 'text-amber-600 dark:text-amber-400'
          : 'text-emerald-600 dark:text-emerald-500';

  const Icon =
    state === 'error' ? AlertTriangle
      : state === 'saving' ? Loader2
        : state === 'dirty' ? Save
          : Check;

  return (
    <div className="flex items-center gap-3">
      {/* aria-live: статус меняется без участия пользователя, и озвучен он должен
          быть в момент изменения, а не при следующем обходе. */}
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`} aria-live="polite">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${state === 'saving' ? 'animate-spin' : ''}`} aria-hidden="true" />
        {label}
      </span>

      {state === 'error' ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
        >
          {t('journal.retrySave', 'Повторить')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={state === 'idle' || state === 'saving'}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-colors"
        >
          {t('journal.saveNow', 'Сохранить')}
        </button>
      )}
    </div>
  );
};

export default SaveStatus;
