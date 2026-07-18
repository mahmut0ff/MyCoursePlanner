import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarPrefs } from '../sidebarPrefs';

describe('useSidebarPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('starts with nothing hidden', () => {
    const { result } = renderHook(() => useSidebarPrefs('u1'));
    expect(result.current.hidden).toEqual([]);
    expect(result.current.isHidden('students')).toBe(false);
  });

  it('hides and restores an item', () => {
    const { result } = renderHook(() => useSidebarPrefs('u1'));

    act(() => result.current.toggle('students'));
    expect(result.current.isHidden('students')).toBe(true);

    act(() => result.current.toggle('students'));
    expect(result.current.isHidden('students')).toBe(false);
  });

  it('does not duplicate an already-hidden id', () => {
    const { result } = renderHook(() => useSidebarPrefs('u1'));

    act(() => result.current.setHidden('students', true));
    act(() => result.current.setHidden('students', true));

    expect(result.current.hidden).toEqual(['students']);
  });

  it('persists across remounts', () => {
    const first = renderHook(() => useSidebarPrefs('u1'));
    act(() => first.result.current.toggle('finances'));
    first.unmount();

    const second = renderHook(() => useSidebarPrefs('u1'));
    expect(second.result.current.isHidden('finances')).toBe(true);
  });

  it('keeps each account separate on a shared machine', () => {
    const a = renderHook(() => useSidebarPrefs('u1'));
    act(() => a.result.current.toggle('finances'));

    const b = renderHook(() => useSidebarPrefs('u2'));
    expect(b.result.current.hidden).toEqual([]);
    expect(a.result.current.isHidden('finances')).toBe(true);
  });

  it('reset restores everything', () => {
    const { result } = renderHook(() => useSidebarPrefs('u1'));
    act(() => result.current.toggle('finances'));
    act(() => result.current.toggle('students'));
    expect(result.current.hidden).toHaveLength(2);

    act(() => result.current.reset());
    expect(result.current.hidden).toEqual([]);
    // Cleared rather than left as an empty array behind the key.
    expect(localStorage.getItem('planula_sidebar_hidden:u1')).toBeNull();
  });

  it('keeps two mounted consumers in step within the tab', () => {
    // The settings card and the live sidebar are mounted at once; `storage` only
    // fires cross-tab, so a same-tab change must still propagate.
    const sidebar = renderHook(() => useSidebarPrefs('u1'));
    const card = renderHook(() => useSidebarPrefs('u1'));

    act(() => card.result.current.toggle('finances'));

    expect(sidebar.result.current.isHidden('finances')).toBe(true);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('planula_sidebar_hidden:u1', '{not json');
    const { result } = renderHook(() => useSidebarPrefs('u1'));
    expect(result.current.hidden).toEqual([]);
  });
});
