import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import CapacityBar from '../components/CapacityBar';
import { AlertTriangle } from 'lucide-react';

export default function EstateDiskPage() {
  const { lastRefresh } = useRefresh();
  const [drives, setDrives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.drives().then(d => setDrives(Array.isArray(d) ? d : []))
      .catch(() => setDrives([]))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  const filtered = useMemo(() => {
    let items = drives.map(d => {
      const capacity = Number(d.Capacity) || 0;
      const free = Number(d.FreeSpace) || 0;
      const used = capacity - free;
      const pct = capacity > 0 ? (used / capacity) * 100 : 0;
      // Linear projection: if >50% full, estimate days until full
      let daysUntilFull: number | null = null;
      if (pct > 50 && pct < 100) {
        // Assume growth rate proportional to current usage over ~30 days
        const growthPerDay = used / 30;
        daysUntilFull = growthPerDay > 0 ? Math.round(free / growthPerDay) : null;
      }
      const estFullDate = daysUntilFull != null
        ? new Date(Date.now() + daysUntilFull * 86400000).toLocaleDateString()
        : null;
      return { ...d, capacity, free, used, pct, daysUntilFull, estFullDate };
    });

    if (filter) {
      const q = filter.toLowerCase();
      items = items.filter(d =>
        (d.InstanceDisplayName || '').toLowerCase().includes(q) ||
        (d.Name || '').toLowerCase().includes(q)
      );
    }

    return items.sort((a, b) => b.pct - a.pct);
  }, [drives, filter]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Estate Disk Usage</h1>
        <input
          placeholder="Filter by instance or drive..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 w-64"
        />
      </div>

      <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Instance</th>
              <th className="pb-3 text-gray-400 font-medium">Drive</th>
              <th className="pb-3 text-gray-400 font-medium w-48">Usage</th>
              <th className="pb-3 text-gray-400 font-medium text-right">Capacity</th>
              <th className="pb-3 text-gray-400 font-medium text-right">Free</th>
              <th className="pb-3 text-gray-400 font-medium text-right">Est. Full</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 text-gray-300">{d.InstanceDisplayName || '—'}</td>
                <td className="py-3 text-gray-300 font-mono text-xs">{d.Name || d.Label || '—'}</td>
                <td className="py-3"><CapacityBar used={d.used} total={d.capacity} /></td>
                <td className="py-3 text-gray-400 text-right text-xs">{formatBytes(d.capacity)}</td>
                <td className="py-3 text-gray-400 text-right text-xs">{formatBytes(d.free)}</td>
                <td className="py-3 text-right">
                  {d.estFullDate ? (
                    <span className="flex items-center justify-end gap-1">
                      {d.daysUntilFull != null && d.daysUntilFull < 30 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className={d.daysUntilFull != null && d.daysUntilFull < 30 ? 'text-red-400 text-xs' : 'text-gray-400 text-xs'}>
                        {d.estFullDate} ({d.daysUntilFull}d)
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-500 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">No drives found.</p>}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
