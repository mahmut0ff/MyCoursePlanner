/**
 * Очередь сохранений журнала: три случая, из-за которых терялись оценки.
 *
 * Жалоба звучала так: «выставил оценки, закрыл вкладку — их нет». Прежняя схема
 * (оптимистично в состояние + setTimeout на 400 мс) теряла данные молча, и
 * проверить это было нечем, потому что таймер умирал вместе со страницей.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSaveQueue } from '../useSaveQueue';

/** Перевести вкладку в скрытое состояние так же, как это делает браузер. */
function hidePage() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
function showPage() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
}

describe('useSaveQueue', () => {
  beforeEach(() => { vi.useFakeTimers(); showPage(); });
  afterEach(() => { vi.useRealTimers(); });

  it('НЕ теряет правку, если вкладку закрыли до истечения паузы', async () => {
    const save = vi.fn().mockResolvedValue({ id: 'saved' });
    const { result } = renderHook(() => useSaveQueue<{ v: number }>({ save, delay: 400 }));

    act(() => { result.current.queue('cell-1', { v: 5 }); });
    // Пауза ещё не прошла — прежняя реализация здесь теряла всё.
    act(() => { vi.advanceTimersByTime(100); });
    expect(save).not.toHaveBeenCalled();

    act(() => { hidePage(); });

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ v: 5 });
  });

  it('серия правок одной ячейки уходит одним запросом с последним значением', async () => {
    const save = vi.fn().mockResolvedValue({ id: 'saved' });
    const { result } = renderHook(() => useSaveQueue<{ v: number }>({ save, delay: 400 }));

    act(() => { result.current.queue('cell-1', { v: 1 }); });
    act(() => { vi.advanceTimersByTime(100); result.current.queue('cell-1', { v: 2 }); });
    act(() => { vi.advanceTimersByTime(100); result.current.queue('cell-1', { v: 3 }); });
    act(() => { vi.advanceTimersByTime(400); });

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ v: 3 });
  });

  it('отказ сервера НЕ откатывает значение, а числится несохранённым и повторяется', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ id: 'saved' });
    const onError = vi.fn();
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useSaveQueue<{ v: number }>({ save, delay: 10 }));

    act(() => { result.current.queue('cell-1', { v: 7 }, { onSuccess, onError }); });
    act(() => { vi.advanceTimersByTime(10); });

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.state).toBe('error');
    expect(result.current.failedCount).toBe(1);
    expect(result.current.hasUnsaved).toBe(true);

    // Повтор — то же значение, без участия пользователя в вводе.
    await act(async () => { await result.current.retryFailed(); });

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(save).toHaveBeenLastCalledWith({ v: 7 });
    expect(result.current.failedCount).toBe(0);
    expect(result.current.state).toBe('idle');
  });

  it('«Сохранить» отправляет всё немедленно, не дожидаясь пауз', async () => {
    const save = vi.fn().mockResolvedValue({ id: 'saved' });
    const { result } = renderHook(() => useSaveQueue<{ v: number }>({ save, delay: 5000 }));

    act(() => {
      result.current.queue('a', { v: 1 });
      result.current.queue('b', { v: 2 });
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => { await result.current.flush(); });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('idle');
  });

  it('пока есть несохранённое, состояние честно отличается от «сохранено»', async () => {
    const save = vi.fn().mockResolvedValue({ id: 'saved' });
    const { result } = renderHook(() => useSaveQueue<{ v: number }>({ save, delay: 400 }));

    expect(result.current.state).toBe('idle');
    expect(result.current.hasUnsaved).toBe(false);

    act(() => { result.current.queue('cell-1', { v: 1 }); });
    expect(result.current.state).toBe('dirty');
    expect(result.current.hasUnsaved).toBe(true);

    act(() => { vi.advanceTimersByTime(400); });
    // vi.waitFor, а не waitFor из testing-library: последний крутит реальные
    // таймеры и под vi.useFakeTimers() просто виснет.
    await vi.waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.hasUnsaved).toBe(false);
    expect(result.current.lastSavedAt).not.toBeNull();
  });
});
