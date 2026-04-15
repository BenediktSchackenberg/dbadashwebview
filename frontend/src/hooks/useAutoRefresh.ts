import { useEffect, useRef, useState, useCallback } from 'react';

const DEFAULT_INTERVAL = 30;

/**
 * Auto-refresh hook with countdown timer and diff-aware state updates.
 *
 * @param fetchFn - async function that fetches fresh data and returns it
 * @param options - interval in seconds (default 30)
 * @returns { data, loading, countdown, lastRefresh, refresh }
 */
export function useAutoRefresh<T>(
  fetchFn: () => Promise<T>,
  options: {
    interval?: number;
    isEqual?: (prev: T, next: T) => boolean;
    merge?: (prev: T, next: T) => T;
  } = {},
) {
  const interval = options.interval ?? DEFAULT_INTERVAL;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(interval);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;
  const mergeRef = useRef(options.merge);
  mergeRef.current = options.merge;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetchRef.current();
      setData(prev => {
        if (prev === null) return result;
        if (mergeRef.current) return mergeRef.current(prev, result);
        return result;
      });
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
      setCountdown(interval);
    }
  }, [interval]);

  useEffect(() => { doFetch(); }, [doFetch]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { doFetch(); return interval; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [doFetch, interval]);

  return { data, loading, countdown, lastRefresh, refresh: doFetch, setData };
}

/**
 * Diff-merge helper for arrays keyed by a field.
 * Returns a new array only if something changed; unchanged items keep their reference.
 */
export function diffMergeArray<T extends Record<string, unknown>, K extends keyof T>(
  prev: T[],
  next: T[],
  keyField: K,
): T[] {
  if (prev.length === 0) return next;
  const prevMap = new Map(prev.map(r => [r[keyField], r]));
  let changed = prev.length !== next.length;
  const merged = next.map(row => {
    const old = prevMap.get(row[keyField]);
    if (!old) { changed = true; return row; }
    const keys = Object.keys(row) as Array<keyof T>;
    const same = keys.length === Object.keys(old).length && keys.every(k => row[k] === old[k]);
    if (same) return old;
    changed = true;
    return row;
  });
  return changed ? merged : prev;
}
