/**
 * Кеш «значение живёт N миллисекунд», общий на контейнер функции.
 *
 * Зачем: каждый запрос к API проходит через verifyAuth, а та читает Firestore —
 * членство в организации, кастомную роль, тариф. Данные одни и те же для одного
 * человека много запросов подряд, а платим за них каждый раз. 09.09.2026 проект
 * упёрся в потолок чтений Firestore, и это заставило посчитать, сколько из них
 * лишние.
 *
 * Границы честно: кеш живёт в памяти контейнера, а контейнеров у Lambda много и
 * у каждой функции они свои. Параллельные запросы к РАЗНЫМ функциям он не
 * склеит — помогает там, где один и тот же контейнер обслуживает запросы
 * подряд. Это заметная экономия, но не замена сокращению самих выборок.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  /** Отдать из кеша или загрузить и запомнить. Ошибки НЕ кешируются. */
  remember(key: string, load: () => Promise<T>): Promise<T>;
  /** Сбросить всё. Нужен тестам и на случай, когда требуется свежее чтение. */
  clear(): void;
  /** Сколько живых записей сейчас лежит — для тестов и диагностики. */
  readonly size: number;
}

export interface TtlCacheOptions {
  ttlMs: number;
  /**
   * Потолок числа записей. Контейнер живёт часами, а ключи растут с числом
   * пользователей — без потолка это медленная утечка.
   */
  maxEntries?: number;
}

export function createTtlCache<T>({ ttlMs, maxEntries = 500 }: TtlCacheOptions): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  /**
   * Загрузки в полёте. Если два места спросят один ключ одновременно, оба ждут
   * одно чтение вместо двух — ровно тот случай, когда хендлер параллельно
   * выясняет права в нескольких организациях.
   */
  const inflight = new Map<string, Promise<T>>();

  const prune = () => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    // Map держит порядок вставки: если и после чистки тесно, выбрасываем самые
    // давние.
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  };

  return {
    remember(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);

      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = load().then(
        (value) => {
          entries.set(key, { value, expiresAt: Date.now() + ttlMs });
          inflight.delete(key);
          prune();
          return value;
        },
        (err) => {
          // Промах — не повод запомнить неудачу: закешированная ошибка квоты
          // растянула бы аварию на весь TTL вместо одного запроса.
          inflight.delete(key);
          throw err;
        },
      );
      inflight.set(key, promise);
      return promise;
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
