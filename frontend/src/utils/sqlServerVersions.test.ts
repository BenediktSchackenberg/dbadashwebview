import { describe, expect, it } from 'vitest';
import {
  SQL_SERVER_SUPPORT_TIMELINE,
  sqlServerSupportTimelineForMajors,
  sqlServerShortVersionLabel,
  sqlServerVersionLabel,
  sqlServerVersionYear,
} from './sqlServerVersions';

describe('SQL Server version metadata', () => {
  it('recognizes SQL Server 2025 in product version strings', () => {
    expect(sqlServerVersionYear('17.0.1000.7')).toBe('2025');
    expect(sqlServerVersionLabel(17)).toBe('SQL Server 2025');
    expect(sqlServerShortVersionLabel(17)).toBe('SQL 2025');
  });

  it('keeps SQL Server 2022 separate from SQL Server 2025', () => {
    expect(sqlServerVersionYear('16.0.4215.2')).toBe('2022');
  });

  it('does not silently classify future major versions as SQL Server 2025', () => {
    expect(sqlServerVersionYear('18.0.1.0')).toBe('v18');
    expect(sqlServerVersionLabel(18)).toBe('SQL Server (v18)');
  });

  it('uses Microsoft\'s extended-support year for SQL Server 2022', () => {
    const sql2022 = SQL_SERVER_SUPPORT_TIMELINE.find(version => version.major === 16);

    expect(sql2022?.label).toBe('Jan 2033');
    expect(sql2022?.endDate.toISOString()).toBe('2033-01-11T23:59:59.000Z');
  });

  it('includes SQL Server 2025 in the extended-support timeline', () => {
    const sql2025 = SQL_SERVER_SUPPORT_TIMELINE.find(version => version.major === 17);

    expect(sql2025?.label).toBe('Jan 2036');
    expect(sql2025?.endDate.toISOString()).toBe('2036-01-06T23:59:59.000Z');
  });

  it('only includes versions that are present in the estate', () => {
    const timeline = sqlServerSupportTimelineForMajors([14, 16, '16', null]);

    expect(timeline.map(version => ({ major: version.major, count: version.count }))).toEqual([
      { major: 14, count: 1 },
      { major: 16, count: 2 },
    ]);
    expect(timeline.some(version => version.major === 11)).toBe(false);
  });
});
