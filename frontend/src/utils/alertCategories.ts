/**
 * The SQL Monitor sidebar's alert categories are derived from dbo.Summary_Get
 * status columns (real backup/drive/AG/job/corruption health), which is a
 * completely different data source from the Alerts page's feed
 * (dbo.CollectionErrorLog + failed jobs). Routing every category through the
 * Alerts page with a keyword guess produced "no alerts" for real problems
 * (e.g. a stale-backup alert has no matching CollectionErrorLog entry to find).
 *
 * `destination` points each category at the page that actually holds its real
 * data. Only categories with no such page anywhere in the app (Corruption's
 * fleet-wide view, Monitoring stopped) fall back to the Alerts page — and that
 * fallback is a keyword search or explanatory banner, never presented as an
 * exact match.
 */
export interface AlertCategoryDef {
  slug: string;
  label: string;
  matchesAlertType?: 'job_failure';
  keyword?: string;
  destination?: (instanceId?: number) => string | undefined;
}

export const ALERT_CATEGORIES: AlertCategoryDef[] = [
  {
    slug: 'monitoring-stopped',
    label: 'Monitoring stopped',
    // No page in the app currently surfaces "which instances stopped
    // reporting" - always falls back to the Alerts page's explanatory banner.
  },
  {
    slug: 'backup',
    label: 'Backup',
    destination: id => (id != null ? `/instances/${id}/backups` : '/backups'),
  },
  {
    slug: 'job-failing',
    label: 'Job failing',
    matchesAlertType: 'job_failure',
    destination: id => (id != null ? `/jobs?instance=${id}&tab=failed` : '/jobs?tab=failed'),
  },
  {
    slug: 'disk-space',
    label: 'Disk space',
    destination: id => (id != null ? `/instances/${id}/drives` : '/drives'),
  },
  {
    slug: 'ag',
    label: 'AG',
    destination: id => (id != null ? `/instances/${id}/hadr` : '/availability-groups'),
  },
  {
    slug: 'corruption',
    label: 'Corruption',
    keyword: 'corrupt',
    // Instance detail already shows CorruptionStatus/LastGoodCheckDbTime; there's
    // no fleet-wide corruption view to link to, so that case falls back below.
    destination: id => (id != null ? `/instances/${id}` : undefined),
  },
  {
    slug: 'log-backup',
    label: 'Log backup',
    destination: id => (id != null ? `/instances/${id}/backups` : '/backups'),
  },
];

export function alertCategoryBySlug(slug: string | null | undefined): AlertCategoryDef | undefined {
  return ALERT_CATEGORIES.find(c => c.slug === slug);
}

export function alertCategoryByLabel(label: string): AlertCategoryDef | undefined {
  return ALERT_CATEGORIES.find(c => c.label === label);
}
