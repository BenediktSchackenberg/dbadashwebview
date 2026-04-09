import { useEffect } from 'react';

const APP = 'DBA Dash';

function titleForPath(pathname: string): string {
  if (!pathname || pathname === '/') return 'Dashboard';

  const p = pathname.split('/').filter(Boolean);
  const last = p[p.length - 1] ?? '';

  if (p[0] === 'instances' && p.length === 2 && /^\d+$/.test(p[1]!)) {
    return `Instance #${p[1]}`;
  }
  if (p[0] === 'instances' && p[2] === 'databases' && p[3] && /^\d+$/.test(p[3])) {
    return `Database #${p[3]}`;
  }
  if (p[0] === 'windows-screens') return 'WinForms map';
  if (p[0] === 'windows-parity') return 'Windows parity';
  if (p[0] === 'tools' && p[1] === 'community') return 'Community tools';
  if (p[0] === 'tools' && p[1] === 'custom-reports') return 'Custom reports';
  if (p[0] === 'settings' && p[1] === 'alerts') return 'Alert settings';
  if (p[0] === 'settings' && p[1] === 'servers') return 'Servers';
  if (p[0] === 'settings' && p[1] === 'groups') return 'Groups';
  if (p[0] === 'settings' && p[1] === 'users') return 'Users';
  if (p[0] === 'settings' && p[1] === 'retention') return 'Retention';
  if (p[0] === 'settings' && p[1] === 'thresholds') return 'Thresholds';
  if (p[0] === 'performance' && p[1] === 'running-queries') return 'Running queries';
  if (p[0] === 'performance' && p[1] === 'slow-queries') return 'Slow queries';
  if (p[0] === 'performance' && p[1] === 'exec-stats') return 'Exec stats';
  if (p[0] === 'performance' && p[1] === 'waits-timeline') return 'Waits';
  if (p[0] === 'performance' && p[1] === 'query-store') return 'Query Store';
  if (p[0] === 'monitoring' && p[1] === 'job-timeline') return 'Job timeline';
  if (p[0] === 'monitoring' && p[1] === 'db-space') return 'DB space';
  if (p[0] === 'monitoring' && p[1] === 'corruption-checkdb') return 'Corruption / CHECKDB';
  if (p[0] === 'monitoring' && p[1] === 'drive-history') return 'Drive history';
  if (p[0] === 'reports' && p[1] === 'fleet-stats') return 'Fleet stats';
  if (p[0] === 'reports' && p[1] === 'backup-ampel') return 'Backup ampel';

  if (/^\d+$/.test(last)) return `Page #${last}`;

  return last
    .split('-')
    .map(w => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

export function useDocumentTitle(pathname: string) {
  useEffect(() => {
    document.title = `${titleForPath(pathname)} · ${APP}`;
  }, [pathname]);
}
