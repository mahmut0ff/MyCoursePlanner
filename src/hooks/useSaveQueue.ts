import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Очередь отложенных сохранений с ЧЕСТНЫМ статусом.
 *
 * ── Зачем ──
 * Журнал сохранял оценку так: оптимистично положить в состояние, завести таймер
 * на 400 мс, по таймеру отправить запрос. Пока таймер не сработал, на диске нет
 * ничего, а на экране оценка уже стоит — и выглядит сохранённой. Отсюда жалоба
 * «закрыл вкладку, а оценок нет»: между «вижу оценку» и «оценка записана» был
 * зазор, о котором интерфейс молчал.
 *
 * Потерять данные можно было в трёх местах:
 *   1. вкладку закрыли, пока не истёк debounce — таймер просто умер вместе со
 *      страницей;
 *   2. вкладку закрыли, пока запрос летел — соединение оборвалось;
 *   3. запрос упал — показывался всплывающий тост на пару секунд, значение
 *      откатывалось, и если преподаватель в этот момент смотрел в тетрадь, он
 *      не узнавал об этом никогда.
 *
 * Поэтому очередь ведёт два множества — `pending` (ещё не отправлено или летит)
 * и `failed` (отправлено и отказано), — и обязана уметь три вещи: сбросить всё
 * немедленно (`flush`), пережить уход со страницы и повторить упавшее
 * (`retryFailed`). Ошибка больше не откатывает значение молча: оно остаётся на
 * экране и числится несохранённым, пока не запишется.
 */

export type SaveQueueState = 'idle' | 'dirty' | 'saving' | 'error';

interface QueueHandlers<R> {
  /** Успешная запись: сюда приходит то, что вернул сервер. */
  onSuccess?: (result: R) => void;
  /** Отказ. Значение НЕ откатываем — см. заголовок. */
  onError?: (err: unknown) => void;
}

interface Options<T, R> {
  save: (payload: T) => Promise<R>;
  /** Пауза перед отправкой. Гасит серию правок одной ячейки в один запрос. */
  delay?: number;
}

interface QueueItem<T, R> {
  payload: T;
  handlers: QueueHandlers<R>;
}

export function useSaveQueue<T, R = unknown>({ save, delay = 400 }: Options<T, R>) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Поставлено в очередь, но ещё не отправлено. */
  const queued = useRef<Map<string, QueueItem<T, R>>>(new Map());
  /** Летит прямо сейчас. */
  const inFlight = useRef<Set<string>>(new Set());
  /** Отправлено и отказано — ждёт повтора. */
  const failed = useRef<Map<string, QueueItem<T, R>>>(new Map());

  // Счётчики в состоянии — они рисуют индикатор. Рефы выше нужны, чтобы
  // обработчики ухода со страницы видели АКТУАЛЬНЫЕ данные, а не замыкание.
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [savingCount, setSavingCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const sync = useCallback(() => {
    setPendingCount(queued.current.size);
    setSavingCount(inFlight.current.size);
    setFailedCount(failed.current.size);
  }, []);

  /** Отправить одну позицию. Никогда не бросает — отказ уходит в `failed`. */
  const send = useCallback(async (key: string, item: QueueItem<T, R>) => {
    queued.current.delete(key);
    failed.current.delete(key);
    inFlight.current.add(key);
    sync();
    try {
      const result = await save(item.payload);
      item.handlers.onSuccess?.(result);
      setLastSavedAt(Date.now());
    } catch (err) {
      // Ключ возвращается в очередь как упавший: значение на экране остаётся,
      // но интерфейс показывает, что оно не записано, и даёт повторить.
      failed.current.set(key, item);
      item.handlers.onError?.(err);
    } finally {
      inFlight.current.delete(key);
      sync();
    }
  }, [save, sync]);

  /** Поставить правку в очередь. Повторный вызов по тому же ключу вытесняет прежний. */
  const queue = useCallback((key: string, payload: T, handlers: QueueHandlers<R> = {}) => {
    queued.current.set(key, { payload, handlers });
    failed.current.delete(key);
    sync();

    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      const item = queued.current.get(key);
      if (item) void send(key, item);
    }, delay);
  }, [delay, send, sync]);

  /** Отправить ВСЁ немедленно, не дожидаясь пауз. */
  const flush = useCallback(async () => {
    for (const [key, timer] of Object.entries(timers.current)) {
      clearTimeout(timer);
      delete timers.current[key];
    }
    const batch = [...queued.current.entries()];
    await Promise.all(batch.map(([key, item]) => send(key, item)));
  }, [send]);

  /** Повторить то, что не записалось. */
  const retryFailed = useCallback(async () => {
    const batch = [...failed.current.entries()];
    await Promise.all(batch.map(([key, item]) => send(key, item)));
  }, [send]);

  // ── Уход со страницы ──
  // `visibilitychange` — главный крючок: он срабатывает и при переключении
  // вкладки, и при сворачивании окна, и при закрытии крышки ноутбука, причём
  // страница ещё жива и запрос успевает уйти. `pagehide` добавлен ради Safari на
  // iOS, где visibilitychange при закрытии вкладки может не прийти.
  useEffect(() => {
    const flushNow = () => {
      if (queued.current.size > 0) void flush();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushNow(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [flush]);

  // Предупреждение перед закрытием, пока что-то не записано. Единственный
  // способ не дать закрыть вкладку поверх несохранённой оценки: сам запрос в
  // этот момент отправить уже нельзя.
  const hasUnsaved = pendingCount + savingCount + failedCount > 0;
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Текст задаёт браузер; непустой returnValue нужен для старых движков.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  // Уход со страницы внутри приложения таймеры не ждёт: досылаем.
  useEffect(() => () => {
    for (const timer of Object.values(timers.current)) clearTimeout(timer);
    for (const [key, item] of queued.current.entries()) void send(key, item);
  }, [send]);

  const state: SaveQueueState =
    failedCount > 0 ? 'error'
      : savingCount > 0 ? 'saving'
        : pendingCount > 0 ? 'dirty'
          : 'idle';

  return { queue, flush, retryFailed, state, pendingCount, savingCount, failedCount, hasUnsaved, lastSavedAt };
}
