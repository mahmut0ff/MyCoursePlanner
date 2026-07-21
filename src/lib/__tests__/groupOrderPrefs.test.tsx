import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGroupOrder, applyGroupOrder } from '../groupOrderPrefs';

/** Minimal stand-in for a Group — ordering only ever looks at `id`. */
const g = (id: string) => ({ id });
const ids = (items: { id: string }[]) => items.map((x) => x.id);

/** Drag `activeId` onto `overId`, treating every group as visible. */
function drag(result: { current: ReturnType<typeof useGroupOrder> }, all: string[], activeId: string, overId: string) {
  act(() => result.current.reorder(all, all, activeId, overId));
}

describe('applyGroupOrder', () => {
  it('leaves the server order alone when nothing was arranged', () => {
    expect(ids(applyGroupOrder([g('a'), g('b')], []))).toEqual(['a', 'b']);
  });

  it('surfaces groups the arrangement predates at the top', () => {
    // 'new' was created after the last drag — it must not sink to the bottom.
    expect(ids(applyGroupOrder([g('new'), g('a'), g('b')], ['b', 'a']))).toEqual(['new', 'b', 'a']);
  });

  it('ignores stored ids for groups that no longer exist', () => {
    expect(ids(applyGroupOrder([g('a')], ['deleted', 'a']))).toEqual(['a']);
  });
});

describe('useGroupOrder', () => {
  beforeEach(() => localStorage.clear());

  it('starts with no arrangement', () => {
    const { result } = renderHook(() => useGroupOrder('u1'));
    expect(result.current.hasCustomOrder).toBe(false);
    expect(ids(result.current.order([g('a'), g('b')]))).toEqual(['a', 'b']);
  });

  it('moves a group to where it was dropped', () => {
    const { result } = renderHook(() => useGroupOrder('u1'));
    drag(result, ['a', 'b', 'c'], 'c', 'a');
    expect(ids(result.current.order([g('a'), g('b'), g('c')]))).toEqual(['c', 'a', 'b']);
  });

  it('records the full list on the first drag, not just what was on screen', () => {
    // Searching narrows the table to b and c. Dragging there must not orphan 'a'
    // and 'd' into the never-arranged bucket, which would jump them to the top.
    const { result } = renderHook(() => useGroupOrder('u1'));
    const all = ['a', 'b', 'c', 'd'];
    act(() => result.current.reorder(all, ['b', 'c'], 'c', 'b'));
    expect(ids(result.current.order(all.map(g)))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps filtered-out rows in place when a visible row moves past them', () => {
    // Only a and d are on screen; b and c are hidden by the search. Swapping the
    // two visible rows must reuse their own slots and leave b, c untouched.
    const { result } = renderHook(() => useGroupOrder('u1'));
    const all = ['a', 'b', 'c', 'd'];
    act(() => result.current.reorder(all, ['a', 'd'], 'd', 'a'));
    expect(ids(result.current.order(all.map(g)))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('does not drop groups that are not currently loaded', () => {
    // The branch switcher narrows the fetch, so a drag only ever sees one branch.
    // The other branch's arrangement has to survive it.
    const { result } = renderHook(() => useGroupOrder('u1'));
    drag(result, ['a', 'b', 'c'], 'c', 'a');
    drag(result, ['a', 'b'], 'b', 'a'); // 'c' is out of scope for this fetch
    expect(ids(result.current.order([g('a'), g('b'), g('c')]))).toEqual(['c', 'b', 'a']);
  });

  it('ignores a drop on itself', () => {
    const { result } = renderHook(() => useGroupOrder('u1'));
    drag(result, ['a', 'b'], 'a', 'a');
    expect(result.current.hasCustomOrder).toBe(false);
  });

  it('persists across remounts', () => {
    const first = renderHook(() => useGroupOrder('u1'));
    drag(first.result, ['a', 'b'], 'b', 'a');
    first.unmount();

    const second = renderHook(() => useGroupOrder('u1'));
    expect(ids(second.result.current.order([g('a'), g('b')]))).toEqual(['b', 'a']);
  });

  it('keeps each account separate on a shared machine', () => {
    const a = renderHook(() => useGroupOrder('u1'));
    drag(a.result, ['x', 'y'], 'y', 'x');

    const b = renderHook(() => useGroupOrder('u2'));
    expect(b.result.current.hasCustomOrder).toBe(false);
    expect(ids(b.result.current.order([g('x'), g('y')]))).toEqual(['x', 'y']);
  });

  it('reset falls back to the server order', () => {
    const { result } = renderHook(() => useGroupOrder('u1'));
    drag(result, ['a', 'b'], 'b', 'a');
    expect(result.current.hasCustomOrder).toBe(true);

    act(() => result.current.reset());
    expect(ids(result.current.order([g('a'), g('b')]))).toEqual(['a', 'b']);
    // Cleared rather than left as an empty array behind the key.
    expect(localStorage.getItem('planula_group_order:u1')).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('planula_group_order:u1', '{not json');
    const { result } = renderHook(() => useGroupOrder('u1'));
    expect(result.current.hasCustomOrder).toBe(false);
  });
});
