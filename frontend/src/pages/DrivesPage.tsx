import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import type { EstateDriveRow, InstanceDriveRow } from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CapacityBar from '../components/CapacityBar';
import { HardDrive, ArrowUpDown, RefreshCw, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type DriveRow = (EstateDriveRow | InstanceDriveRow) & { InstanceDisplayName?: string | null };

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes > 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function getUsedPercent(drive: DriveRow): number {
  if (!drive.Capacity || drive.Capacity <= 0) return 0;
  return ((drive.Capacity - (drive.FreeSpace || 0)) / drive.Capacity) * 100;
}

export default function DrivesPage() {
  const { id } = useParams();
  const [drives, setDrives] = useState<DriveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [selectedInstance, setSelectedInstance] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const data = id
          ? await api.instanceDrives(Number(id)).catch(() => [])
          : await api.drives().catch(() => []);
        setDrives(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Unique drive names and instances for filter dropdowns
  const driveNames = useMemo(() => {
    const names = new Set(drives.map(d => d.Name).filter(Boolean) as string[]);
    return [...names].sort();
  }, [drives]);

  const instanceNames = useMemo(() => {
    if (id) return []; // already instance-filtered
    const names = new Set(drives.map(d => d.InstanceDisplayName).filter(Boolean) as string[]);
    return [...names].sort();
  }, [drives, id]);

  const filtered = useMemo(() => {
    return drives.filter(d =>
      (!selectedDrive || d.Name === selectedDrive) &&
      (!selectedInstance || d.InstanceDisplayName === selectedInstance)
    );
  }, [drives, selectedDrive, selectedInstance]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) =>
      sortDesc ? getUsedPercent(b) - getUsedPercent(a) : getUsedPercent(a) - getUsedPercent(b)
    ), [filtered, sortDesc]);

  if (loading) return <LoadingSpinner />;

  const criticalCount = sorted.filter(d => getUsedPercent(d) >= 85).length;
  const warnCount = sorted.filter(d => getUsedPercent(d) >= 70 && getUsedPercent(d) < 85).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{id ? 'Instance Drives' : 'Drives'}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {sorted.length} drives{id ? '' : ' across all instances'}
            {criticalCount > 0 && <span className="ml-2 text-red-400">· {criticalCount} critical (&gt;85%)</span>}
            {warnCount > 0 && <span className="ml-2 text-yellow-400">· {warnCount} warning (&gt;70%)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Instance filter (estate view only) */}
          {!id && instanceNames.length > 0 && (
            <select
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            >
              <option value="">All Instances</option>
              {instanceNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          {/* Drive name filter */}
          {driveNames.length > 1 && (
            <select
              value={selectedDrive}
              onChange={e => setSelectedDrive(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            >
              <option value="">All Drives</option>
              {driveNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setSortDesc(!sortDesc)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortDesc ? 'Most used first' : 'Least used first'}
          </button>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
          </span>
        </div>
      </div>

      {/* Active filters badge */}
      {(selectedDrive || selectedInstance) && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Filter className="w-3 h-3" />
          <span>Filtering by:</span>
          {selectedInstance && (
            <span className="px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">
              {selectedInstance}
              <button onClick={() => setSelectedInstance('')} className="ml-1 hover:text-white">×</button>
            </span>
          )}
          {selectedDrive && (
            <span className="px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400">
              {selectedDrive}
              <button onClick={() => setSelectedDrive('')} className="ml-1 hover:text-white">×</button>
            </span>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="No drive data available" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((drive, i) => {
            const pct = getUsedPercent(drive);
            const usedBytes = (drive.Capacity || 0) - (drive.FreeSpace || 0);
            const borderColor = pct >= 85 ? 'border-red-500/30' : pct >= 70 ? 'border-yellow-500/30' : 'border-white/5';
            const iconColor = pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-blue-400';
            return (
              <motion.div
                key={drive.DriveID || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={clsx('glass rounded-xl p-5 border', borderColor)}
              >
                {/* Drive header */}
                <div className="flex items-start gap-3 mb-4">
                  <HardDrive className={clsx('w-5 h-5 mt-0.5 shrink-0', iconColor)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{drive.Name || '—'}</p>
                      <span className={clsx('text-xs font-bold shrink-0',
                        pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-green-400'
                      )}>{pct.toFixed(1)}%</span>
                    </div>
                    {drive.Label && (
                      <p className="text-xs text-gray-500 truncate">{drive.Label}</p>
                    )}
                    {!id && drive.InstanceDisplayName && (
                      <p className="text-xs text-gray-500 truncate">{drive.InstanceDisplayName}</p>
                    )}
                  </div>
                </div>

                {/* Capacity bar */}
                <CapacityBar used={usedBytes} total={drive.Capacity || 0} />

                {/* Details grid */}
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500">Used</p>
                    <p className="text-white font-medium">{formatBytes(usedBytes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">Free</p>
                    <p className={clsx('font-medium', pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-gray-300')}>
                      {formatBytes(drive.FreeSpace)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">Total</p>
                    <p className="text-gray-300 font-medium">{formatBytes(drive.Capacity)}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
