import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка — удаление денежных записей и прочие необратимые действия. */
  danger?: boolean;
  /** Запрос выполняется: кнопки заблокированы, закрыть нельзя. */
  busy?: boolean;
  /** Поверх другого модального окна нужен z-[60] — как в RefundModal. */
  zIndex?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Замена window.confirm. Только представление: тосты и запросы остаются на
 * вызывающей стороне, иначе диалог нельзя переиспользовать.
 */
const ConfirmDialog: React.FC<Props> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  zIndex = 'z-50',
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/30 ${zIndex} flex items-center justify-center p-4`}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-[480px] shadow-pop overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} disabled={busy} className="-mt-1 -mr-1 w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 disabled:opacity-50 transition-colors" aria-label={t('common.close', 'Закрыть')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-4 py-2 text-[13px] leading-5 text-slate-600 dark:text-slate-300">{message}</div>
        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            {cancelLabel ?? t('common.cancel', 'Отмена')}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel ?? t('common.confirm', 'Подтвердить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
