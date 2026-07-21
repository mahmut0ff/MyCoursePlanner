import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface LazyListOptions {
  /** Сколько строк рисуем на первом кадре. */
  initial?: number;
  /** На сколько строк подрастаем каждый раз, когда сентинел доезжает до экрана. */
  step?: number;
  /**
   * Запас, за который начинаем подгрузку ДО того, как сентинел реально появится.
   * Смысл в том, чтобы следующая порция уже стояла в DOM к моменту, когда до неё
   * долистают: иначе на каждом шаге виден пустой хвост.
   */
  rootMargin?: string;
  /**
   * Любое значение, смена которого означает «набор строк другой» — фильтр, поиск,
   * филиал. Сбрасывает счётчик к initial, иначе после сужения выборки в DOM
   * остаётся висеть длинный хвост от прошлого списка.
   */
  resetKey?: unknown;
}

export interface LazyList<T> {
  /** Строки, которые нужно отрисовать прямо сейчас. */
  visible: T[];
  /** Всего строк в отфильтрованном наборе. */
  total: number;
  /** Есть ли что показывать дальше. */
  hasMore: boolean;
  /** Вешается на пустой div сразу после списка — он и есть триггер подгрузки. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Ручная подгрузка — для кнопки «Показать ещё» (клавиатура, скринридеры). */
  loadMore: () => void;
}

/**
 * Ленивый рендер уже загруженного массива вместо пагинации.
 *
 * Данные на этих экранах приходят одним запросом целиком, поэтому «lazy» здесь
 * про DOM, а не про сеть: тысяча строк в таблице роняет прокрутку, а нарезка по
 * мере долистывания — нет.
 *
 * Наблюдаем через IntersectionObserver, а не через onScroll: обработчик скролла
 * дёргается на каждый кадр и заставляет считать layout, а IO будит нас только на
 * пересечении границы.
 */
export function useLazyList<T>(items: T[], options: LazyListOptions = {}): LazyList<T> {
  const { initial = 40, step = 40, rootMargin = '800px', resetKey } = options;

  const [count, setCount] = useState(initial);

  // Сброс делаем в фазе рендера, а не в эффекте: эффект отработает уже ПОСЛЕ
  // кадра, и пользователь успеет увидеть хвост предыдущей выборки. Это описанный
  // в документации React приём «правка состояния прямо в рендере»: React тут же
  // перерисует компонент, не показав промежуточный результат.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  let effectiveCount = count;
  if (!Object.is(prevResetKey, resetKey)) {
    setPrevResetKey(resetKey);
    setCount(initial);
    effectiveCount = initial;
  }

  const total = items.length;
  const hasMore = effectiveCount < total;

  // Рефы, чтобы observer создавался один раз на узел, а не пересоздавался на
  // каждый прирост счётчика. Пишем их в эффекте, а не в рендере: колбэк IO
  // приходит асинхронно, много позже коммита, и к тому моменту они уже свежие.
  const totalRef = useRef(total);
  const hasMoreRef = useRef(hasMore);
  const intersectingRef = useRef(false);
  useEffect(() => {
    totalRef.current = total;
    hasMoreRef.current = hasMore;
  }, [total, hasMore]);

  const loadMore = useCallback(() => {
    setCount(c => (c < totalRef.current ? c + step : c));
  }, [step]);

  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      intersectingRef.current = false;
      if (!node) return;

      // Без IO (старый webview, тесты в jsdom) деградируем в «показать всё»:
      // лучше тяжёлый список, чем список, который невозможно долистать.
      if (typeof IntersectionObserver === 'undefined') {
        setCount(totalRef.current);
        return;
      }

      const io = new IntersectionObserver(
        entries => {
          const entry = entries[entries.length - 1];
          intersectingRef.current = entry.isIntersecting;
          if (entry.isIntersecting && hasMoreRef.current) loadMore();
        },
        { rootMargin }
      );
      io.observe(node);
      observerRef.current = io;
    },
    [loadMore, rootMargin]
  );

  // Если экран высокий, одной порции может не хватить, чтобы увести сентинел за
  // нижнюю границу. Он при этом остаётся видимым, но IO молчит — событие только
  // на ПЕРЕСЕЧЕНИИ. Поэтому после каждого прироста проверяем сами и,
  // если сентинел всё ещё в кадре, добираем. rAF даёт браузеру уложить layout.
  useEffect(() => {
    if (!hasMore || !intersectingRef.current) return;
    const raf = requestAnimationFrame(() => {
      if (intersectingRef.current && hasMoreRef.current) loadMore();
    });
    return () => cancelAnimationFrame(raf);
  }, [effectiveCount, hasMore, loadMore]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const visible = useMemo(
    () => (effectiveCount >= total ? items : items.slice(0, effectiveCount)),
    [items, effectiveCount, total]
  );

  return { visible, total, hasMore, sentinelRef, loadMore };
}
