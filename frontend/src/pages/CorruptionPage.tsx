import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import type { CorruptionRow } from '../api/types';
import { useRefresh } from '../App';
import { hasRole } from '../auth/session';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { ShieldAlert, ShieldCheck, Check } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';

export default function CorruptionPage() {
  const { id } = useParams();
  const { lastRefresh } = useRefresh();
  const [rows, setRows] = useState<CorruptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackingId, setAckingId] = useState<number | null>(null);
  const canAcknowledge = hasRole(['Admin', 'Operator']);

  const load = () => {
    setLoading(true);
    api.corruption(id ? Number(id) : undefined)
      .then(res => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id, lastRefresh]);

  const acknowledge = async (databaseId: number) => {
    setAckingId(databaseId);
    try {
      await api.acknowledgeCorruption(databaseId, false);
      load();
    } finally {
      setAckingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  const openCount = rows.filter(r => !r.isAcknowledged).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-400" /> {id ? 'Instance Corruption Findings' : 'Corruption Findings'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Real consistency-check findings from msdb.suspect_pages and the mirroring/HADR auto-page-repair
          history (dbo.Corruption) — {rows.length} finding{rows.length !== 1 ? 's' : ''}
          {openCount > 0 && <span className="text-red-400"> · {openCount} unacknowledged</span>}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No corruption findings recorded." />
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 text-left text-xs text-gray-400 uppercase tracking-wider">
                {!id && <th className="px-4 py-3">Instance</th>}
                <th className="px-4 py-3">Database</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Rows</th>
                <th className="px-4 py-3">Detected</th>
                <th className="px-4 py-3">Status</th>
                {canAcknowledge && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map(r => (
                <tr key={`${r.databaseId}-${r.sourceTable}`} className={clsx('hover:bg-white/5 transition-colors', !r.isAcknowledged && 'bg-red-500/5')}>
                  {!id && <td className="px-4 py-2.5 text-gray-300">{r.instanceDisplayName || '—'}</td>}
                  <td className="px-4 py-2.5 text-white font-medium">{r.databaseName || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-300 text-xs">{r.source}</td>
                  <td className="px-4 py-2.5 text-right text-gray-300">{r.countOfRows ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{r.updateDate ? format(new Date(r.updateDate), 'yyyy-MM-dd HH:mm') : '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.isAcknowledged ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> Acknowledged
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400">
                        <ShieldAlert className="w-3.5 h-3.5" /> Open
                      </span>
                    )}
                  </td>
                  {canAcknowledge && (
                    <td className="px-4 py-2.5 text-right">
                      {!r.isAcknowledged && (
                        <button
                          onClick={() => acknowledge(r.databaseId)}
                          disabled={ackingId === r.databaseId}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                        >
                          <Check className="w-3 h-3" /> {ackingId === r.databaseId ? 'Acknowledging…' : 'Acknowledge'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
