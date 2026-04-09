import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/api';
import TabNav from '../components/TabNav';
import LoadingSpinner from '../components/LoadingSpinner';
import PaginationBar from '../components/PaginationBar';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { usePresentationOptional } from '../context/PresentationContext';

export default function JobsPage() {
  const { dataGridTableClass, dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [tab, setTab] = useState('all');
  const [recent, setRecent] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(2000);
  const [offsetRecent, setOffsetRecent] = useState(0);
  const [offsetFailures, setOffsetFailures] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, f] = await Promise.all([
          api.jobsRecent(limit, offsetRecent).catch(() => []),
          api.jobsFailures(limit, offsetFailures).catch(() => []),
        ]);
        setRecent(Array.isArray(r) ? r : []);
        setFailures(Array.isArray(f) ? f : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [limit, offsetRecent, offsetFailures]);

  if (loading) return <LoadingSpinner />;

  const data = tab === 'failed' ? failures : recent;

  const statusLabel = (s: number) => {
    if (isDesktopData) {
      if (s === 0) return { label: 'Failed', color: 'dba-cell-crit text-xs px-2 py-0.5 inline-block' };
      if (s === 1) return { label: 'Succeeded', color: 'dba-cell-ok text-xs px-2 py-0.5 inline-block' };
      if (s === 2) return { label: 'Retry', color: 'dba-cell-warn text-xs px-2 py-0.5 inline-block' };
      return { label: 'Canceled', color: 'dba-cell-na text-xs px-2 py-0.5 inline-block' };
    }
    if (s === 0) return { label: 'Failed', color: 'text-red-400 bg-red-400/10' };
    if (s === 1) return { label: 'Succeeded', color: 'text-emerald-400 bg-emerald-400/10' };
    if (s === 2) return { label: 'Retry', color: 'text-yellow-400 bg-yellow-400/10' };
    return { label: 'Canceled', color: 'text-gray-400 bg-gray-400/10' };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Jobs</h1>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
        </span>
      </div>
      <TabNav
        tabs={[
          { key: 'all', label: 'All Recent', count: recent.length },
          { key: 'failed', label: 'Failed (24h)', count: failures.length },
        ]}
        active={tab}
        onChange={k => {
          setTab(k);
        }}
      />
      <PaginationBar
        offset={tab === 'failed' ? offsetFailures : offsetRecent}
        limit={limit}
        rowCount={data.length}
        onOffsetChange={tab === 'failed' ? setOffsetFailures : setOffsetRecent}
        onLimitChange={n => {
          setLimit(n);
          setOffsetRecent(0);
          setOffsetFailures(0);
        }}
      />
      <div className={isDesktopData ? dataGridShellClass : 'glass rounded-xl overflow-hidden'}>
        <table className={clsx(isDesktopData ? dataGridTableClass : 'w-full text-sm')}>
          <thead>
            <tr className={isDesktopData ? '' : 'border-b border-white/10'}>
              <th className={clsx(!isDesktopData && 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase')}>Status</th>
              <th className={clsx(!isDesktopData && 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase')}>Job/Step</th>
              <th className={clsx(!isDesktopData && 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase')}>Instance</th>
              <th className={clsx(!isDesktopData && 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase')}>Time</th>
              <th className={clsx(!isDesktopData && 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase')}>Duration</th>
            </tr>
          </thead>
          <tbody className={isDesktopData ? '' : 'divide-y divide-white/5'}>
            {data.map((j, i) => {
              const s = statusLabel(j.run_status);
              return (
                <tr key={i} className={isDesktopData ? '' : 'hover:bg-slate-800/50'}>
                  <td className={clsx(!isDesktopData && 'px-4 py-2.5')}>
                    <span className={clsx(!isDesktopData && 'text-xs px-2 py-0.5 rounded', s.color)}>{s.label}</span>
                  </td>
                  <td className={clsx('text-xs', !isDesktopData && 'px-4 py-2.5 text-white', isDesktopData && 'text-black')}>
                    {j.step_name || j.job_id || '—'}
                  </td>
                  <td className={clsx('text-xs', !isDesktopData && 'px-4 py-2.5 text-gray-400', isDesktopData && 'text-gray-800')}>
                    {j.InstanceDisplayName || '—'}
                  </td>
                  <td className={clsx('text-xs', !isDesktopData && 'px-4 py-2.5 text-gray-400', isDesktopData && 'text-gray-800')}>
                    {j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : '—'}
                  </td>
                  <td className={clsx('text-xs', !isDesktopData && 'px-4 py-2.5 text-gray-400', isDesktopData && 'text-gray-800')}>
                    {j.RunDurationSec != null ? `${j.RunDurationSec}s` : '—'}
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className={clsx('py-8 text-center', isDesktopData ? 'text-gray-600' : 'px-4 text-gray-500')}>
                  No jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
