import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface RowMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Красный пункт — для отчисления и удаления. */
  danger?: boolean;
  /** Разделитель перед пунктом. */
  separated?: boolean;
}

interface Props {
  items: RowMenuItem[];
  label?: string;
  className?: string;
}

// Ширина рассчитана на самый длинный пункт — «Принять оплату · 12 500 с.»
const MENU_WIDTH = 264;
const ESTIMATED_ITEM_HEIGHT = 40;

/**
 * Меню действий строки. Рисуется через портал: контейнер таблицы обрезан
 * `overflow-hidden`, внутри него выпадающий список был бы срезан.
 */
const RowMenu: React.FC<Props> = ({ items, label = 'Действия', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = Math.min(items.length * ESTIMATED_ITEM_HEIGHT + 12, window.innerHeight - 16);
    // Разворачиваем вверх, если снизу не помещается.
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight ? Math.max(8, r.top - height - 6) : below;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top, left });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    // Меню спозиционировано по координатам экрана — при прокрутке оно бы «уехало».
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className={className} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="z-[80] py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={i}>
                {item.separated && <div className="my-1 border-t border-slate-100 dark:border-slate-700" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); item.onSelect(); }}
                  className={`w-full px-3.5 py-2 text-left text-sm font-medium flex items-center gap-2.5 transition-colors ${
                    item.danger
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default RowMenu;
