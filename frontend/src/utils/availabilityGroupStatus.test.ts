import { describe, expect, it } from 'vitest';
import type { AvailabilityGroupSummaryRow } from '../api/types';
import { availabilityGroupFailoverReady, availabilityGroupHealth } from './availabilityGroupStatus';

const group = (overrides: Partial<AvailabilityGroupSummaryRow>): AvailabilityGroupSummaryRow => ({
  group_id: '00000000-0000-0000-0000-000000000001',
  InstanceID: 1,
  ...overrides,
});

describe('availability group status', () => {
  it('maps repository synchronization health values', () => {
    expect(availabilityGroupHealth(group({ synchronization_health: 2 }))).toBe('Healthy');
    expect(availabilityGroupHealth(group({ synchronization_health: 1 }))).toBe('Warning');
    expect(availabilityGroupHealth(group({ synchronization_health: 0 }))).toBe('Critical');
  });

  it('keeps compatibility with descriptive health values', () => {
    expect(availabilityGroupHealth(group({ SyncHealth: 'HEALTHY' }))).toBe('Healthy');
    expect(availabilityGroupHealth(group({ SyncHealth: 'PARTIALLY_HEALTHY' }))).toBe('Warning');
  });

  it('handles SQL bit values for failover readiness', () => {
    expect(availabilityGroupFailoverReady(group({ is_failover_ready: true }))).toBe(true);
    expect(availabilityGroupFailoverReady(group({ is_failover_ready: 1 }))).toBe(true);
    expect(availabilityGroupFailoverReady(group({ is_failover_ready: 0 }))).toBe(false);
  });
});
