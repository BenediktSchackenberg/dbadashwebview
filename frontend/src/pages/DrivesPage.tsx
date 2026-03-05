import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CapacityBar from '../components/CapacityBar';
import { HardDrive, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export default function DrivesPage() {
  const { id } = useParams();
  const [drives, setDrives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.drives().catch(() => []);
        setDrives(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const filteredDrives = id ? drives.filter((d: any) => String(d.instanceID || d.InstanceID) === id) : drives;

  const formatBytes = (b: number) => {
    if (!b) return '—';
    if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`;
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    return `${(b / 1e6).toFixed(1)} MB`;
  };

  const getPct = (d: any) => d.Capacity > 0 ? ((d.Capacity - d.FreeSpace) / d.Capacity) * 100 : 0;

  const sorted = [...filteredDrives].sort((a, b) => sortDesc ? getPct(b) - getPct(a) : getPct(a) - getPct(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{id ? 'Instance Drives' : 'Drives'}</h1>
          <p className="text-sm text-gray-400">{filteredDrives.length} drives{id ? '' : ' across all instances'}</p>
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
          {sorted.map((d: any, i: number) => {
            const pct = getPct(d);
            const borderColor = pct >= 85 ? 'border-red-500/20' : pct >= 70 ? 'border-yellow-500/20' : 'border-white/5';
            return (
              <motion.div
                key={d.DriveID || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={clsx('glass rounded-xl p-6 border', borderColor)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <HardDrive className={clsx('w-5 h-5', pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-blue-400')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{d.Name}</p>
                    <p className="text-xs text-gray-500">{d.InstanceDisplayName || '—'}</p>
                  </div>
                </div>
                <CapacityBar used={(d.Capacity || 0) - (d.FreeSpace || 0)} total={d.Capacity || 0} />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{formatBytes(d.FreeSpace)} free</span>
                  <span>{formatBytes(d.Capacity)} total</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
