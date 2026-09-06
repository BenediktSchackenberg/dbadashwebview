import type { AvailabilityGroupSummaryRow } from '../api/types';

export type AvailabilityGroupHealth = 'Healthy' | 'Warning' | 'Critical';

export function availabilityGroupHealth(group: AvailabilityGroupSummaryRow): AvailabilityGroupHealth {
  const description = group.SyncHealth?.toUpperCase();
  if (group.synchronization_health === 2 || description === 'HEALTHY') return 'Healthy';
  if (group.synchronization_health === 1 || description === 'PARTIALLY_HEALTHY') return 'Warning';
  return 'Critical';
}

export function availabilityGroupFailoverReady(group: AvailabilityGroupSummaryRow): boolean {
  const value = group.is_failover_ready ?? group.FailoverReady;
  return value === true || value === 1;
}
