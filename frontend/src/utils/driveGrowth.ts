import type { DriveGrowthPoint } from '../api/types';

export interface DriveGrowthEstimate {
  bytesPerDay: number | null;
  daysUntilFull: number | null;
  estFullDate: Date | null;
}

const EMPTY_ESTIMATE: DriveGrowthEstimate = { bytesPerDay: null, daysUntilFull: null, estFullDate: null };

// Below this span a rate is mostly measurement noise (e.g. two collection
// cycles a few minutes apart), so we'd rather show nothing than a wild
// extrapolation from it.
const MIN_SPAN_HOURS = 12;

/**
 * Derives a fill-rate projection from two REAL dbo.DriveSnapshot data points
 * (oldest/latest within the requested window) rather than assuming a fixed
 * growth period. Returns nulls when there isn't enough history yet, or when
 * free space isn't actually shrinking.
 */
export function computeDriveGrowth(point: DriveGrowthPoint | undefined): DriveGrowthEstimate {
  if (!point || point.dataPoints < 2 || point.oldestFreeSpace == null || point.latestFreeSpace == null) {
    return EMPTY_ESTIMATE;
  }
  if (!point.oldestSnapshotDate || !point.latestSnapshotDate) return EMPTY_ESTIMATE;

  const oldestMs = new Date(point.oldestSnapshotDate).getTime();
  const latestMs = new Date(point.latestSnapshotDate).getTime();
  const spanHours = (latestMs - oldestMs) / 3_600_000;
  if (!Number.isFinite(spanHours) || spanHours < MIN_SPAN_HOURS) return EMPTY_ESTIMATE;

  const spanDays = spanHours / 24;
  const bytesLost = point.oldestFreeSpace - point.latestFreeSpace; // positive = filling up
  const bytesPerDay = bytesLost / spanDays;

  if (bytesPerDay <= 0) {
    return { bytesPerDay, daysUntilFull: null, estFullDate: null };
  }

  const daysUntilFull = point.latestFreeSpace / bytesPerDay;
  const estFullDate = new Date(Date.now() + daysUntilFull * 86_400_000);
  return { bytesPerDay, daysUntilFull, estFullDate };
}
