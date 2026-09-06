import { describe, expect, it } from 'vitest';
import type { MemoryClerkRow, MemoryCounterRow } from '../api/types';
import {
  aggregateLatestMemoryClerks,
  buildPageLifeExpectancySeries,
  summarizeMemoryCounters,
} from './memoryMetrics';

const counter = (
  instanceId: number,
  name: string,
  value: number,
  snapshotDate: string,
): MemoryCounterRow => ({
  InstanceID: instanceId,
  counter_name: name,
  cntr_value: value,
  SnapshotDate: snapshotDate,
});

describe('memory metrics', () => {
  it('uses each instance latest counter value for the fleet summary', () => {
    const counters = [
      counter(1, 'Page life expectancy', 900, '2026-09-01T09:00:00Z'),
      counter(1, 'Page life expectancy', 800, '2026-09-01T10:00:00Z'),
      counter(2, 'Page life expectancy', 500, '2026-09-01T10:00:00Z'),
      counter(1, 'Database Cache Memory (KB)', 1024, '2026-09-01T10:00:00Z'),
      counter(2, 'Database Cache Memory (KB)', 2048, '2026-09-01T10:00:00Z'),
      counter(1, 'Memory Grants Pending', 0, '2026-09-01T10:00:00Z'),
      counter(2, 'Memory Grants Pending', 2, '2026-09-01T10:00:00Z'),
    ];

    expect(summarizeMemoryCounters(counters)).toEqual({
      pageLifeExpectancy: 500,
      bufferPoolKb: 3072,
      memoryGrantsPending: 2,
    });
  });

  it('does not add historical clerk snapshots together', () => {
    const clerks: MemoryClerkRow[] = [
      { InstanceID: 1, clerk_type: 'CACHESTORE_SQLCP', pages_kb: 1024, SnapshotDate: '2026-09-01T09:00:00Z' },
      { InstanceID: 1, clerk_type: 'CACHESTORE_SQLCP', pages_kb: 2048, SnapshotDate: '2026-09-01T10:00:00Z' },
      { InstanceID: 2, clerk_type: 'CACHESTORE_SQLCP', pages_kb: 3072, SnapshotDate: '2026-09-01T10:00:00Z' },
    ];

    expect(aggregateLatestMemoryClerks(clerks)).toEqual([
      { name: 'CACHESTORE_SQLCP', sizeMB: 5 },
    ]);
  });

  it('uses the lowest PLE sample in each fleet time bucket', () => {
    const counters = [
      counter(1, 'Page life expectancy', 900, '2026-09-01T10:01:00Z'),
      counter(2, 'Page life expectancy', 400, '2026-09-01T10:03:00Z'),
      counter(1, 'Page life expectancy', 700, '2026-09-01T10:07:00Z'),
    ];

    expect(buildPageLifeExpectancySeries(counters, true).map(point => point.ple)).toEqual([400, 700]);
  });
});
