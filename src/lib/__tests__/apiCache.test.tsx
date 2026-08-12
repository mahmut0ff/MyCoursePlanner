/**
 * Кеш списочных ручек. Проверяем ровно те свойства, ради которых он заведён:
 * первая отрисовка без сети, отсутствие «кадра чужих данных» при смене ключа и
 * то, что оптимистичные правки не откатываются при возврате на страницу.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { cacheGet, cacheSet, cacheClear, cacheKey, useCachedResource } from '../apiCache';

const EMPTY: string[] = [];

/** Тестовый экран: показывает данные, признак готовности и умеет их править. */
const Probe: React.FC<{
  cacheId: string | null;
  fetcher: () => Promise<string[]>;
}> = ({ cacheId, fetcher }) => {
  const res = useCachedResource<string[]>(cacheId, fetcher, EMPTY);
  return (
    <div>
      <p data-testid="data">{res.data.join(',')}</p>
      <p data-testid="flags">{`${res.loaded ? 'loaded' : 'cold'}/${res.busy ? 'busy' : 'idle'}`}</p>
      <button onClick={() => res.setData(prev => [...prev, 'local'])}>add</button>
    </div>
  );
};

const flags = () => screen.getByTestId('flags').textContent;
const data = () => screen.getByTestId('data').textContent;

beforeEach(() => {
  localStorage.clear();
});

describe('хранилище', () => {
  it('кладёт и достаёт значение', () => {
    cacheSet('k', { a: 1 });
    expect(cacheGet('k')).toEqual({ a: 1 });
  });

  it('протухшее не отдаёт', () => {
    cacheSet('k', [1, 2]);
    expect(cacheGet('k', -1)).toBeNull();
    // И выбрасывает: незачем таскать мусор до конца сессии.
    expect(cacheGet('k')).toBeNull();
  });

  it('cacheClear трогает только свои ключи', () => {
    localStorage.setItem('mycourseplanner_active_branch', 'branchA');
    cacheSet('k', 1);
    cacheClear();
    expect(cacheGet('k')).toBeNull();
    expect(localStorage.getItem('mycourseplanner_active_branch')).toBe('branchA');
  });

  it('ключ склеивается из непустых частей', () => {
    expect(cacheKey('sch.week', 'uid', null, 'org')).toBe('sch.week|uid|org');
  });
});

describe('useCachedResource', () => {
  it('первая отрисовка идёт из кеша, сеть заменяет её следом', async () => {
    cacheSet('sch', ['из кеша']);
    const fetcher = vi.fn().mockResolvedValue(['из сети']);

    render(<Probe cacheId="sch" fetcher={fetcher} />);

    // Данные на экране ДО того, как ответила сеть, — ради этого всё и затевалось.
    expect(data()).toBe('из кеша');
    expect(flags()).toBe('loaded/busy');

    await waitFor(() => expect(data()).toBe('из сети'));
    expect(flags()).toBe('loaded/idle');
    expect(cacheGet('sch')).toEqual(['из сети']);
  });

  it('без кеша экран пуст и честно говорит, что данных ещё нет', async () => {
    const fetcher = vi.fn().mockResolvedValue(['первый ответ']);
    render(<Probe cacheId="sch" fetcher={fetcher} />);

    expect(flags()).toBe('cold/busy');
    await waitFor(() => expect(flags()).toBe('loaded/idle'));
    expect(data()).toBe('первый ответ');
  });

  it('смена ключа подменяет данные сразу, без кадра с чужими', async () => {
    cacheSet('branchA', ['урок филиала A']);
    cacheSet('branchB', ['урок филиала B']);
    const fetcher = vi.fn(() => new Promise<string[]>(() => {})); // сеть молчит

    const { rerender } = render(<Probe cacheId="branchA" fetcher={fetcher} />);
    expect(data()).toBe('урок филиала A');

    rerender(<Probe cacheId="branchB" fetcher={fetcher} />);
    // Никакого промежуточного рендера со списком филиала A: подмена в самом рендере.
    expect(data()).toBe('урок филиала B');
  });

  it('ключ без кеша обнуляет экран, а не оставляет прошлый филиал', () => {
    cacheSet('branchA', ['урок филиала A']);
    const fetcher = vi.fn(() => new Promise<string[]>(() => {}));

    const { rerender } = render(<Probe cacheId="branchA" fetcher={fetcher} />);
    rerender(<Probe cacheId="branchC" fetcher={fetcher} />);

    expect(data()).toBe('');
    expect(flags()).toBe('cold/busy');
  });

  it('упавший запрос оставляет прошлые данные на экране', async () => {
    cacheSet('sch', ['прошлый ответ']);
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));

    render(<Probe cacheId="sch" fetcher={fetcher} />);
    await waitFor(() => expect(flags()).toBe('loaded/idle'));

    // Пустой экран и «нет занятий» выглядят одинаково, а значат разное.
    expect(data()).toBe('прошлый ответ');
    expect(cacheGet('sch')).toEqual(['прошлый ответ']);
  });

  it('запрос, упавший без кеша, всё равно перестаёт быть busy', async () => {
    // На этом держится снятие спиннера: экран, который ждёт «loaded», крутился бы
    // вечно из-за одного отказавшего списка (например, нет прав на кабинеты).
    const fetcher = vi.fn().mockRejectedValue(new Error('403'));
    render(<Probe cacheId="sch" fetcher={fetcher} />);

    await waitFor(() => expect(flags()).toBe('cold/idle'));
    expect(data()).toBe('');
  });

  it('оптимистичная правка попадает в кеш', async () => {
    const fetcher = vi.fn().mockResolvedValue(['с сервера']);
    render(<Probe cacheId="sch" fetcher={fetcher} />);
    await waitFor(() => expect(data()).toBe('с сервера'));

    act(() => { screen.getByText('add').click(); });

    expect(data()).toBe('с сервера,local');
    // Возврат на страницу не должен воскрешать то, что пользователь уже убрал.
    expect(cacheGet('sch')).toEqual(['с сервера', 'local']);
  });

  it('без ключа запросов нет', () => {
    const fetcher = vi.fn().mockResolvedValue(['x']);
    render(<Probe cacheId={null} fetcher={fetcher} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(flags()).toBe('cold/idle');
  });
});
