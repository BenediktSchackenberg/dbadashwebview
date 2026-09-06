import type { MemoryClerkRow, MemoryCounterRow } from '../api/types';

const PAGE_LIFE_EXPECTANCY = 'page life expectancy';
const DATABASE_CACHE_MEMORY = 'database cache memory';
const MEMORY_GRANTS_PENDING = 'memory grants pending';

function numericValue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesCounter(row: MemoryCounterRow, name: string): boolean {
  return row.counter_name?.toLowerCase().includes(name) ?? false;
}

function latestValuesByInstance(counters: MemoryCounterRow[], name: string): number[] {
  const latest = new Map<number, { value: number; timestamp: number }>();

  for (const counter of counters) {
    if (!matchesCounter(counter, name)) continue;
    const value = numericValue(counter.cntr_value);
    if (value == null) continue;

    const current = latest.get(counter.InstanceID);
    const sampleTimestamp = timestamp(counter.SnapshotDate);
    if (!current || sampleTimestamp >= current.timestamp) {
      latest.set(counter.InstanceID, { value, timestamp: sampleTimestamp });
    }
  }

  return [...latest.values()].map(sample => sample.value);
}

export interface MemoryCounterSummary {
  pageLifeExpectancy: number | null;
  bufferPoolKb: number | null;
  memoryGrantsPending: number | null;
}

export function summarizeMemoryCounters(counters: MemoryCounterRow[]): MemoryCounterSummary {
  const pageLifeExpectancy = latestValuesByInstance(counters, PAGE_LIFE_EXPECTANCY);
  const bufferPool = latestValuesByInstance(counters, DATABASE_CACHE_MEMORY);
  const memoryGrants = latestValuesByInstance(counters, MEMORY_GRANTS_PENDING);

  return {
    // For a fleet summary the lowest current PLE is the useful pressure signal.
    pageLifeExpectancy: pageLifeExpectancy.length > 0 ? Math.min(...pageLifeExpectancy) : null,
    bufferPoolKb: bufferPool.length > 0 ? bufferPool.reduce((sum, value) => sum + value, 0) : null,
    memoryGrantsPending: memoryGrants.length > 0 ? memoryGrants.reduce((sum, value) => sum + value, 0) : null,
  };
}

export interface MemoryClerkSummary {
  name: string;
  sizeMB: number;
}

export function aggregateLatestMemoryClerks(clerks: MemoryClerkRow[], limit = 15): MemoryClerkSummary[] {
  const latestByInstanceAndClerk = new Map<string, MemoryClerkRow>();

  for (const clerk of clerks) {
    const name = clerk.clerk_type || clerk.clerk_name || 'Unknown';
    const key = `${clerk.InstanceID}:${name}`;
    const current = latestByInstanceAndClerk.get(key);

    if (!current || timestamp(clerk.SnapshotDate) >= timestamp(current.SnapshotDate)) {
      latestByInstanceAndClerk.set(key, clerk);
    }
  }

  const totals = new Map<string, number>();
  for (const clerk of latestByInstanceAndClerk.values()) {
    const name = clerk.clerk_type || clerk.clerk_name || 'Unknown';
    totals.set(name, (totals.get(name) ?? 0) + (numericValue(clerk.pages_kb) ?? 0));
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, kb]) => ({
      name: name.length > 30 ? `${name.slice(0, 30)}...` : name,
      sizeMB: Math.round(kb / 1024),
    }));
}

export interface PageLifeExpectancyPoint {
  timestamp: number;
  ple: number;
}

export function buildPageLifeExpectancySeries(
  counters: MemoryCounterRow[],
  aggregateInstances: boolean,
): PageLifeExpectancyPoint[] {
  const samples = counters
    .filter(counter => matchesCounter(counter, PAGE_LIFE_EXPECTANCY))
    .map(counter => ({
      timestamp: timestamp(counter.SnapshotDate),
      ple: numericValue(counter.cntr_value),
    }))
    .filter((sample): sample is PageLifeExpectancyPoint => sample.timestamp > 0 && sample.ple != null);

  if (!aggregateInstances) {
    return samples.sort((a, b) => a.timestamp - b.timestamp);
  }

  const fiveMinutes = 5 * 60 * 1000;
  const fleetMinimumByBucket = new Map<number, number>();
  for (const sample of samples) {
    const bucket = Math.floor(sample.timestamp / fiveMinutes) * fiveMinutes;
    const current = fleetMinimumByBucket.get(bucket);
    fleetMinimumByBucket.set(bucket, current == null ? sample.ple : Math.min(current, sample.ple));
  }

  return [...fleetMinimumByBucket.entries()]
    .map(([sampleTimestamp, ple]) => ({ timestamp: sampleTimestamp, ple }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
