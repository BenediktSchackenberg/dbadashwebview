/**
 * Maps the SQL Monitor sidebar's alert categories (derived from dbo.Summary_Get
 * status columns) to how the Alerts page's actual feed (dbo.CollectionErrorLog +
 * failed jobs) can filter for them. "Job failing" has a real 1:1 field
 * (ParsedAlert.alertType === 'job_failure'); the rest have no exact equivalent in
 * that feed, so they map to a keyword the free-text search box can use instead of
 * pretending to be an exact category match. "Monitoring stopped" isn't a
 * collection-error record at all (it's the ABSENCE of recent data), so it has
 * neither an exact match nor a keyword.
 */
export interface AlertCategoryDef {
  slug: string;
  label: string;
  matchesAlertType?: 'job_failure';
  keyword?: string;
}

export const ALERT_CATEGORIES: AlertCategoryDef[] = [
  { slug: 'monitoring-stopped', label: 'Monitoring stopped' },
  { slug: 'backup', label: 'Backup', keyword: 'backup' },
  { slug: 'job-failing', label: 'Job failing', matchesAlertType: 'job_failure' },
  { slug: 'disk-space', label: 'Disk space', keyword: 'disk' },
  { slug: 'ag', label: 'AG', keyword: 'availability' },
  { slug: 'corruption', label: 'Corruption', keyword: 'corrupt' },
  { slug: 'log-backup', label: 'Log backup', keyword: 'log backup' },
];

export function alertCategoryBySlug(slug: string | null | undefined): AlertCategoryDef | undefined {
  return ALERT_CATEGORIES.find(c => c.slug === slug);
}

export function alertCategoryByLabel(label: string): AlertCategoryDef | undefined {
  return ALERT_CATEGORIES.find(c => c.label === label);
}
