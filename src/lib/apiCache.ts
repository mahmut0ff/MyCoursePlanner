/**
 * Кеш ответов списочных ручек: экран рисуется из прошлого ответа сразу, сеть
 * догоняет и подменяет данные (stale-while-revalidate).
 *
 * Зачем: страницы вроде расписания тянут по 3–4 списка за раз и до их прихода
 * показывают спиннер — при КАЖДОМ заходе, даже если данные не менялись с прошлой
 * минуты. Возврат на страницу в SPA размонтирует её состояние, поэтому без кеша
 * «назад» стоит столько же, сколько первый заход.
 *
 * Ключ ОБЯЗАН включать пользователя и филиал (см. cacheKey ниже):
 *  - хранилище переживает выход из аккаунта, а на общем компьютере под тем же
 *    браузером работает другой человек;
 *  - ответы ручек зависят от активного филиала — его штампует GET-перехватчик в
 *    api.ts, и в самом URL запроса он не всегда виден.
 *
 * Это НЕ замена нормальному состоянию: кеш только ускоряет первую отрисовку,
 * источник правды — всё тот же ответ сервера, который приходит следом.
 */
import { useEffect, useRef, useState } from 'react';

const NS = 'mcp.cache.v1:';

/** Дольше суток отдавать прошлый ответ уже неприлично — проще подождать сеть. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Entry<T> {
  /** Момент записи, ms. */
  at: number;
  v: T;
}

/**
 * Ключ кеша из частей. Пустые части выбрасываются, поэтому
 * cacheKey('sch.week', uid, null) и cacheKey('sch.week', uid) — один ключ; это
 * ровно то, что нужно для «Все филиалы» (branchId там осмысленно пуст).
 */
export function cacheKey(...parts: Array<string | number | null | undefined>): string {
  return parts.filter(p => p !== null && p !== undefined && p !== '').join('|');
}

export function cacheGet<T>(key: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): T | null {
  try {
    const raw = localStorage.getItem(NS + key);
    if (!raw) return null;
    const entry: Entry<T> = JSON.parse(raw);
    if (!entry || typeof entry.at !== 'number') return null;
    if (Date.now() - entry.at > maxAgeMs) {
      localStorage.removeItem(NS + key);
      return null;
    }
    return entry.v;
  } catch {
    // Приватный режим, битый JSON, отключённое хранилище — кеша просто нет.
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify({ at: Date.now(), v: value } as Entry<T>));
  } catch {
    // Чаще всего это переполнение квоты. Свой namespace вычищаем целиком: держать
    // половину кеша хуже, чем не держать его вовсе — «свежесть» станет случайной.
    cacheClear();
  }
}

/** Убрать всё, что накешировали мы. Остальные ключи приложения не трогаем. */
export function cacheClear(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch {
    /* нечего чистить */
  }
}

export interface CachedResource<T> {
  data: T;
  /** Тот же контракт, что у useState: страницы правят данные оптимистично. */
  setData: React.Dispatch<React.SetStateAction<T>>;
  /** Данные для текущего ключа уже есть (из кеша или из сети) — спиннер не нужен. */
  loaded: boolean;
  /** Идёт запрос. Вместе с loaded === true означает «обновляем на месте». */
  busy: boolean;
  reload: () => void;
}

/**
 * Список из кеша сразу, из сети — следом.
 *
 * `key === null` отключает загрузку (например, пока не известен пользователь).
 * `fetcher` может меняться каждый рендер: перезапрос запускает только смена
 * ключа, поэтому ключ обязан описывать ВСЁ, от чего зависит ответ.
 * `initial` читается только в момент смены ключа — держите его стабильным
 * (модульная константа), чтобы не плодить лишние ссылки.
 */
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  initial: T,
  maxAgeMs?: number,
): CachedResource<T> {
  const [data, setData] = useState<T>(() => (key ? cacheGet<T>(key, maxAgeMs) ?? initial : initial));
  const [loaded, setLoaded] = useState(() => (key ? cacheGet<T>(key, maxAgeMs) !== null : false));
  /** На монтировании с ключом запрос будет обязательно — значит, уже заняты. */
  const [busy, setBusy] = useState(!!key);
  const [tick, setTick] = useState(0);

  // Запрос перезапускает только смена ключа, поэтому свежий fetcher кладём в ref
  // отдельным эффектом: он объявлен ВЫШЕ загружающего и успевает обновиться до него.
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  // Смена ключа (другой филиал, другая неделя) — это ДРУГИЕ данные. Подменяем их
  // прямо в рендере: через useEffect экран успел бы показать кадр с чужими
  // данными под новым заголовком.
  const [ownerKey, setOwnerKey] = useState(key);
  if (key !== ownerKey) {
    const cached = key ? cacheGet<T>(key, maxAgeMs) : null;
    setOwnerKey(key);
    setData(cached ?? initial);
    setLoaded(cached !== null);
    setBusy(!!key);
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetcherRef.current()
      .then(v => {
        if (cancelled) return;
        setData(v);
        setLoaded(true);
        cacheSet(key, v);
      })
      .catch(() => {
        // Сеть отвалилась — на экране остаётся прошлый ответ. Затирать его пустотой
        // хуже: «нет занятий» и «не смогли спросить» выглядят одинаково, а значат разное.
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [key, tick]);

  // Оптимистичные правки (перенос занятия, удаление) тоже кладём в кеш — иначе
  // возврат на страницу показал бы то, что пользователь только что убрал.
  useEffect(() => {
    if (key && key === ownerKey && loaded) cacheSet(key, data);
  }, [key, ownerKey, loaded, data]);

  return {
    data,
    setData,
    loaded,
    busy,
    reload: () => { setBusy(true); setTick(t => t + 1); },
  };
}
