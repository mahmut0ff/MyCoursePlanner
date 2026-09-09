/**
 * Кеш авторизации трогает горячий путь каждого запроса, поэтому проверяем не
 * только «работает», но и три места, где ошибка была бы дорогой: протухание,
 * несохранение ошибок и склейка одновременных загрузок.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTtlCache } from '../utils/ttl-cache';

describe('createTtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('внутри TTL загрузчик вызывается один раз', async () => {
    const load = vi.fn().mockResolvedValue('значение');
    const cache = createTtlCache<string>({ ttlMs: 30_000 });

    expect(await cache.remember('k', load)).toBe('значение');
    vi.setSystemTime(new Date('2026-09-09T12:00:29Z'));
    expect(await cache.remember('k', load)).toBe('значение');

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('после TTL читает заново', async () => {
    const load = vi.fn().mockResolvedValueOnce('первое').mockResolvedValueOnce('второе');
    const cache = createTtlCache<string>({ ttlMs: 30_000 });

    expect(await cache.remember('k', load)).toBe('первое');
    vi.setSystemTime(new Date('2026-09-09T12:00:31Z'));
    expect(await cache.remember('k', load)).toBe('второе');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('честный null кешируется — отсутствие документа тоже ответ', async () => {
    const load = vi.fn().mockResolvedValue(null);
    const cache = createTtlCache<string | null>({ ttlMs: 30_000 });

    expect(await cache.remember('k', load)).toBeNull();
    expect(await cache.remember('k', load)).toBeNull();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ошибка НЕ кешируется — иначе сбой квоты растянулся бы на весь TTL', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 8 }))
      .mockResolvedValueOnce('оправились');
    const cache = createTtlCache<string>({ ttlMs: 30_000 });

    await expect(cache.remember('k', load)).rejects.toThrow('Quota exceeded.');
    // Следующий запрос обязан попробовать снова, не дожидаясь протухания.
    expect(await cache.remember('k', load)).toBe('оправились');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('одновременные запросы одного ключа делят одну загрузку', async () => {
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((res) => { release = res; }));
    const cache = createTtlCache<string>({ ttlMs: 30_000 });

    const a = cache.remember('k', load);
    const b = cache.remember('k', load);
    release('одно чтение');

    expect(await a).toBe('одно чтение');
    expect(await b).toBe('одно чтение');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('разные ключи не смешиваются', async () => {
    const cache = createTtlCache<string>({ ttlMs: 30_000 });
    expect(await cache.remember('a', async () => 'A')).toBe('A');
    expect(await cache.remember('b', async () => 'B')).toBe('B');
    expect(await cache.remember('a', async () => 'подменённое')).toBe('A');
  });

  it('не растёт без предела — контейнер живёт часами', async () => {
    const cache = createTtlCache<number>({ ttlMs: 60_000, maxEntries: 3 });
    for (let i = 0; i < 10; i++) await cache.remember(`k${i}`, async () => i);
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('clear() выбрасывает всё', async () => {
    const load = vi.fn().mockResolvedValue('значение');
    const cache = createTtlCache<string>({ ttlMs: 30_000 });

    await cache.remember('k', load);
    cache.clear();
    await cache.remember('k', load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });
});
