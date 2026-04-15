import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import type { EstateDriveRow, InstanceDriveRow } from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CapacityBar from '../components/CapacityBar';
import { HardDrive, ArrowUpDown, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type DriveRow = (EstateDriveRow | InstanceDriveRow) & { InstanceDisplayName?: string | null };

function formatBytes(bytes: number): string {
  if (!bytes) return 'â€”';
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

  if (loading) return <LoadingSpinner />;

  const sorted = [...drives].sort((a, b) => sortDesc ? getUsedPercent(b) - getUsedPercent(a) : getUsedPercent(a) - getUsedPercent(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">{id ? 'Instance Drives' : 'Drives'}</h1>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
            </span>
          </div>
          <p className="text-sm text-gray-400">{sorted.length} drives{id ? '' : ' across all instances'}</p>
        </div>
        <button
          onClick={() => setSortDesc(!sortDesc)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-slate-800/50 transition-all"
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortDesc ? 'Most used first' : 'Least used first'}
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState message="No drive data available" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((drive, i) => {
            const pct = getUsedPercent(drive);
            const borderColor = pct >= 85 ? 'border-red-500/20' : pct >= 70 ? 'border-yellow-500/20' : 'border-white/5';
            return (
              <motion.div
                key={drive.DriveID || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={clsx('glass rounded-xl p-6 border', borderColor)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <HardDrive className={clsx('w-5 h-5', pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-blue-400')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{drive.Name}</p>
                    <p className="text-xs text-gray-500">{drive.InstanceDisplayName || 'â€”'}</p>
                  </div>
                </div>
                <CapacityBar used={(drive.Capacity || 0) - (drive.FreeSpace || 0)} total={drive.Capacity || 0} />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{formatBytes(drive.FreeSpace || 0)} free</span>
                  <span>{formatBytes(drive.Capacity || 0)} total</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
