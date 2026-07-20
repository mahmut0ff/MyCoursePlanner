import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

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
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  busy = false,
  zIndex = 'z-50',
  onConfirm,
  onClose,
}) => {
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
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm ${zIndex} flex items-center justify-center p-4`}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} disabled={busy} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 text-sm text-slate-600 dark:text-slate-300">{message}</div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className={`${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
