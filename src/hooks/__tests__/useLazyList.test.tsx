import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLazyList } from '../useLazyList';

/**
 * В jsdom нет IntersectionObserver, поэтому подменяем его вручную: тесту нужен
 * не браузерный скролл, а контроль над тем, КОГДА сентинел «появился».
 */
type Trigger = (isIntersecting: boolean) => void;
let triggers: Trigger[] = [];

class MockIO {
  cb: (entries: { isIntersecting: boolean }[]) => void;
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    this.cb = cb;
    triggers.push(visible => this.cb([{ isIntersecting: visible }]));
  }
  observe() {}
  disconnect() {}
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('useLazyList', () => {
  beforeEach(() => {
    triggers = [];
    vi.stubGlobal('IntersectionObserver', MockIO);
    // rAF синхронно: цепочка «сентинел всё ещё виден — добираем» должна
    // отработать внутри act(), а не уехать в следующий кадр.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('рисует только первую порцию, а не весь массив', () => {
    const { result } = renderHook(() => useLazyList(range(500), { initial: 40, step: 40 }));

    expect(result.current.visible).toHaveLength(40);
    expect(result.current.total).toBe(500);
    expect(result.current.hasMore).toBe(true);
  });

  it('короткий список отдаёт целиком и не просит продолжения', () => {
    const { result } = renderHook(() => useLazyList(range(10), { initial: 40 }));

    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore добирает ровно step и упирается в длину массива', () => {
    const { result } = renderHook(() => useLazyList(range(100), { initial: 40, step: 40 }));

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(80);

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(100);
    expect(result.current.hasMore).toBe(false);

    // Дальше расти некуда — счётчик не должен убегать за длину.
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(100);
  });

  it('появление сентинела подгружает следующую порцию', () => {
    const { result } = renderHook(() => useLazyList(range(500), { initial: 40, step: 40 }));

    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });
    act(() => triggers[0](true));

    expect(result.current.visible.length).toBeGreaterThan(40);
  });

  it('смена resetKey возвращает список к первой порции', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useLazyList(range(500), { initial: 40, step: 40, resetKey: key }),
      { initialProps: { key: 'search=' } }
    );

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(80);

    rerender({ key: 'search=иванов' });
    expect(result.current.visible).toHaveLength(40);
  });

  it('та же выборка после тихой перезагрузки не отматывает список назад', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useLazyList(items, { initial: 40, step: 40, resetKey: 'stable' }),
      { initialProps: { items: range(500) } }
    );

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(80);

    // Новый массив с тем же ключом — ровно то, что даёт refetch после правки.
    rerender({ items: range(500) });
    expect(result.current.visible).toHaveLength(80);
  });

  it('без IntersectionObserver показывает всё — список обязан оставаться проходимым', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useLazyList(range(120), { initial: 40 }));

    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });

    expect(result.current.visible).toHaveLength(120);
    expect(result.current.hasMore).toBe(false);
  });
});
