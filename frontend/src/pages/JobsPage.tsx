import { useEffect, useState } from 'react';
import { api } from '../api/api';
import TabNav from '../components/TabNav';
import LoadingSpinner from '../components/LoadingSpinner';
import { clsx } from 'clsx';
import { format } from 'date-fns';

export default function JobsPage() {
  const [tab, setTab] = useState('all');
  const [recent, setRecent] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [r, f] = await Promise.all([
          api.jobsRecent().catch(() => []),
          api.jobsFailures().catch(() => []),
        ]);
        setRecent(Array.isArray(r) ? r : []);
        setFailures(Array.isArray(f) ? f : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const data = tab === 'failed' ? failures : recent;

  const statusLabel = (s: number) => {
    if (s === 0) return { label: 'Failed', color: 'text-red-400 bg-red-400/10' };
    if (s === 1) return { label: 'Succeeded', color: 'text-emerald-400 bg-emerald-400/10' };
    if (s === 2) return { label: 'Retry', color: 'text-yellow-400 bg-yellow-400/10' };
    return { label: 'Canceled', color: 'text-gray-400 bg-gray-400/10' };
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Jobs</h1>
      <TabNav
        tabs={[
          { key: 'all', label: 'All Recent', count: recent.length },
          { key: 'failed', label: 'Failed (24h)', count: failures.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Job/Step</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Instance</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((j, i) => {
              const s = statusLabel(j.run_status);
              return (
                <tr key={i} className="hover:bg-slate-800/50">
                  <td className="px-4 py-2.5"><span className={clsx('text-xs px-2 py-0.5 rounded', s.color)}>{s.label}</span></td>
                  <td className="px-4 py-2.5 text-white text-xs">{j.step_name || j.job_id || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{j.InstanceDisplayName || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{j.RunDurationSec != null ? `${j.RunDurationSec}s` : '—'}</td>
                </tr>
              );
            })}
            {data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No jobs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
