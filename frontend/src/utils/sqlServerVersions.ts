export interface SqlServerVersionInfo {
  major: number;
  year: string;
  label: string;
  shortLabel: string;
  color: string;
  extendedSupportEnd?: string;
  extendedSupportLabel?: string;
}

// Extended-support dates use Microsoft's published Pacific Time lifecycle dates:
// https://learn.microsoft.com/lifecycle/products/sql-server-2022
// https://learn.microsoft.com/lifecycle/products/sql-server-2025
export const SQL_SERVER_VERSIONS: readonly SqlServerVersionInfo[] = [
  {
    major: 17,
    year: '2025',
    label: 'SQL Server 2025',
    shortLabel: 'SQL 2025',
    color: '#06b6d4',
    extendedSupportEnd: '2036-01-06',
    extendedSupportLabel: 'Jan 2036',
  },
  {
    major: 16,
    year: '2022',
    label: 'SQL Server 2022',
    shortLabel: 'SQL 2022',
    color: '#3b82f6',
    extendedSupportEnd: '2033-01-11',
    extendedSupportLabel: 'Jan 2033',
  },
  {
    major: 15,
    year: '2019',
    label: 'SQL Server 2019',
    shortLabel: 'SQL 2019',
    color: '#8b5cf6',
    extendedSupportEnd: '2030-01-08',
    extendedSupportLabel: 'Jan 2030',
  },
  {
    major: 14,
    year: '2017',
    label: 'SQL Server 2017',
    shortLabel: 'SQL 2017',
    color: '#10b981',
    extendedSupportEnd: '2027-10-12',
    extendedSupportLabel: 'Oct 2027',
  },
  {
    major: 13,
    year: '2016',
    label: 'SQL Server 2016',
    shortLabel: 'SQL 2016',
    color: '#f59e0b',
    extendedSupportEnd: '2026-07-14',
    extendedSupportLabel: 'Jul 2026',
  },
  {
    major: 12,
    year: '2014',
    label: 'SQL Server 2014',
    shortLabel: 'SQL 2014',
    color: '#ef4444',
    extendedSupportEnd: '2024-07-09',
    extendedSupportLabel: 'Jul 2024',
  },
  {
    major: 11,
    year: '2012',
    label: 'SQL Server 2012',
    shortLabel: 'SQL 2012',
    color: '#f97316',
    extendedSupportEnd: '2022-07-12',
    extendedSupportLabel: 'Jul 2022',
  },
  {
    major: 10,
    year: '2008',
    label: 'SQL Server 2008',
    shortLabel: 'SQL 2008',
    color: '#ec4899',
  },
];

const versionByMajor = new Map(SQL_SERVER_VERSIONS.map(version => [version.major, version]));

export const SQL_SERVER_VERSION_COLORS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(SQL_SERVER_VERSIONS.map(version => [version.year, version.color])),
  Other: '#64748b',
});

export const SQL_SERVER_SUPPORT_TIMELINE = SQL_SERVER_VERSIONS
  .filter(version => version.extendedSupportEnd && version.extendedSupportLabel)
  .map(version => ({
    version: version.label,
    major: version.major,
    endDate: new Date(`${version.extendedSupportEnd}T23:59:59Z`),
    label: version.extendedSupportLabel!,
  }))
  .reverse();

export function sqlServerSupportTimelineForMajors(majorVersions: readonly unknown[]) {
  const counts = new Map<number, number>();

  majorVersions.forEach(value => {
    const major = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

    if (Number.isFinite(major)) {
      counts.set(major, (counts.get(major) ?? 0) + 1);
    }
  });

  return SQL_SERVER_SUPPORT_TIMELINE.flatMap(version => {
    const count = counts.get(version.major) ?? 0;
    return count > 0 ? [{ ...version, count }] : [];
  });
}

export function sqlServerVersionInfo(major: number | null | undefined): SqlServerVersionInfo | undefined {
  return major == null ? undefined : versionByMajor.get(major);
}

export function sqlServerVersionLabel(major: number | null | undefined): string {
  const version = sqlServerVersionInfo(major);
  return version?.label ?? `SQL Server (v${major || '?'})`;
}

export function sqlServerShortVersionLabel(major: number | null | undefined): string {
  const version = sqlServerVersionInfo(major);
  return version?.shortLabel ?? `SQL v${major || '?'}`;
}

export function sqlServerVersionYear(productVersion: string | null | undefined): string {
  if (!productVersion) return 'Other';

  const major = Number.parseInt(productVersion, 10);
  if (!Number.isFinite(major)) return 'Other';

  return sqlServerVersionInfo(major)?.year ?? `v${major}`;
}

export function sqlServerVersionColor(major: number | null | undefined): string {
  return sqlServerVersionInfo(major)?.color ?? SQL_SERVER_VERSION_COLORS.Other;
}
