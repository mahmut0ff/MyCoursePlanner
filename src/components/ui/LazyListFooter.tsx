import React from 'react';
import { useTranslation } from 'react-i18next';

interface LazyListFooterProps {
  /** Сколько строк уже в DOM. */
  visibleCount: number;
  /** Сколько строк в отфильтрованном наборе целиком. */
  total: number;
  hasMore: boolean;
  sentinelRef: (node: HTMLElement | null) => void;
  onLoadMore: () => void;
  className?: string;
}

/**
 * Подвал ленивого списка: счётчик + невидимый триггер подгрузки.
 *
 * Когда показано всё — не рисуем ничего: список просто заканчивается, и лишняя
 * строка «показано 12 из 12» под каждой короткой таблицей была бы шумом.
 *
 * Кнопка дублирует автоподгрузку намеренно. Прокрутка колесом — не единственный
 * способ дойти до низа: с клавиатуры и со скринридером нужна явная цель, да и
 * при выключенном IntersectionObserver список должен оставаться проходимым.
 */
const LazyListFooter: React.FC<LazyListFooterProps> = ({
  visibleCount,
  total,
  hasMore,
  sentinelRef,
  onLoadMore,
  className = '',
}) => {
  const { t } = useTranslation();
  if (!hasMore) return null;

  return (
    <div className={`mt-4 px-1 ${className}`}>
      {/* Пустой узел под списком: IntersectionObserver ловит его заранее,
          с запасом rootMargin, поэтому следующая порция успевает отрисоваться
          до того, как пользователь упрётся в конец. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {t('common.lazyShown', 'Показано {{shown}} из {{total}}', { shown: visibleCount, total })}
        </p>
        <button
          type="button"
          onClick={onLoadMore}
          className="btn-secondary"
        >
          {t('common.showMore', 'Показать ещё')}
        </button>
      </div>
    </div>
  );
};

export default LazyListFooter;
