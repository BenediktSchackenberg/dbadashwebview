import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../api/api';
import type { InstanceListRow } from '../api/types';
import TabNav from '../components/TabNav';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { clsx } from 'clsx';
import { format } from 'date-fns';

export default function JobsPage() {
  // Deep-link support (e.g. from the SQL Monitor overview's "Job failing"
  // alert): ?instance=<id>&tab=failed. Read once at mount.
  const [searchParams] = useSearchParams();
  const initialInstanceParam = searchParams.get('instance');

  const [tab, setTab] = useState(searchParams.get('tab') === 'failed' ? 'failed' : 'all');
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(
    initialInstanceParam != null && !Number.isNaN(Number(initialInstanceParam)) ? Number(initialInstanceParam) : null
  );
  const [recent, setRecent] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.instances()
      .then(d => setInstances(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedInstance === null) {
      setRecent([]);
      setFailures([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const [r, f] = await Promise.all([
          api.jobsRecent(selectedInstance || undefined).catch(() => []),
          api.jobsFailures(selectedInstance || undefined).catch(() => []),
        ]);
        setRecent(Array.isArray(r) ? r : []);
        setFailures(Array.isArray(f) ? f : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedInstance]);

  const data = tab === 'failed' ? failures : recent;

  const statusLabel = (s: number) => {
    if (s === 0) return { label: 'Failed', color: 'text-red-400 bg-red-400/10' };
    if (s === 1) return { label: 'Succeeded', color: 'text-emerald-400 bg-emerald-400/10' };
    if (s === 2) return { label: 'Retry', color: 'text-yellow-400 bg-yellow-400/10' };
    return { label: 'Canceled', color: 'text-gray-400 bg-gray-400/10' };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Jobs</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedInstance ?? ''}
            onChange={e => setSelectedInstance(e.target.value === '' ? null : Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Select an instance</option>
            <option value="0">All Instances (can be slow)</option>
            {instances.map(inst => (
              <option key={inst.InstanceID} value={inst.InstanceID}>
                {inst.InstanceDisplayName || inst.Instance}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
          </span>
        </div>
      </div>

      {selectedInstance === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Loading all instances can take a while on larger environments.
        </div>
      )}

      {selectedInstance === null ? (
        <div className="glass rounded-xl p-6 gradient-border">
          <EmptyState message="Select an instance to load jobs" />
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
