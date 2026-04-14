import { describe, expect, it } from 'vitest';
import { diffMergeArray } from './useAutoRefresh';

describe('diffMergeArray', () => {
  it('returns the previous array when rows are unchanged', () => {
    const previous = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' },
    ];
    const next = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' },
    ];

    const merged = diffMergeArray(previous, next, 'id');

    expect(merged).toBe(previous);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).toBe(previous[1]);
  });

  it('preserves unchanged rows while replacing changed rows', () => {
    const previous = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' },
    ];
    const next = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'gamma' },
      { id: 3, name: 'delta' },
    ];

    const merged = diffMergeArray(previous, next, 'id');

    expect(merged).not.toBe(previous);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).toEqual(next[1]);
    expect(merged[1]).not.toBe(previous[1]);
    expect(merged[2]).toEqual(next[2]);
  });
});
